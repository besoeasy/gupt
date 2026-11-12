import { reactive, ref, shallowReactive } from "vue";

import { api } from "@/lib/api";
import { createLiveSubscription } from "@/lib/relay/liveSubscription";
import { broadcastCacheEvent, initCacheBroadcast } from "@/lib/cacheBroadcast";
import { formatCallEventText, isCallSignalType } from "@/lib/webrtc";
import { isCountableChatRow } from "@/lib/chatListUtils";
import { dmRoomId, normalizePubkey, shortId } from "@/lib/crypto";
import { debugLog } from "@/lib/debugLog";
import { groupsApi, decryptLocalGroupRows } from "@/lib/groups";
import {
  getRawEventsByIds,
  getRoomMeta,
  getStoredGroup,
  listGroupEvents,
  listRoomEvents,
  listRoomMeta,
  listStoredGroups,
  listUnappliedRawEvents,
  markRawEventsApplied,
  putRoomMeta,
  putStoredGroup,
  indexRoomMessage,
} from "@/lib/idb";
import { decryptRows } from "@/lib/decryptCache";
import { playMessageSound } from "@/lib/notifications";
import { clearAllReplyReminders, clearReplyReminderDismiss } from "@/lib/replyReminders";
import { publishLocal, requestEngineSync, waitForRelayAck } from "@/lib/engine";
import {
  onEngineAcked,
  onEngineIngested,
  startEngineBridge,
  stopEngineBridge,
} from "@/lib/engine/bridge";

const roomMessages = shallowReactive({});
const roomMeta = shallowReactive({});
const groupMessages = shallowReactive({});
const groupMeta = shallowReactive({});

const hydratedInbox = ref(false);
const hydratedRooms = new Set();
const hydratedGroups = new Set();
const hydratingRooms = reactive(new Set());
const hydratingGroups = reactive(new Set());
const roomHydrationPromises = new Map();

const activePubkey = ref("");

let activeConversationId = "";
let lastBackfillAt = 0;
let backfillPromise = null;

const BACKFILL_THROTTLE_MS = 30_000;
const BACKGROUND_HYDRATE_ROOMS = 5;
const GAP_FILL_MIN_MS = 8_000;

let lastGapFillAt = 0;

/**
 * Freeze the signing identity at prepare time. Sends sit in a queue and run
 * later; without a snapshot a queued group fan-out would read the identity
 * again at flush time and get signed by whichever account is active then —
 * landing under a different room than the one it was shown in.
 */
function snapshotIdentity(identity) {
  const privkeyHex = identity?.privkeyHex;
  const pubkeyHex = normalizePubkey(identity?.pubkeyHex);
  if (!privkeyHex || !pubkeyHex) {
    throw new Error("No account is loaded. Open /welcome to restore one.");
  }
  return Object.freeze({ privkeyHex, pubkeyHex });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAT_TYPES = new Set([
  "text",
  "voice",
  "media",
  "location",
  "like",
  "react",
  "edit",
  "call-event",
  "call-request",
  "read",
]);
const PREVIEWABLE_TYPES = new Set(["text", "voice", "media", "location"]);
const TRUST_ADVANCING_TYPES = new Set([
  "text",
  "voice",
  "media",
  "location",
  "call-event",
  "call-request",
]);
const CALL_TRUST_THRESHOLD = 7;

function isChatRow(row) {
  if (!row?.type) return false;
  const kind = Number(row.kind ?? row.created_at_kind ?? 0);
  if (kind >= 20000 && kind <= 29999) return false;
  if (row.isEphemeral) return false;
  return CHAT_TYPES.has(row.type);
}

function tsOf(row) {
  return Number(row?.ts || row?.created_at || 0);
}

function previewText(row) {
  if (!row) return "";
  if (row.type === "call-event") return String(row.text || "Call");
  if (row.type === "text") return String(row.text || "");
  if (row.type === "voice") return "🎤 Voice note";
  if (row.type === "location") {
    return row.label ? `📍 ${row.label}` : "📍 Location";
  }
  if (row.type === "media") {
    const mime = row.media?.mime || "";
    if (mime.startsWith("image/")) return "📷 Photo";
    if (mime.startsWith("video/")) return "🎥 Video";
    return `📎 ${row.text || "File"}`;
  }
  return "";
}

/** Insert or merge a row into a sorted message array. Returns a new array. */
function upsertMessage(list, row) {
  const idx = list.findIndex((entry) => entry.id === row.id);
  if (idx >= 0) {
    const merged = { ...list[idx], ...row };
    // Preserve "sent"/"failed" status when the relay echo lacks one.
    if (!row.status && list[idx].status) merged.status = list[idx].status;
    const next = list.slice();
    next[idx] = merged;
    return next;
  }
  const next = list.slice();
  next.push(row);
  next.sort((a, b) => tsOf(a) - tsOf(b) || String(a.id).localeCompare(String(b.id)));
  return next;
}

function removeMessage(list, id) {
  return list.filter((entry) => entry.id !== id);
}

function markMessageStatus(list, id, status) {
  const idx = list.findIndex((entry) => entry.id === id);
  if (idx < 0) return list;
  const next = list.slice();
  next[idx] = { ...next[idx], status };
  return next;
}

function shouldCountUnread(roomId, row) {
  if (!roomId || row?.mine) return false;
  if (!isCountableChatRow(row)) return false;
  if (roomId === activeConversationId) return false;
  return true;
}

function buildRoomMetaPatch(existing, row, peerPubkey, roomId = existing?.roomId) {
  const ts = tsOf(row);
  const previewable = PREVIEWABLE_TYPES.has(row.type);
  const newer = ts >= Number(existing?.lastMessageTs || 0);
  const countUnread = shouldCountUnread(roomId, row);

  return {
    roomId: existing?.roomId || roomId,
    peerPubkey: peerPubkey || existing?.peerPubkey || "",
    type: existing?.type || "dm",
    name: existing?.name || (peerPubkey ? `DM · ${shortId(peerPubkey)}` : existing?.name || ""),
    lastMessageTs: Math.max(Number(existing?.lastMessageTs || 0), ts),
    ...(previewable && newer
      ? {
          lastMessageText: previewText(row),
          lastMessageMine: Boolean(row.mine),
        }
      : {}),
    ...(previewable && !row.mine && ts >= Number(existing?.lastInboundTs || 0)
      ? { lastInboundTs: ts }
      : {}),
    ...(countUnread ? { unreadDelta: 1 } : {}),
    updatedAt: Date.now(),
  };
}

function buildGroupUnreadPatch(groupId, row) {
  if (!groupId || row?.mine || !isCountableChatRow(row)) return {};
  if (groupId === activeConversationId) return {};
  return { unreadDelta: 1 };
}

// ---------------------------------------------------------------------------
// Hydration (Dexie → store)
// ---------------------------------------------------------------------------

async function hydrateInbox(force = false) {
  if (hydratedInbox.value && !force) return;
  const [rooms, groups] = await Promise.all([
    listRoomMeta().catch(() => []),
    listStoredGroups().catch(() => []),
  ]);
  for (const meta of rooms) {
    if (meta?.roomId) roomMeta[meta.roomId] = meta;
  }
  const liveGroupIds = new Set();
  for (const meta of groups) {
    if (!meta?.groupId || meta.isRemoved) continue;
    liveGroupIds.add(meta.groupId);
    groupMeta[meta.groupId] = meta;
  }
  // Drop removed/deleted groups from the reactive map.
  for (const key of Object.keys(groupMeta)) {
    if (!liveGroupIds.has(key)) delete groupMeta[key];
  }
  hydratedInbox.value = true;
  void backgroundHydrateTopRooms();
}

async function backgroundHydrateTopRooms() {
  const rooms = Object.values(roomMeta)
    .sort((a, b) => Number(b.lastMessageTs || 0) - Number(a.lastMessageTs || 0))
    .slice(0, BACKGROUND_HYDRATE_ROOMS);
  for (const room of rooms) {
    if (room?.roomId && !hydratedRooms.has(room.roomId)) {
      void hydrateRoom(room.roomId);
    }
  }
}

async function refreshInboxFromDexie(force = true) {
  await hydrateInbox(force);
}

async function refreshRoomFromDexie(roomId) {
  const id = String(roomId || "");
  if (!id) return;
  hydratedRooms.delete(id);
  await hydrateRoom(id);
}

async function refreshGroupFromDexie(groupId) {
  const id = String(groupId || "");
  if (!id) return;
  hydratedGroups.delete(id);
  await hydrateGroup(id);
}

async function loadRoomMessages(roomId) {
  const rawRows = await listRoomEvents(roomId).catch(() => []);
  if (rawRows.length && _currentIdentity?.privkeyHex) {
    const decrypted = await decryptRows(
      _currentIdentity.privkeyHex,
      _currentIdentity.pubkeyHex,
      rawRows,
    ).catch(() => []);
    return decrypted;
  }
  return [];
}

async function loadGroupMessages(groupId) {
  const rawRows = await listGroupEvents(groupId).catch(() => []);
  if (rawRows.length && _currentIdentity?.privkeyHex) {
    return decryptLocalGroupRows(
      _currentIdentity.privkeyHex,
      _currentIdentity.pubkeyHex,
      rawRows,
    ).catch(() => []);
  }
  return [];
}

async function hydrateRoom(roomId) {
  if (!roomId) return;
  let pending = roomHydrationPromises.get(roomId);
  if (!pending) {
    if (hydratedRooms.has(roomId)) {
      void requestEngineSync();
      return;
    }
    hydratedRooms.add(roomId);
    hydratingRooms.add(roomId);
    pending = loadRoomFromCache(roomId)
      .catch((err) => {
        hydratedRooms.delete(roomId);
        throw err;
      })
      .finally(() => {
        hydratingRooms.delete(roomId);
        roomHydrationPromises.delete(roomId);
      });
    roomHydrationPromises.set(roomId, pending);
  }
  await pending;
  void requestEngineSync();
}

async function loadRoomFromCache(roomId) {
  const [meta, msgs] = await Promise.all([
    getRoomMeta(roomId).catch(() => null),
    loadRoomMessages(roomId),
  ]);
  if (meta) roomMeta[roomId] = meta;

  const existing = roomMessages[roomId] || [];
  const seen = new Set(existing.map((m) => m.id));
  const merged = existing.slice();
  let added = false;
  let mergeSkipped = 0;
  for (const m of msgs) {
    if (!seen.has(m.id)) {
      merged.push(m);
      seen.add(m.id);
      added = true;
    } else {
      mergeSkipped++;
    }
  }
  if (added) {
    merged.sort((a, b) => tsOf(a) - tsOf(b) || String(a.id).localeCompare(String(b.id)));
  }
  roomMessages[roomId] = merged;

  const existingMeta = roomMeta[roomId] || { roomId };
  if (!existingMeta.lastInboundTs && merged.length) {
    let lastInboundTs = 0;
    for (const row of merged) {
      if (!row.mine && PREVIEWABLE_TYPES.has(row.type)) {
        lastInboundTs = Math.max(lastInboundTs, tsOf(row));
      }
    }
    if (lastInboundTs > 0) {
      const patch = { lastInboundTs };
      roomMeta[roomId] = { ...existingMeta, ...patch };
      void putRoomMeta(roomId, patch).catch(() => {});
    }
  }

  if (!roomMeta[roomId]?.peerPubkey && merged.length) {
    const peer =
      merged.find((row) => row.peerPubkey)?.peerPubkey ||
      merged.find((row) => !row.mine && row.sender)?.sender ||
      "";
    if (peer) {
      const patch = {
        peerPubkey: peer,
        name: roomMeta[roomId]?.name || `DM · ${shortId(peer)}`,
        type: "dm",
      };
      roomMeta[roomId] = { ...(roomMeta[roomId] || { roomId }), ...patch };
      void putRoomMeta(roomId, patch).catch(() => {});
    }
  }
}

async function hydrateGroup(groupId) {
  if (!groupId || hydratedGroups.has(groupId)) return;
  hydratedGroups.add(groupId);
  hydratingGroups.add(groupId);
  try {
    const meta = await getStoredGroup(groupId).catch(() => null);
    if (meta) groupMeta[groupId] = meta;
    const msgs = await loadGroupMessages(groupId);

    const existing = groupMessages[groupId] || [];
    const seen = new Set(existing.map((m) => m.id));
    const merged = existing.slice();
    let added = false;
    for (const m of msgs) {
      if (!seen.has(m.id)) {
        merged.push(m);
        seen.add(m.id);
        added = true;
      }
    }
    if (added) {
      merged.sort((a, b) => tsOf(a) - tsOf(b) || String(a.id).localeCompare(String(b.id)));
    }
    groupMessages[groupId] = merged;
  } finally {
    hydratingGroups.delete(groupId);
  }
}

async function ingestRoomRow(roomId, peerPubkey, row, options = {}) {
  if (!roomId || !row?.id) return false;
  const persist = options.persist !== false;

  const list = roomMessages[roomId] || [];
  const isNew = !list.some((entry) => entry.id === row.id);
  debugLog(
    `ingest room=${shortId(roomId)} id=${row.id?.slice(0, 12)} type=${row.type} mine=${row.mine} isNew=${isNew} persist=${persist} silent=${Boolean(options.silent)}`,
  );
  roomMessages[roomId] = upsertMessage(list, row);

  const existingMeta = roomMeta[roomId] || { roomId };
  const patch = buildRoomMetaPatch(existingMeta, row, peerPubkey, roomId);
  if (!isNew) delete patch.unreadDelta;
  const unreadCount = Math.max(
    0,
    Number(existingMeta?.unreadCount || 0) + Number(patch.unreadDelta || 0),
  );
  const nextMeta = { ...existingMeta, ...patch, unreadCount };
  roomMeta[roomId] = nextMeta;

  if (PREVIEWABLE_TYPES.has(row.type) && !row.mine) {
    clearReplyReminderDismiss(roomId);
  }

  if (persist) {
    void indexRoomMessage(roomId, row).catch(() => {});
    void putRoomMeta(roomId, patch).catch(() => {});
    broadcastCacheEvent({ type: "room-message", roomId });
  }
  return isNew;
}

async function ingestIncomingDirectMessage(identity, row, options = {}) {
  if (row?.id) void markRawEventsApplied([row.id]);
  const selfPubkey = normalizePubkey(identity.pubkeyHex);
  const peerPubkey = normalizePubkey(row?.peerPubkey);
  if (!selfPubkey || !peerPubkey) return;

  // Legacy group fan-out copies still arrive as tagged kind-4 DMs.
  if (row.isGroup && row.groupId) {
    await ingestIncomingGroupMessage(identity, row, options);
    return;
  }

  if (!isChatRow(row)) return;

  const roomId = await dmRoomId(selfPubkey, peerPubkey);

  const normalizedRow = { ...row, peerPubkey, status: row.mine ? "sent" : undefined };
  if (row.type === "call-event") {
    normalizedRow.text =
      row.text || formatCallEventText(row.outcome, row.media, Number(row.durationSec || 0));
  }
  if (row.type === "call-request") {
    const kind = row.media?.video ? "Video call" : "Voice call";
    normalizedRow.text = row.text || `${kind} request`;
  }
  const inserted = await ingestRoomRow(roomId, peerPubkey, normalizedRow, options);

  if (
    inserted &&
    !options.silent &&
    !row.mine &&
    row.type !== "call-event" &&
    row.type !== "read"
  ) {
    void playMessageSound(
      `type=${row.type} id=${row.id} mine=${row.mine} roomId=${roomId} silent=${options.silent}`,
    );
  }
}

async function ingestIncomingGroupMessage(identity, row, options = {}) {
  if (row?.id) void markRawEventsApplied([row.id]);
  const selfPubkey = normalizePubkey(identity.pubkeyHex);
  const groupId = String(row?.groupId || "");
  if (!selfPubkey || !groupId) return;

  const fromMessage = await groupsApi.applyGroupFromMessage(identity, row).catch(() => null);
  if (!fromMessage?.groupId) return;

  groupMeta[fromMessage.groupId] = {
    ...(groupMeta[fromMessage.groupId] || {}),
    ...fromMessage,
  };

  if (row._event) {
    void groupsApi
      .ingestGroupMessage(identity, { ...row, origin: row.origin || "dm" })
      .catch(() => {});
  }

  const mine = row.sender === selfPubkey;
  const existedBefore = (groupMessages[fromMessage.groupId] || []).some((m) => m.id === row.id);
  debugLog(
    `group ingest groupId=${fromMessage.groupId} type=${row.type} sender=${shortId(row.sender)} mine=${mine} silent=${Boolean(options.silent)}`,
  );
  ingestGroupRow(
    fromMessage.groupId,
    { ...row, mine, peerPubkey: row.peerPubkey || selfPubkey },
    options,
  );

  if (
    !options.silent &&
    !mine &&
    !existedBefore &&
    CHAT_TYPES.has(row.type) &&
    row.type !== "read"
  ) {
    void playMessageSound(
      `type=${row.type} id=${row.id} groupId=${fromMessage.groupId} mine=${mine}`,
    );
  }
}

function ingestGroupRow(groupId, row, options = {}) {
  if (!groupId || !row?.id) return;
  const kind = Number(row.kind ?? row.created_at_kind ?? 0);
  if (kind >= 20000 && kind <= 29999) return;
  if (row.isEphemeral || !isChatRow(row)) return;
  const persist = options.persist !== false;

  let list = groupMessages[groupId] || [];

  // Replace a pending optimistic copy with its confirmed self-echo so the UI
  // never shows two copies during the send throttle window. The temp id is
  // random, so match the pending row by content instead.
  if (row.mine && row.status !== "pending") {
    const pendingMatch = list.find(
      (entry) =>
        entry.mine &&
        entry.status === "pending" &&
        entry.type === row.type &&
        String(entry.text ?? "") === String(row.text ?? "") &&
        String(entry.replyTo || "") === String(row.replyTo || "") &&
        JSON.stringify(entry.media || null) === JSON.stringify(row.media || null),
    );
    if (pendingMatch) {
      list = list.filter((entry) => entry.id !== pendingMatch.id);
    }
  }

  const isNew = !list.some((entry) => entry.id === row.id);
  groupMessages[groupId] = upsertMessage(list, row);

  const existingMeta = groupMeta[groupId];
  if (existingMeta) {
    const ts = tsOf(row);
    const isReceipt = row.type === "read";
    const bumpLastMessage = !isReceipt && ts > Number(existingMeta.lastMessageTs || 0);
    const unreadPatch = isNew ? buildGroupUnreadPatch(groupId, row) : {};
    const unreadCount = Math.max(
      0,
      Number(existingMeta.unreadCount || 0) + Number(unreadPatch.unreadDelta || 0),
    );
    const nextMeta = {
      ...existingMeta,
      ...(bumpLastMessage ? { lastMessageTs: ts } : {}),
      unreadCount,
      updatedAt: Date.now(),
    };
    groupMeta[groupId] = nextMeta;
    if (persist) {
      void putStoredGroup({
        groupId,
        ...(bumpLastMessage ? { lastMessageTs: ts } : {}),
        ...unreadPatch,
        updatedAt: nextMeta.updatedAt,
      }).catch(() => {});
      broadcastCacheEvent({ type: "group-message", groupId });
    }
  }
}

async function refreshGroupMeta(groupId) {
  if (!groupId) return;
  const meta = await getStoredGroup(groupId).catch(() => null);
  if (meta && !meta.isRemoved) groupMeta[groupId] = meta;
  else if (meta?.isRemoved) delete groupMeta[groupId];
}

function makeOptimisticDmRow(identity, payload) {
  const ts = Number(payload?.ts || Date.now());
  return {
    ...payload,
    id: payload.id || shortId(),
    sender: identity.pubkeyHex || "",
    mine: true,
    ts,
    created_at: ts,
    status: "pending",
  };
}

async function sendDirectMessage(identity, peerPubkey, payload, opts = {}) {
  const sender = snapshotIdentity(identity);
  const peer = normalizePubkey(peerPubkey);
  const self = sender.pubkeyHex;
  if (!peer) throw new Error("Invalid conversation pubkey");

  const roomId = await dmRoomId(self, peer);
  const type = String(payload?.type || "text");
  const ephemeral = type.startsWith("call-");

  const { id, event, publish } = await api.prepareDirectMessage(sender.privkeyHex, peer, payload);
  const optimistic = makeOptimisticDmRow(sender, { ...payload, id });

  if (opts.onOptimistic) {
    try {
      opts.onOptimistic(optimistic);
    } catch (err) {}
  }

  // Call signals are ephemeral: direct relay publish, never Dexie.
  if (ephemeral) {
    await publish();
    return { id };
  }

  // Local-first: the write is done once Dexie has it. The worker mirrors.
  await publishLocal(event, {
    origin: "dm",
    peerPubkey: peer,
    roomId,
    type,
  });

  await ingestRoomRow(roomId, peer, optimistic, { persist: true });

  watchRelayAck(id);
  return { id };
}

/** Background status upgrade; never blocks sends or the send queue. */
function watchRelayAck(id) {
  waitForRelayAck(id, 120000)
    .then(() => markMessageSynced(id))
    .catch(() => {
      // Still queued in the worker; onEngineAcked will upgrade it later.
    });
}

function markMessageSynced(id) {
  let touched = false;
  for (const [roomId, list] of Object.entries(roomMessages)) {
    const row = list.find((m) => m.id === id && m.mine);
    if (!row || row.status === "sent") continue;
    roomMessages[roomId] = markMessageStatus(list, id, "sent");
    touched = true;
  }
  for (const [groupId, list] of Object.entries(groupMessages)) {
    const row = list.find((m) => m.id === id && m.mine);
    if (!row || row.status === "sent") continue;
    groupMessages[groupId] = markMessageStatus(list, id, "sent");
    touched = true;
  }
  return touched;
}

async function sendGroupMessage(identity, groupId, payload, opts = {}) {
  if (!groupId) throw new Error("Missing groupId");
  const sender = snapshotIdentity(identity);
  const self = sender.pubkeyHex;

  // Build the single group event before rendering, so the optimistic row,
  // the stored event and every reply/reaction share one event id.
  const prepared = await groupsApi.prepareGroupMessage(sender, groupId, payload);
  const messagePayload = prepared.messagePayload;
  const tempId = prepared.id;
  const ts = Number(messagePayload?.ts || Date.now());

  const optimistic = {
    id: tempId,
    groupId,
    sender: self,
    type: payload?.type || "text",
    text: String(payload?.text || ""),
    ts,
    media: payload?.media || null,
    durationMs: Number(payload?.durationMs || 0),
    lat: payload?.lat ?? undefined,
    lon: payload?.lon ?? undefined,
    accuracy: payload?.accuracy ?? undefined,
    approximate: payload?.approximate ?? undefined,
    label: payload?.label ?? undefined,
    replyTo: payload?.replyTo || undefined,
    replyExcerpt: payload?.replyExcerpt || undefined,
    emoji: payload?.emoji || undefined,
    status: "pending",
    mine: true,
  };

  if (opts.onOptimistic) {
    try {
      opts.onOptimistic(optimistic);
    } catch (err) {}
  }

  ingestGroupRow(groupId, optimistic, { persist: false });

  try {
    const msg = await groupsApi.sendGroupMessage(sender, groupId, payload, { prepared });

    const list = groupMessages[groupId] || [];
    let next = removeMessage(list, tempId);
    next = upsertMessage(next, { ...(msg || optimistic), mine: true, status: "pending" });
    groupMessages[groupId] = next;

    await refreshGroupMeta(groupId);

    // Local write is done; the worker upgrades the copy once a relay has it.
    watchRelayAck(msg?.id || tempId);

    const confirmed = { ...(msg || optimistic), status: "pending" };
    if (opts.onConfirmed) opts.onConfirmed(confirmed);
    return confirmed;
  } catch (err) {
    const list = groupMessages[groupId] || [];
    groupMessages[groupId] = markMessageStatus(list, tempId, "failed");
    throw err;
  }
}

const lastQueuedGroupReadTs = new Map();

function sendGroupReadReceipt(identity, groupId, lastReadTs) {
  const id = String(groupId || "");
  const ts = Number(lastReadTs || 0);
  if (!id || !ts || !identity?.privkeyHex) return false;
  const prev = lastQueuedGroupReadTs.get(id) || 0;
  if (ts <= prev) return false;
  lastQueuedGroupReadTs.set(id, ts);
  let sender = null;
  try {
    sender = snapshotIdentity(identity);
  } catch {
    return false;
  }
  void groupsApi.sendGroupMessage(sender, id, { type: "read", lastReadTs: ts }).catch(() => {});
  return true;
}

async function refreshPeer(peerPubkey) {
  const identity = _currentIdentity;
  const self = normalizePubkey(identity?.pubkeyHex);
  const peer = normalizePubkey(peerPubkey);
  if (!identity?.privkeyHex || !self || !peer) return;
  const roomId = await dmRoomId(self, peer);
  if (!hydratedRooms.has(roomId)) await hydrateRoom(roomId);
  else await refreshRoomFromDexie(roomId);
  void requestEngineSync();
}

let groupsRebuiltFor = "";

async function backfillFromLocal(identity) {
  const self = normalizePubkey(identity.pubkeyHex);
  if (!self || !identity.privkeyHex) return;

  debugLog(`backfill start (local) self=${shortId(self)}`);
  if (groupsRebuiltFor !== self) {
    groupsRebuiltFor = self;
    await groupsApi.syncAll(identity).catch(() => null);
  }

  const allGroups = await listStoredGroups().catch(() => []);
  for (const g of allGroups) {
    if (!g?.groupId) continue;
    groupMeta[g.groupId] = g;
    if (hydratedGroups.has(g.groupId)) {
      hydratedGroups.delete(g.groupId);
      await hydrateGroup(g.groupId);
    }
  }
  void requestEngineSync();
}

async function reconcile(identity) {
  await identity.init?.();
  const self = normalizePubkey(identity.pubkeyHex);
  if (!self || !identity.privkeyHex) return;

  await refreshInboxFromDexie(true);

  const elapsed = Date.now() - lastBackfillAt;
  if (elapsed < BACKFILL_THROTTLE_MS) return;

  if (backfillPromise) return backfillPromise;

  lastBackfillAt = Date.now();
  backfillPromise = backfillFromLocal(identity)
    .catch(() => null)
    .finally(() => {
      backfillPromise = null;
    });
  return backfillPromise;
}

async function markConversationSeen(roomId) {
  const id = String(roomId || "");
  if (!id) return;
  const seenAt = Date.now();
  const existing = roomMeta[id] || { roomId: id };
  roomMeta[id] = { ...existing, unreadCount: 0, lastSeenTs: seenAt };
  // Carry identity fields into Dexie — a seen-only patch would otherwise create
  // a peer-less row when the room hasn't been persisted yet.
  await putRoomMeta(id, {
    peerPubkey: existing.peerPubkey || "",
    name: existing.name || "",
    type: existing.type || "dm",
    lastMessageTs: Number(existing.lastMessageTs || 0),
    lastMessageText: existing.lastMessageText || "",
    lastMessageMine: Boolean(existing.lastMessageMine),
    resetUnread: true,
    lastSeenTs: seenAt,
  }).catch(() => {});
  broadcastCacheEvent({ type: "seen", roomId: id });
}

async function markGroupSeen(groupId) {
  const id = String(groupId || "");
  if (!id) return;
  const seenAt = Date.now();
  const existing = groupMeta[id];
  if (!existing) return;
  groupMeta[id] = { ...existing, unreadCount: 0, lastSeenTs: seenAt };
  await putStoredGroup({ ...existing, resetUnread: true, lastSeenTs: seenAt }).catch(() => {});
  broadcastCacheEvent({ type: "group-seen", groupId: id });
}

function setActiveConversation(id) {
  activeConversationId = String(id || "");
  if (activeConversationId.startsWith("/room/")) {
    activeConversationId = activeConversationId.slice("/room/".length);
  } else if (activeConversationId.startsWith("/groups/")) {
    activeConversationId = activeConversationId.slice("/groups/".length);
  }
  const peer = roomMeta[activeConversationId]?.peerPubkey;
  if (peer) void refreshPeer(peer);
}

function handleCacheBroadcast(event) {
  if (!event?.type) return;
  switch (event.type) {
    case "room-message":
      void refreshInboxFromDexie(true);
      if (event.roomId) void refreshRoomFromDexie(event.roomId);
      break;
    case "group-message":
      void refreshInboxFromDexie(true);
      if (event.groupId) void refreshGroupFromDexie(event.groupId);
      break;
    case "seen":
      if (event.roomId && roomMeta[event.roomId]) {
        roomMeta[event.roomId] = { ...roomMeta[event.roomId], unreadCount: 0 };
      }
      break;
    case "group-seen":
      if (event.groupId && groupMeta[event.groupId]) {
        groupMeta[event.groupId] = { ...groupMeta[event.groupId], unreadCount: 0 };
      }
      break;
    default:
      break;
  }
}

export function setupCacheBroadcast() {
  return initCacheBroadcast(handleCacheBroadcast);
}

let callSignalLive = null;
let _callSignalHandler = null;

export function setCallSignalHandler(fn) {
  _callSignalHandler = fn;
}

function fillSubscriptionGap() {
  const now = Date.now();
  if (now - lastGapFillAt < GAP_FILL_MIN_MS) return;
  lastGapFillAt = now;
  debugLog("gap-fill: asking the engine to resync after live sub restart");
  void requestEngineSync();
  const peer = roomMeta[activeConversationId]?.peerPubkey;
  if (peer) void refreshPeer(peer);
}

/** Live subscription for ephemeral call signals only. */
function startCallSignalSubscription(identity) {
  callSignalLive?.stop?.();
  let liveStartedOnce = false;
  let signalChain = Promise.resolve();

  async function handleSignal(row) {
    if (isCallSignalType(row?.type) && row?.type !== "call-request") {
      if (row.type === "call-offer") {
        const self = normalizePubkey(identity.pubkeyHex);
        const sender = normalizePubkey(row?.sender);
        const roomId = self && sender ? await dmRoomId(self, sender) : null;
        if (!roomId || !sender) return;

        await hydrateRoom(roomId).catch(() => {});
        const msgs = roomMessages[roomId] || [];
        let trustedMessages = 0;
        for (let i = 0; i < msgs.length; i++) {
          if (
            !msgs[i].mine &&
            normalizePubkey(msgs[i].sender) === sender &&
            TRUST_ADVANCING_TYPES.has(msgs[i].type)
          ) {
            trustedMessages++;
          }
          if (trustedMessages >= CALL_TRUST_THRESHOLD) break;
        }
        if (trustedMessages < CALL_TRUST_THRESHOLD) {
          debugLog(
            `call-offer blocked: sender ${shortId(sender)} has ${trustedMessages}/${CALL_TRUST_THRESHOLD} trust messages`,
          );
          return;
        }
      }

      // Answers, ICE and hang-ups belong to a call that already rang, so they
      // must not be re-gated by message history.
      _callSignalHandler?.(row);
      return;
    }

    debugLog(
      `ignored live signal type=${row?.type} id=${row?.id?.slice(0, 12)} sender=${shortId(row?.sender)}`,
    );
  }

  callSignalLive = createLiveSubscription({
    shouldRestart: () => activePubkey.value === identity.pubkeyHex,
    start: async (observer) => {
      if (liveStartedOnce) fillSubscriptionGap();
      liveStartedOnce = true;
      return api.subscribeCallSignals(identity.privkeyHex, identity.pubkeyHex, observer);
    },
    // Serialize signals so an offer finishes hydrating and claims the peer
    // before its ICE or answer signals are checked against that peer.
    next: (row) => {
      signalChain = signalChain
        .then(() => handleSignal(row))
        .catch((err) => {
          debugLog(`call signal failed: ${err?.message || err}`);
        });
      return signalChain;
    },
  });
}

/** Force-reload the inbox (e.g. after creating a group). Group traffic is
 * ingested by the engine bridge, so no separate group subscription is needed. */
function refreshGroupSubscriptions() {
  void hydrateInbox(true);
}

let bootPromise = null;
let _currentIdentity = null;

async function start(identity) {
  _currentIdentity = identity;
  await identity.init();
  const next = normalizePubkey(identity.pubkeyHex);
  if (!next || !identity.privkeyHex) return;
  if (activePubkey.value === next && bootPromise) return bootPromise;
  if (activePubkey.value && activePubkey.value !== next) stop();

  activePubkey.value = next;
  bootPromise = (async () => {
    await reconcileEngineRows(identity);
    await hydrateInbox();
    startCallSignalSubscription(identity);
    wireEngineBridge(identity);
    // The engine owns relay traffic; rehydrate local groups, then let it pull.
    lastBackfillAt = Date.now();
    backfillPromise = backfillFromLocal(identity)
      .catch((err) => {
        debugLog(`backfill failed: ${err?.message || err}`);
      })
      .finally(() => {
        backfillPromise = null;
      });
  })().catch((err) => {
    bootPromise = null;
    throw err;
  });
  return bootPromise;
}

let engineUnsub = null;
let engineAckUnsub = null;

/**
 * Route raw engine rows into rooms/groups. v2 group events live under origin
 * "group"; legacy group copies still arrive as DMs.
 */
async function ingestEngineRows(identity, rows, { silent = false } = {}) {
  const dmRows = [];
  const groupRows = [];
  for (const row of rows || []) {
    if (!row?.event) continue;
    if (row.origin === "group") groupRows.push(row);
    else dmRows.push(row);
  }

  if (dmRows.length) {
    const parsed = await api.parseStoredDmRows(dmRows, identity);
    for (const row of parsed) {
      const quiet = typeof silent === "function" ? silent(row) : silent;
      await ingestIncomingDirectMessage(identity, row, { silent: quiet });
    }
  }

  if (groupRows.length) {
    const parsed = await groupsApi.parseStoredGroupRows(groupRows, identity);
    for (const row of parsed) {
      const quiet = typeof silent === "function" ? silent(row) : silent;
      await ingestIncomingGroupMessage(identity, row, { silent: quiet });
    }
  }
}

/**
 * On boot, route raw engine rows that were stored while the app was not
 * listening (or before a reload) into rooms/groups. Idempotent.
 */
async function reconcileEngineRows(identity) {
  try {
    const [dmRows, groupRows] = await Promise.all([
      listUnappliedRawEvents({ origin: "dm", limit: 400 }),
      listUnappliedRawEvents({ origin: "group", limit: 400 }),
    ]);
    const rows = [...dmRows, ...groupRows];
    if (!rows.length) return;
    await ingestEngineRows(identity, rows, { silent: true });
    await markRawEventsApplied(rows.map((row) => row.id));
    debugLog(`engine reconcile: ${rows.length} raw row(s)`);
  } catch (err) {
    debugLog(`engine reconcile failed: ${err?.message || err}`);
  }
}

function wireEngineBridge(identity) {
  engineUnsub?.();
  engineAckUnsub?.();
  engineUnsub = onEngineIngested(async (ids) => {
    if (!ids?.length) return;
    try {
      const rows = await getRawEventsByIds(ids);
      if (!rows.length) return;
      const nowMs = Date.now();
      // Backfill stays quiet; a live message caught by the engine still beeps.
      await ingestEngineRows(identity, rows, {
        silent: (row) => Number(row.created_at || row.ts || 0) < nowMs - 120_000,
      });
      await markRawEventsApplied(rows.map((row) => row.id));
    } catch (err) {
      debugLog(`engine ingest failed: ${err?.message || err}`);
    }
  });
  engineAckUnsub = onEngineAcked((ids) => {
    for (const id of ids) markMessageSynced(id);
  });
  startEngineBridge(identity.pubkeyHex);
}

function stop() {
  engineUnsub?.();
  engineUnsub = null;
  engineAckUnsub?.();
  engineAckUnsub = null;
  stopEngineBridge();
  callSignalLive?.stop?.();
  callSignalLive = null;
  activePubkey.value = "";
  bootPromise = null;
  backfillPromise = null;
  lastBackfillAt = 0;
  lastGapFillAt = 0;
  groupsRebuiltFor = "";
  activeConversationId = "";
  clearAllReplyReminders();

  for (const key of Object.keys(roomMessages)) delete roomMessages[key];
  for (const key of Object.keys(roomMeta)) delete roomMeta[key];
  for (const key of Object.keys(groupMessages)) delete groupMessages[key];
  for (const key of Object.keys(groupMeta)) delete groupMeta[key];
  hydratedRooms.clear();
  hydratedGroups.clear();
  hydratingRooms.clear();
  hydratingGroups.clear();
  lastQueuedGroupReadTs.clear();
  hydratedInbox.value = false;
}

export const messenger = {
  api,
  roomMessages,
  roomMeta,
  groupMessages,
  groupMeta,
  hydratedInbox,
  hydratingRooms,
  hydratingGroups,
  activePubkey,

  start,
  stop,

  hydrateInbox,
  hydrateRoom,
  hydrateGroup,
  refreshInboxFromDexie,
  refreshRoomFromDexie,
  refreshGroupFromDexie,
  refreshGroupSubscriptions,
  refreshPeer,
  reconcile,
  markConversationSeen,
  markGroupSeen,
  setActiveConversation,

  sendDirectMessage,
  sendGroupMessage,
  sendGroupReadReceipt,

  ingestRoomRow,
  ingestGroupRow,
  refreshGroupMeta,

  setCallSignalHandler,
};

export default messenger;
