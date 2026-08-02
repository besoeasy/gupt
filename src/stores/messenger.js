import { reactive, ref, shallowReactive } from "vue";

import { cancelAllTasks, dequeueTask, enqueueSend, getSendQueueSnapshot } from "@/lib/sendQueue";

import { api } from "@/lib/api";
import { collectPeerHintsFromHistory, addHintRelay } from "@/lib/relay";
import { asyncPool } from "@/lib/asyncPool";
import { broadcastCacheEvent, initCacheBroadcast } from "@/lib/cacheBroadcast";
import { formatCallEventText, isCallSignalType } from "@/lib/webrtc";
import { isCountableChatRow } from "@/lib/chatListUtils";
import { dmRoomId, normalizeNostrPubkey, shortId } from "@/lib/crypto";
import { groupsApi, decryptLocalGroupRows } from "@/lib/groups";
import {
  getRoomMeta,
  getStoredGroup,
  getSyncCursor,
  listGroupEvents,
  listRoomEvents,
  listRoomMeta,
  listStoredGroups,
  putRoomMeta,
  putStoredGroup,
  putSyncCursor,
  deleteRoomMessage,
  indexRoomMessage,
  indexRoomMessages,
  putRawEvent,
} from "@/lib/idb";
import { decryptRows } from "@/lib/decryptCache";
import { playMessageSound } from "@/lib/notifications";
import { clearAllReplyReminders, clearReplyReminderDismiss } from "@/lib/replyReminders";

const roomMessages = shallowReactive({});
const roomMeta = shallowReactive({});
const groupMessages = shallowReactive({});
const groupMeta = shallowReactive({});

const hydratedInbox = ref(false);
const hydratedRooms = new Set();
const hydratedGroups = new Set();

const activePubkey = ref("");

let activeConversationId = "";
let lastBackfillAt = 0;
let backfillPromise = null;

const BACKFILL_THROTTLE_MS = 30_000;
const BACKFILL_CONCURRENCY = 4;
const BACKGROUND_HYDRATE_ROOMS = 5;
const HINT_WINDOW = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAT_TYPES = new Set([
  "text",
  "voice",
  "media",
  "like",
  "react",
  "edit",
  "call-event",
  "call-request",
  "read",
]);
const PREVIEWABLE_TYPES = new Set(["text", "voice", "media"]);
const TRUST_ADVANCING_TYPES = new Set(["text", "voice", "media", "call-event", "call-request"]);

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
  if (!roomId || hydratedRooms.has(roomId)) return;
  hydratedRooms.add(roomId);
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

  const peerPubkey = roomMeta[roomId]?.peerPubkey;
  if (peerPubkey) {
    const peerMessages = merged
      .slice(-HINT_WINDOW)
      .filter((row) => !row.mine && row.relayHint)
      .map((row) => ({ sender: row.sender, relayHint: row.relayHint, ts: tsOf(row) }));
    if (peerMessages.length) {
      for (const row of peerMessages) {
        addHintRelay(row.relayHint);
      }
      void collectPeerHintsFromHistory(peerPubkey, peerMessages).catch(() => {});
    }
  }
}

async function hydrateGroup(groupId) {
  if (!groupId || hydratedGroups.has(groupId)) return;
  hydratedGroups.add(groupId);
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
}

async function ingestRoomRow(roomId, peerPubkey, row, options = {}) {
  if (!roomId || !row?.id) return;
  const persist = options.persist !== false;

  const list = roomMessages[roomId] || [];
  const isNew = !list.some((entry) => entry.id === row.id);
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
}

async function ingestIncomingDirectMessage(identity, row, options = {}) {
  const selfPubkey = normalizeNostrPubkey(identity.pubkeyHex);
  const peerPubkey = normalizeNostrPubkey(row?.peerPubkey);
  if (!selfPubkey || !peerPubkey) return;

  // Stateless groups arrive as tagged kind-4 DMs — route them to the group store.
  if (row.isGroup && row.groupId) {
    if (row.type === "group-roster") {
      void groupsApi
        .applyRoster(identity, row)
        .then((groupRecord) => {
          if (groupRecord?.groupId) {
            hydratedGroups.delete(groupRecord.groupId);
            void hydrateGroup(groupRecord.groupId);
            void refreshGroupMeta(groupRecord.groupId);
          }
        })
        .catch(() => null);
      return;
    }
    if (row._event) void groupsApi.ingestGroupMessage(identity, row).catch(() => {});
    const mine = row.sender === selfPubkey;
    ingestGroupRow(
      row.groupId,
      { ...row, mine, peerPubkey: row.peerPubkey || selfPubkey },
      options,
    );
    if (!options.silent && !mine && CHAT_TYPES.has(row.type) && row.type !== "read") {
      void playMessageSound();
    }
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
  await ingestRoomRow(roomId, peerPubkey, normalizedRow, options);

  if (!options.silent && !row.mine && row.type !== "call-event" && row.type !== "read") {
    void playMessageSound();
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
    const unreadPatch = isNew ? buildGroupUnreadPatch(groupId, row) : {};
    const unreadCount = Math.max(
      0,
      Number(existingMeta.unreadCount || 0) + Number(unreadPatch.unreadDelta || 0),
    );
    const nextMeta = {
      ...existingMeta,
      ...(ts > Number(existingMeta.lastMessageTs || 0) ? { lastMessageTs: ts } : {}),
      unreadCount,
      updatedAt: Date.now(),
    };
    groupMeta[groupId] = nextMeta;
    if (persist) {
      void putStoredGroup({
        groupId,
        ...(ts > Number(existingMeta.lastMessageTs || 0) ? { lastMessageTs: ts } : {}),
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
  const peer = normalizeNostrPubkey(peerPubkey);
  const self = normalizeNostrPubkey(identity.pubkeyHex);
  if (!self || !peer) throw new Error("Invalid conversation pubkey");

  const roomId = await dmRoomId(self, peer);

  const { id, event, publish } = await api.prepareDirectMessage(identity.privkeyHex, peer, payload);
  const optimistic = makeOptimisticDmRow(identity, { ...payload, id });

  if (opts.onOptimistic) {
    try {
      opts.onOptimistic(optimistic);
    } catch (err) {}
  }

  if (event.kind === 4) {
    try {
      await putRawEvent(event, "dm", {
        peerPubkey: peer,
        roomId,
        type: String(payload?.type || "text"),
      });
    } catch (err) {}
  }

  await ingestRoomRow(roomId, peer, optimistic, { persist: false });

  enqueueSend({
    id,
    meta: {
      kind: "dm",
      conversationId: roomId,
      messageType: String(payload?.type || "text"),
    },
    fn: async () => {
      await publish();
      await ingestRoomRow(roomId, peer, { ...optimistic, status: "sent" });
    },
    onFailed() {
      const list = roomMessages[roomId] || [];
      roomMessages[roomId] = markMessageStatus(list, id, "failed");
    },
  });

  return { id };
}

async function sendGroupMessage(identity, groupId, payload, opts = {}) {
  if (!groupId) throw new Error("Missing groupId");
  const self = normalizeNostrPubkey(identity.pubkeyHex);
  if (!self) throw new Error("Identity not initialized");

  const ts = Date.now();
  const tempId = shortId();
  const optimistic = {
    id: tempId,
    groupId,
    sender: self,
    type: payload?.type || "text",
    text: String(payload?.text || ""),
    ts,
    media: payload?.media || null,
    durationMs: Number(payload?.durationMs || 0),
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

  enqueueSend({
    id: tempId,
    meta: {
      kind: "group",
      conversationId: groupId,
      messageType: String(payload?.type || "text"),
    },
    fn: async () => {
      const msg = await groupsApi.sendGroupMessage(identity, groupId, payload);

      const list = groupMessages[groupId] || [];
      let next = removeMessage(list, tempId);
      if (msg) {
        next = upsertMessage(next, { ...msg, mine: true, status: "sent" });
      } else {
        next = upsertMessage(next, { ...optimistic, status: "sent" });
      }
      groupMessages[groupId] = next;

      await refreshGroupMeta(groupId);

      const confirmed = msg || { ...optimistic, status: "sent" };
      if (opts.onConfirmed) opts.onConfirmed(confirmed);
    },
    onFailed() {
      const list = groupMessages[groupId] || [];
      groupMessages[groupId] = markMessageStatus(list, tempId, "failed");
    },
  });

  return optimistic;
}

async function backfillPeer(identity, self, peer) {
  const roomId = await dmRoomId(self, peer);
  const cached = roomMeta[roomId];
  const cursor = await getSyncCursor(peer).catch(() => null);
  const sinceMs = Math.max(Number(cached?.lastMessageTs || 0), Number(cursor?.lastSyncMs || 0));
  const { messages } = await api
    .getDirectMessages(identity.privkeyHex, self, peer, sinceMs)
    .catch((e) => {
      return { messages: [] };
    });

  const fresh = messages
    .filter(isChatRow)
    .filter((row) => !row.isGroup)
    .map((row) => ({ ...row, peerPubkey: peer, status: row.mine ? "sent" : undefined }));
  if (!fresh.length) return;

  await indexRoomMessages(roomId, fresh).catch(() => {});
  for (const row of fresh) {
    await ingestRoomRow(roomId, peer, row, { persist: true });
  }

  const maxTs = fresh.reduce((latest, row) => Math.max(latest, tsOf(row)), sinceMs);
  await putSyncCursor(peer, maxTs).catch(() => {});
}

async function backfillFromRelays(identity) {
  const self = normalizeNostrPubkey(identity.pubkeyHex);
  if (!self || !identity.privkeyHex) return;

  const { peers } = await api.listDirectPeers(self).catch(() => ({ peers: [] }));
  const normalizedPeers = peers.map((p) => normalizeNostrPubkey(p)).filter(Boolean);

  await asyncPool(BACKFILL_CONCURRENCY, normalizedPeers, async (peer) => {
    await backfillPeer(identity, self, peer);
  });

  await groupsApi
    .syncAll(identity, { selfHandle: (identity.profileName || "").replace(/\s+/g, "") })
    .catch(() => null);

  const allGroups = await listStoredGroups().catch(() => []);
  for (const g of allGroups) {
    if (!g?.groupId) continue;
    groupMeta[g.groupId] = g;
    if (hydratedGroups.has(g.groupId)) {
      hydratedGroups.delete(g.groupId);
      await hydrateGroup(g.groupId);
    }
  }
}

async function reconcile(identity) {
  await identity.init?.();
  const self = normalizeNostrPubkey(identity.pubkeyHex);
  if (!self || !identity.privkeyHex) return;

  await refreshInboxFromDexie(true);

  const elapsed = Date.now() - lastBackfillAt;
  if (elapsed < BACKFILL_THROTTLE_MS) return;

  if (backfillPromise) return backfillPromise;

  lastBackfillAt = Date.now();
  backfillPromise = backfillFromRelays(identity)
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

let dmSub = null;
let dmRestartTimer = null;
let _callSignalHandler = null;
let _typingSignalHandler = null;

export function setCallSignalHandler(fn) {
  _callSignalHandler = fn;
}

export function setTypingSignalHandler(fn) {
  _typingSignalHandler = fn;
}

function startDmSubscription(identity) {
  dmSub?.unsubscribe?.();
  dmSub = api.subscribeAllDirectMessages(
    identity.privkeyHex,
    identity.pubkeyHex,
    {
      async next(row) {
        if (isCallSignalType(row?.type) && row?.type !== "call-request") {
          const self = normalizeNostrPubkey(identity.pubkeyHex);
          const sender = normalizeNostrPubkey(row?.sender);
          const roomId = self && sender ? await dmRoomId(self, sender) : null;

          if (roomId && !hydratedRooms.has(roomId)) {
            await hydrateRoom(roomId);
          }
          const msgs = (roomId && roomMessages[roomId]) || [];
          let sentCount = 0;
          for (let i = 0; i < msgs.length; i++) {
            if (msgs[i].mine && TRUST_ADVANCING_TYPES.has(msgs[i].type)) sentCount++;
            if (sentCount >= 7) break;
          }
          if (sentCount < 7) {
            return;
          }
          _callSignalHandler?.(row);
          return;
        }

        if (row?.type === "typing") {
          _typingSignalHandler?.(row.sender);
          return;
        }

        void ingestIncomingDirectMessage(identity, row);
      },
      error(err) {
        scheduleDmRestart(identity, 5000);
      },
      complete() {
        scheduleDmRestart(identity, 3000);
      },
    },
    Date.now() - 5000,
  );
}

function scheduleDmRestart(identity, delayMs) {
  if (activePubkey.value !== identity.pubkeyHex) return;
  if (dmRestartTimer) clearTimeout(dmRestartTimer);
  dmRestartTimer = setTimeout(() => {
    if (activePubkey.value === identity.pubkeyHex) startDmSubscription(identity);
  }, delayMs);
}

/** Force-reload the inbox (e.g. after creating a group). Group traffic arrives
 * through the DM subscription, so no separate group subscription is needed. */
function refreshGroupSubscriptions() {
  void hydrateInbox(true);
}

let bootPromise = null;
let _currentIdentity = null;

async function start(identity) {
  _currentIdentity = identity;
  await identity.init();
  const next = normalizeNostrPubkey(identity.pubkeyHex);
  if (!next || !identity.privkeyHex) return;
  if (activePubkey.value === next && bootPromise) return bootPromise;
  if (activePubkey.value && activePubkey.value !== next) stop();

  activePubkey.value = next;
  bootPromise = (async () => {
    await hydrateInbox();
    startDmSubscription(identity);
    await backfillFromRelays(identity);
  })().catch((err) => {
    bootPromise = null;
    throw err;
  });
  return bootPromise;
}

function stop() {
  dmSub?.unsubscribe?.();
  dmSub = null;
  if (dmRestartTimer) clearTimeout(dmRestartTimer);
  dmRestartTimer = null;
  activePubkey.value = "";
  bootPromise = null;
  backfillPromise = null;
  lastBackfillAt = 0;
  activeConversationId = "";
  clearAllReplyReminders();

  cancelAllTasks();

  for (const key of Object.keys(roomMessages)) delete roomMessages[key];
  for (const key of Object.keys(roomMeta)) delete roomMeta[key];
  for (const key of Object.keys(groupMessages)) delete groupMessages[key];
  for (const key of Object.keys(groupMeta)) delete groupMeta[key];
  hydratedRooms.clear();
  hydratedGroups.clear();
  hydratedInbox.value = false;
}

export const messenger = {
  api,
  roomMessages,
  roomMeta,
  groupMessages,
  groupMeta,
  hydratedInbox,
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
  reconcile,
  markConversationSeen,
  markGroupSeen,
  setActiveConversation,

  sendDirectMessage,
  sendGroupMessage,

  ingestRoomRow,
  ingestGroupRow,
  refreshGroupMeta,

  getSendQueueSnapshot,

  setCallSignalHandler,
  setTypingSignalHandler,
};

export default messenger;
