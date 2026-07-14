/**
 * Messenger store — single source of truth for all chat UI.
 *
 * Architecture:
 *   - Relays are the source of truth for messages.
 *   - This store keeps an in-memory reactive copy that drives every view.
 *   - Dexie is a write-through cache that hydrates the store on cold start
 *     (instant offline-friendly UI) and persists every relay event we see.
 *   - Sends are optimistic: a `pending` row appears immediately, then becomes
 *     `sent` once the relay confirms or `failed` if publish errors out.
 *
 * The store is module-scope (not a Pinia store) because it must be importable
 * from non-component code (sync.js, groups.js) without `setActivePinia` plumbing.
 */

import { reactive, ref, shallowReactive } from "vue";

import { cancelAllTasks, dequeueTask, enqueueSend, getSendQueueSnapshot } from "@/lib/sendQueue";

import { api } from "@/lib/api";
import { asyncPool } from "@/lib/asyncPool";
import { broadcastCacheEvent, initCacheBroadcast } from "@/lib/cacheBroadcast";
import { formatCallEventText, isCallSignalType } from "@/lib/calls";
import { isCountableChatRow } from "@/lib/chatListUtils";
import { dmRoomId, normalizeNostrPubkey, shortId } from "@/lib/crypto";
import { groupsApi } from "@/lib/groups";
import {
  cacheRoomMessages,
  deleteCachedRoomMessage,
  getRoomMeta,
  getStoredGroup,
  getSyncCursor,
  listCachedRoomMessages,
  listRoomMeta,
  listStoredGroupMessages,
  listStoredGroups,
  putCachedRoomMessage,
  putRoomMeta,
  putStoredGroup,
  putSyncCursor,
  getSendTimingStats,
} from "@/lib/idb";
import { playMessageSound } from "@/lib/notifications";
import { clearAllReplyReminders, clearReplyReminderDismiss } from "@/lib/replyReminders";

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

/** roomId → MessageRow[] (sorted ascending by ts). */
const roomMessages = shallowReactive({});
/** roomId → RoomMeta. */
const roomMeta = shallowReactive({});
/** groupId → MessageRow[] (sorted ascending by ts). */
const groupMessages = shallowReactive({});
/** groupId → GroupRecord. */
const groupMeta = shallowReactive({});

const hydratedInbox = ref(false);
const hydratedRooms = new Set();
const hydratedGroups = new Set();

/** Current identity bound to the running subscription (or "" if none). */
const activePubkey = ref("");

let activeConversationId = "";
let lastBackfillAt = 0;
let backfillPromise = null;

const BACKFILL_THROTTLE_MS = 30_000;
const BACKFILL_CONCURRENCY = 4;
const BACKGROUND_HYDRATE_ROOMS = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAT_TYPES = new Set(["text", "voice", "media", "like", "react", "edit", "call-event", "read"]);
const PREVIEWABLE_TYPES = new Set(["text", "voice", "media"]);
const TRUST_ADVANCING_TYPES = new Set(["text", "voice", "media", "call-event"]);

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

async function hydrateRoom(roomId) {
  if (!roomId || hydratedRooms.has(roomId)) return;
  hydratedRooms.add(roomId);
  const [meta, msgs] = await Promise.all([
    getRoomMeta(roomId).catch(() => null),
    listCachedRoomMessages(roomId).catch(() => []),
  ]);
  if (meta) roomMeta[roomId] = meta;

  const existing = roomMessages[roomId] || [];
  const seen = new Set(existing.map((m) => m.id));
  let merged = existing.slice();
  for (const m of msgs) {
    if (!seen.has(m.id)) merged = upsertMessage(merged, m);
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
  const [meta, msgs] = await Promise.all([
    getStoredGroup(groupId).catch(() => null),
    listStoredGroupMessages(groupId).catch(() => []),
  ]);
  if (meta) groupMeta[groupId] = meta;

  const existing = groupMessages[groupId] || [];
  const seen = new Set(existing.map((m) => m.id));
  let merged = existing.slice();
  for (const m of msgs) {
    if (!seen.has(m.id)) merged = upsertMessage(merged, m);
  }
  groupMessages[groupId] = merged;
}

// ---------------------------------------------------------------------------
// Ingestion (relay subscription → store + Dexie write-through)
// ---------------------------------------------------------------------------

async function ingestRoomRow(roomId, peerPubkey, row, options = {}) {
  if (!roomId || !row?.id) return;
  const persist = options.persist !== false;

  const list = roomMessages[roomId] || [];
  const isNew = !list.some((entry) => entry.id === row.id);
  roomMessages[roomId] = upsertMessage(list, row);

  // Update meta
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
    void putCachedRoomMessage(roomId, row).catch(() => {});
    void putRoomMeta(roomId, patch).catch(() => {});
    broadcastCacheEvent({ type: "room-message", roomId });
  }
}

async function ingestIncomingDirectMessage(identity, row, options = {}) {
  const selfPubkey = normalizeNostrPubkey(identity.pubkeyHex);
  const peerPubkey = normalizeNostrPubkey(row?.peerPubkey);
  if (!selfPubkey || !peerPubkey) return;

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
  await ingestRoomRow(roomId, peerPubkey, normalizedRow, options);

  if (!options.silent && !row.mine && row.type !== "call-event") {
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

/**
 * Refresh group meta from Dexie (after groupsApi has applied a snapshot/removal
 * envelope and updated its own records). Cheap because it's just one row read.
 */
async function refreshGroupMeta(groupId) {
  if (!groupId) return;
  const meta = await getStoredGroup(groupId).catch(() => null);
  if (meta) groupMeta[groupId] = meta;
}

// ---------------------------------------------------------------------------
// Sends — optimistic, write to relay, reconcile via subscription echo
// ---------------------------------------------------------------------------

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

  // Sign first so the optimistic row carries the canonical relay event id.
  // Without this the subscription echo (which uses event.id) lands as a second
  // row before publish() resolves, briefly showing two bubbles.
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

/** Discard a failed (or still-pending) optimistic DM message from the store. */
function dropOptimistic(roomId, messageId) {
  if (!roomId || !messageId) return;
  // Also remove from the retry queue in case the message hasn't been sent yet.
  dequeueTask(messageId);
  const list = roomMessages[roomId] || [];
  roomMessages[roomId] = removeMessage(list, messageId);
}

/** Discard a failed (or still-pending) optimistic group message from the store. */
function dropGroupOptimistic(groupId, messageId) {
  if (!groupId || !messageId) return;
  dequeueTask(messageId);
  const list = groupMessages[groupId] || [];
  groupMessages[groupId] = removeMessage(list, messageId);
}

/**
 * @param {object} identity
 * @param {string} groupId
 * @param {object} payload
 * @param {{ onConfirmed?: (confirmedMsg: object) => void }} [opts]
 */
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

  // Wrap the publish in the send queue so the message retries automatically
  // on transient failures instead of immediately going to "failed".
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

// ---------------------------------------------------------------------------
// Backfill — pull recent history from relays so devices that were offline
// catch up. Runs once per identity at startup.
// ---------------------------------------------------------------------------

async function backfillPeer(identity, self, peer) {
  const roomId = await dmRoomId(self, peer);
  const cached = roomMeta[roomId];
  const cursor = await getSyncCursor(peer).catch(() => null);
  const sinceMs = Math.max(Number(cached?.lastMessageTs || 0), Number(cursor?.lastSyncMs || 0));
  const { messages } = await api
    .getDirectMessages(identity.privkeyHex, self, peer, sinceMs)
    .catch(() => ({ messages: [] }));

  const fresh = messages
    .filter(isChatRow)
    .map((row) => ({ ...row, peerPubkey: peer, status: row.mine ? "sent" : undefined }));
  if (!fresh.length) return;

  await cacheRoomMessages(roomId, fresh).catch(() => {});
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

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

let dmSub = null;
let groupSub = null;
let dmRestartTimer = null;
let groupRestartTimer = null;
let _callSignalHandler = null;

export function setCallSignalHandler(fn) {
  _callSignalHandler = fn;
}

function startDmSubscription(identity) {
  dmSub?.unsubscribe?.();
  dmSub = api.subscribeAllDirectMessages(
    identity.privkeyHex,
    identity.pubkeyHex,
    {
      next(row) {
        if (isCallSignalType(row?.type)) {
          const msgs = roomMessages[row.sender] || [];
          let sentCount = 0;
          for (let i = 0; i < msgs.length; i++) {
            if (msgs[i].mine && TRUST_ADVANCING_TYPES.has(msgs[i].type)) sentCount++;
            if (sentCount >= 7) break;
          }
          if (sentCount < 7) {
            console.warn(
              `[WebRTC-Call] Dropped call signal from ${row.sender} (trust gate: sent ${sentCount}/7 msgs)`,
            );
            return;
          }
          _callSignalHandler?.(row);
          return;
        }
        if (row?.type?.startsWith("webrtc-")) {
          const msgs = roomMessages[row.sender] || [];
          let sentCount = 0;
          for (let i = 0; i < msgs.length; i++) {
            if (msgs[i].mine && TRUST_ADVANCING_TYPES.has(msgs[i].type)) sentCount++;
            if (sentCount >= 7) break;
          }
          // Strict trust gate: must have sent 7 messages to prevent P2P IP leaks to strangers
          if (sentCount < 7) {
            console.warn(
              `[WebRTC-File] Dropped transfer signal from ${row.sender} (trust gate: sent ${sentCount}/7 msgs)`,
            );
            return;
          }

          import("@/lib/webrtcTransfer")
            .then((m) => m.handleWebrtcSignal(row))
            .catch(console.error);
          return;
        }
        void ingestIncomingDirectMessage(identity, row);
      },
      error() {
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

function startGroupSubscription(identity) {
  groupSub?.unsubscribe?.();
  groupSub = groupsApi.subscribeAllGroups(identity, {
    next(row) {
      if (!row?.groupId) return;
      const mine = row.sender === identity.pubkeyHex;
      ingestGroupRow(row.groupId, { ...row, mine });
      if (!mine && CHAT_TYPES.has(row.type)) {
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

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let bootPromise = null;

async function start(identity) {
  await identity.init();
  const next = normalizeNostrPubkey(identity.pubkeyHex);
  if (!next || !identity.privkeyHex) return;
  if (activePubkey.value === next && bootPromise) return bootPromise;
  if (activePubkey.value && activePubkey.value !== next) stop();

  activePubkey.value = next;
  bootPromise = (async () => {
    await hydrateInbox();
    startDmSubscription(identity);
    startGroupSubscription(identity);
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

  // Cancel all queued sends for the outgoing identity so they don't
  // fire after sign-out and mutate a cleared/different reactive store.
  cancelAllTasks();

  // Wipe in-memory state so a different identity can't leak through.
  for (const key of Object.keys(roomMessages)) delete roomMessages[key];
  for (const key of Object.keys(roomMeta)) delete roomMeta[key];
  for (const key of Object.keys(groupMessages)) delete groupMessages[key];
  for (const key of Object.keys(groupMeta)) delete groupMeta[key];
  hydratedRooms.clear();
  hydratedGroups.clear();
  hydratedInbox.value = false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const messenger = {
  // Reactive state
  roomMessages,
  roomMeta,
  groupMessages,
  groupMeta,
  hydratedInbox,
  activePubkey,

  // Lifecycle
  start,
  stop,

  // Hydration (call from view onMounted)
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

  // Sends (optimistic)
  sendDirectMessage,
  sendGroupMessage,
  dropOptimistic,
  dropGroupOptimistic,

  // Manual ingestion (used by upload flows that need to insert with media key)
  ingestRoomRow,
  ingestGroupRow,
  refreshGroupMeta,

  // Send engine diagnostics
  getSendQueueSnapshot,
  getSendTimingStats,

  // Cleanup helpers
  removeRoomMessage(roomId, messageId) {
    if (!roomId || !messageId) return;
    const list = roomMessages[roomId] || [];
    roomMessages[roomId] = removeMessage(list, messageId);
    void deleteCachedRoomMessage(messageId).catch(() => {});
  },
};

export default messenger;
