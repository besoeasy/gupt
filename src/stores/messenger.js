import { reactive, ref, shallowReactive } from "vue";

import { cancelAllTasks, dequeueTask, enqueueSend, getSendQueueSnapshot } from "@/lib/sendQueue";

import { api } from "@/lib/api";
import { collectPeerHintsFromHistory, addHintRelay } from "@/lib/relay";
import { asyncPool } from "@/lib/asyncPool";
import { broadcastCacheEvent, initCacheBroadcast } from "@/lib/cacheBroadcast";
import { formatCallEventText, isCallSignalType } from "@/lib/webrtc";
import { isCountableChatRow } from "@/lib/chatListUtils";
import { dmRoomId, normalizeNostrPubkey, shortId } from "@/lib/crypto";
import { groupsApi } from "@/lib/groups";
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
  getSendTimingStats,
  deleteRoomMessage,
  indexRoomMessage,
  indexRoomMessages,
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
  return CHAT_TYPES.has(row?.type);
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
  for (const meta of groups) {
    if (meta?.groupId) groupMeta[meta.groupId] = meta;
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
    return decryptRows(_currentIdentity.privkeyHex, _currentIdentity.pubkeyHex, rawRows).catch(
      () => [],
    );
  }
  return [];
}

async function loadGroupMessages(groupId, groupPrivkey) {
  const rawRows = await listGroupEvents(groupId).catch(() => []);
  if (rawRows.length && groupPrivkey && _currentIdentity?.pubkeyHex) {
    return decryptRows(groupPrivkey, _currentIdentity.pubkeyHex, rawRows).catch(() => []);
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
  const msgs = await loadGroupMessages(groupId, meta?.groupPrivkey);

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
  console.log("[gupt-msg-room] ingest", {
    roomId: roomId?.slice(0, 12),
    peer: peerPubkey?.slice(0, 8),
    type: row?.type,
    id: row?.id?.slice(0, 12),
    isNew,
    mine: row?.mine,
    persist,
    msgCount: list.length + (isNew ? 1 : 0),
  });
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

  console.log("[gupt-msg-recv] incoming", {
    self: selfPubkey?.slice(0, 8),
    peer: peerPubkey?.slice(0, 8),
    type: row?.type,
    id: row?.id?.slice(0, 12),
    mine: row?.mine,
    sender: row?.sender?.slice(0, 8),
  });

  if (row.type === "group-invite" && row.privkey) {
    import("@/lib/groups.js").then(({ groupsApi }) => {
      groupsApi
        .acceptInvite(identity, row.privkey)
        .then((groupRecord) => {
          if (groupRecord && groupRecord.groupId) {
            void hydrateGroup(groupRecord.groupId);
            startGroupSubscription(identity);
          }
        })
        .catch(() => null);
    });
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
  const persist = options.persist !== false;

  const list = groupMessages[groupId] || [];
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
  if (meta) groupMeta[groupId] = meta;
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

async function sendDirectMessage(identity, peerPubkey, payload) {
  const peer = normalizeNostrPubkey(peerPubkey);
  const self = normalizeNostrPubkey(identity.pubkeyHex);
  if (!self || !peer) throw new Error("Invalid conversation pubkey");

  const roomId = await dmRoomId(self, peer);
  console.log("[gupt-msg-send] preparing", {
    self: self?.slice(0, 8),
    peer: peer?.slice(0, 8),
    roomId: roomId?.slice(0, 12),
    type: payload?.type,
  });

  const { id, publish } = await api.prepareDirectMessage(identity.privkeyHex, peer, payload);
  const optimistic = makeOptimisticDmRow(identity, { ...payload, id });

  await ingestRoomRow(roomId, peer, optimistic, { persist: false });

  enqueueSend({
    id,
    meta: {
      kind: "dm",
      conversationId: roomId,
      messageType: String(payload?.type || "text"),
    },
    fn: async () => {
      console.log("[gupt-msg-send] publishing", { id, peer: peer?.slice(0, 8) });
      await publish();
      console.log("[gupt-msg-send] published ok", { id });
      await ingestRoomRow(roomId, peer, { ...optimistic, status: "sent" });
    },
    onFailed() {
      console.warn("[gupt-msg-send] FAILED", { id, peer: peer?.slice(0, 8) });
      const list = roomMessages[roomId] || [];
      roomMessages[roomId] = markMessageStatus(list, id, "failed");
    },
  });

  return { id };
}

function dropOptimistic(roomId, messageId) {
  if (!roomId || !messageId) return;

  dequeueTask(messageId);
  const list = roomMessages[roomId] || [];
  roomMessages[roomId] = removeMessage(list, messageId);
}

function dropGroupOptimistic(groupId, messageId) {
  if (!groupId || !messageId) return;
  dequeueTask(messageId);
  const list = groupMessages[groupId] || [];
  groupMessages[groupId] = removeMessage(list, messageId);
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
    epoch: groupMeta[groupId]?.currentEpoch || 1,
    status: "pending",
    mine: true,
  };

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
  console.log("[gupt-backfill] peer", {
    peer: peer?.slice(0, 8),
    roomId: roomId?.slice(0, 12),
    sinceMs,
    cachedTs: Number(cached?.lastMessageTs || 0),
    cursorTs: Number(cursor?.lastSyncMs || 0),
  });
  const { messages } = await api
    .getDirectMessages(identity.privkeyHex, self, peer, sinceMs)
    .catch((e) => {
      console.warn("[gupt-backfill] peer fetch failed", {
        peer: peer?.slice(0, 8),
        error: e?.message,
      });
      return { messages: [] };
    });

  const fresh = messages
    .filter(isChatRow)
    .map((row) => ({ ...row, peerPubkey: peer, status: row.mine ? "sent" : undefined }));
  console.log("[gupt-backfill] peer result", { peer: peer?.slice(0, 8), freshCount: fresh.length });
  if (!fresh.length) return;

  await indexRoomMessages(roomId, fresh).catch(() => {});
  for (const row of fresh) {
    await ingestRoomRow(roomId, peer, row, { persist: false });
  }

  const maxTs = fresh.reduce((latest, row) => Math.max(latest, tsOf(row)), sinceMs);
  await putSyncCursor(peer, maxTs).catch(() => {});
}

async function backfillFromRelays(identity) {
  const self = normalizeNostrPubkey(identity.pubkeyHex);
  if (!self || !identity.privkeyHex) return;

  const { peers } = await api.listDirectPeers(self).catch(() => ({ peers: [] }));
  const normalizedPeers = peers.map((p) => normalizeNostrPubkey(p)).filter(Boolean);
  console.log("[gupt-backfill] peers discovered", {
    count: normalizedPeers.length,
    peers: normalizedPeers.map((p) => p?.slice(0, 8)),
  });

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
let groupSub = null;
let dmRestartTimer = null;
let groupRestartTimer = null;
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
  console.log("[gupt-sub-dm] starting DM subscription", {
    pubkey: identity.pubkeyHex?.slice(0, 8),
  });
  dmSub = api.subscribeAllDirectMessages(
    identity.privkeyHex,
    identity.pubkeyHex,
    {
      async next(row) {
        console.log("[gupt-sub-dm] received event", {
          type: row?.type,
          sender: row?.sender?.slice(0, 8),
          peer: row?.peerPubkey?.slice(0, 8),
          id: row?.id?.slice(0, 12),
        });
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
            console.warn(
              `[gupt-call-gate] DROPPED ${row.type} from ${sender} (trust gate: sent ${sentCount}/7 qualifying msgs)`,
            );
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
        console.warn("[gupt-sub-dm] subscription error", { error: err?.message });
        scheduleDmRestart(identity, 5000);
      },
      complete() {
        console.log("[gupt-sub-dm] subscription EOSE/complete, restarting in 3s");
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

function startGroupSubscription(identity) {
  groupSub?.unsubscribe?.();
  groupSub = groupsApi.subscribeAllGroups(identity, {
    next(row) {
      if (!row?.groupId) return;
      const mine = row.sender === identity.pubkeyHex;
      ingestGroupRow(row.groupId, { ...row, mine });
      if (!mine && CHAT_TYPES.has(row.type) && row.type !== "read") {
        void playMessageSound();
      }
    },
    metaChanged(groupId) {
      void refreshGroupMeta(groupId);
    },
    error() {
      scheduleGroupRestart(identity, 5000);
    },
    complete() {
      scheduleGroupRestart(identity, 3000);
    },
  });
}

function scheduleGroupRestart(identity, delayMs) {
  if (activePubkey.value !== identity.pubkeyHex) return;
  if (groupRestartTimer) clearTimeout(groupRestartTimer);
  groupRestartTimer = setTimeout(() => {
    if (activePubkey.value === identity.pubkeyHex) startGroupSubscription(identity);
  }, delayMs);
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

  console.log("[gupt-msg-start] booting messenger", { pubkey: next?.slice(0, 8) });
  activePubkey.value = next;
  bootPromise = (async () => {
    await hydrateInbox();
    console.log("[gupt-msg-start] inbox hydrated, starting subscriptions");
    startDmSubscription(identity);
    startGroupSubscription(identity);
    console.log("[gupt-msg-start] subscriptions started, backfilling from relays");
    await backfillFromRelays(identity);
    console.log("[gupt-msg-start] backfill complete");
  })().catch((err) => {
    console.error("[gupt-msg-start] boot failed", { error: err?.message });
    bootPromise = null;
    throw err;
  });
  return bootPromise;
}

function stop() {
  dmSub?.unsubscribe?.();
  dmSub = null;
  groupSub?.unsubscribe?.();
  groupSub = null;
  if (dmRestartTimer) clearTimeout(dmRestartTimer);
  if (groupRestartTimer) clearTimeout(groupRestartTimer);
  dmRestartTimer = null;
  groupRestartTimer = null;
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
  reconcile,
  markConversationSeen,
  markGroupSeen,
  setActiveConversation,

  sendDirectMessage,
  sendGroupMessage,
  dropOptimistic,
  dropGroupOptimistic,

  ingestRoomRow,
  ingestGroupRow,
  refreshGroupMeta,

  getSendQueueSnapshot,
  getSendTimingStats,

  setCallSignalHandler,
  setTypingSignalHandler,

  removeRoomMessage(roomId, messageId) {
    if (!roomId || !messageId) return;
    const list = roomMessages[roomId] || [];
    roomMessages[roomId] = removeMessage(list, messageId);
    void deleteRoomMessage(messageId).catch(() => {});
  },
};

export default messenger;
