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

import { reactive, ref } from "vue";

import { api } from "@/lib/api";
import { isCallSignalType } from "@/lib/calls";
import { dmRoomId, normalizeNostrPubkey, shortId } from "@/lib/crypto";
import { groupsApi } from "@/lib/groups";
import {
  cacheRoomMessages,
  deleteCachedRoomMessage,
  getRoomMeta,
  getStoredGroup,
  listCachedRoomMessages,
  listRoomMeta,
  listStoredGroupMessages,
  listStoredGroups,
  putCachedRoomMessage,
  putRoomMeta,
  putStoredGroup,
} from "@/lib/idb";
import { playMessageSound, showIncomingNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

/** roomId → MessageRow[] (sorted ascending by ts). */
const roomMessages = reactive({});
/** roomId → RoomMeta. */
const roomMeta = reactive({});
/** groupId → MessageRow[] (sorted ascending by ts). */
const groupMessages = reactive({});
/** groupId → GroupRecord. */
const groupMeta = reactive({});

const hydratedInbox = ref(false);
const hydratedRooms = new Set();
const hydratedGroups = new Set();

/** Current identity bound to the running subscription (or "" if none). */
const activePubkey = ref("");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAT_TYPES = new Set(["text", "voice", "media", "like", "react", "edit"]);
const PREVIEWABLE_TYPES = new Set(["text", "voice", "media"]);

function isChatRow(row) {
  return CHAT_TYPES.has(row?.type);
}

function tsOf(row) {
  return Number(row?.ts || row?.created_at || 0);
}

function previewText(row) {
  if (!row) return "";
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

function buildRoomMetaPatch(existing, row, peerPubkey) {
  const ts = tsOf(row);
  const previewable = PREVIEWABLE_TYPES.has(row.type);
  const newer = ts >= Number(existing?.lastMessageTs || 0);

  return {
    roomId: existing?.roomId,
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
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Hydration (Dexie → store)
// ---------------------------------------------------------------------------

async function hydrateInbox() {
  if (hydratedInbox.value) return;
  hydratedInbox.value = true;
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
  roomMessages[roomId] = upsertMessage(list, row);

  // Update meta
  const existingMeta = roomMeta[roomId] || { roomId };
  const patch = buildRoomMetaPatch(existingMeta, row, peerPubkey);
  roomMeta[roomId] = { ...existingMeta, ...patch };

  if (persist) {
    void putCachedRoomMessage(roomId, row).catch(() => {});
    void putRoomMeta(roomId, patch).catch(() => {});
  }
}

async function ingestIncomingDirectMessage(identity, row) {
  const selfPubkey = normalizeNostrPubkey(identity.pubkeyHex);
  const peerPubkey = normalizeNostrPubkey(row?.peerPubkey);
  if (!selfPubkey || !peerPubkey || !isChatRow(row)) return;

  const roomId = await dmRoomId(selfPubkey, peerPubkey);

  // Echo of our own optimistic message → mark sent and replace.
  const normalizedRow = { ...row, peerPubkey, status: row.mine ? "sent" : undefined };
  await ingestRoomRow(roomId, peerPubkey, normalizedRow);

  if (!row.mine) {
    void playMessageSound();
    showIncomingNotification({ tag: peerPubkey });
  }
}

function ingestGroupRow(groupId, row, options = {}) {
  if (!groupId || !row?.id) return;
  const persist = options.persist !== false;

  const list = groupMessages[groupId] || [];
  groupMessages[groupId] = upsertMessage(list, row);

  // Update group meta lastMessageTs
  const existingMeta = groupMeta[groupId];
  if (existingMeta) {
    const ts = tsOf(row);
    if (ts > Number(existingMeta.lastMessageTs || 0)) {
      groupMeta[groupId] = {
        ...existingMeta,
        lastMessageTs: ts,
        updatedAt: Date.now(),
      };
      if (persist) {
        void putStoredGroup(groupMeta[groupId]).catch(() => {});
      }
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
  const optimistic = makeOptimisticDmRow(identity, payload);

  // Optimistic insert (no Dexie write for pending messages — wait for relay confirmation).
  await ingestRoomRow(roomId, peer, optimistic, { persist: false });

  try {
    const { id: confirmedId } = await api.postDirectMessage(identity.privkeyHex, peer, payload);
    const finalId = confirmedId || optimistic.id;

    if (finalId !== optimistic.id) {
      // Replace temp row with confirmed id (no UI flicker — done in one tick).
      const list = roomMessages[roomId] || [];
      let next = removeMessage(list, optimistic.id);
      const confirmed = { ...optimistic, id: finalId, status: "sent" };
      next = upsertMessage(next, confirmed);
      roomMessages[roomId] = next;
      void putCachedRoomMessage(roomId, confirmed).catch(() => {});
    } else {
      await ingestRoomRow(roomId, peer, { ...optimistic, status: "sent" });
    }

    return { id: finalId };
  } catch (err) {
    await ingestRoomRow(
      roomId,
      peer,
      { ...optimistic, status: "failed", error: err.message || String(err) },
      { persist: false },
    );
    throw err;
  }
}

/** Discard a failed optimistic message from the store. */
function dropOptimistic(roomId, messageId) {
  if (!roomId || !messageId) return;
  const list = roomMessages[roomId] || [];
  roomMessages[roomId] = removeMessage(list, messageId);
}

async function sendGroupMessage(identity, groupId, payload) {
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
    epoch: groupMeta[groupId]?.currentEpoch || 1,
    status: "pending",
    mine: true,
  };

  ingestGroupRow(groupId, optimistic, { persist: false });

  try {
    // groupsApi.sendGroupMessage publishes the envelope and writes the canonical
    // message to Dexie under its own clientMsgId. Replace the temp row with
    // whatever it returns as the latest matching message.
    const messages = await groupsApi.sendGroupMessage(identity, groupId, payload);
    const latest = [...messages]
      .reverse()
      .find(
        (msg) =>
          msg.sender === self &&
          msg.type === optimistic.type &&
          (msg?.media?.key
            ? msg.media.key === optimistic.media?.key
            : (msg.text || "") === (optimistic.text || "")),
      );

    const list = groupMessages[groupId] || [];
    let next = removeMessage(list, tempId);
    if (latest) {
      next = upsertMessage(next, { ...latest, mine: true, status: "sent" });
    }
    groupMessages[groupId] = next;

    // Refresh meta (lastMessageTs already updated by groupsApi)
    await refreshGroupMeta(groupId);

    return latest || optimistic;
  } catch (err) {
    ingestGroupRow(
      groupId,
      { ...optimistic, status: "failed", error: err.message || String(err) },
      { persist: false },
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Backfill — pull recent history from relays so devices that were offline
// catch up. Runs once per identity at startup.
// ---------------------------------------------------------------------------

async function backfillFromRelays(identity) {
  const self = normalizeNostrPubkey(identity.pubkeyHex);
  if (!self || !identity.privkeyHex) return;

  // 1. Discover all peers we've ever talked to (fresh from relays)
  const { peers } = await api.listDirectPeers(self).catch(() => ({ peers: [] }));

  // 2. For each peer, fetch recent messages since our cached lastMessageTs
  await Promise.all(
    peers
      .map((p) => normalizeNostrPubkey(p))
      .filter(Boolean)
      .map(async (peer) => {
        const roomId = await dmRoomId(self, peer);
        const cached = roomMeta[roomId];
        const sinceMs = Number(cached?.lastMessageTs || 0);
        const { messages } = await api
          .getDirectMessages(identity.privkeyHex, self, peer, sinceMs)
          .catch(() => ({ messages: [] }));

        // Bulk write to Dexie + ingest into store (silent — no notifications)
        const fresh = messages
          .filter(isChatRow)
          .map((row) => ({ ...row, peerPubkey: peer, status: row.mine ? "sent" : undefined }));
        if (fresh.length) {
          void cacheRoomMessages(roomId, fresh).catch(() => {});
          for (const row of fresh) {
            await ingestRoomRow(roomId, peer, row, { persist: false });
          }
        }
      }),
  );

  // 3. Group sync delegates to groupsApi (it handles its own envelope merging).
  await groupsApi
    .syncAll(identity, { selfHandle: (identity.profileName || "").replace(/\s+/g, "") })
    .catch(() => null);

  // After groups.syncAll writes new state to Dexie, refresh in-memory meta
  // and message lists for every group we know about.
  const allGroups = await listStoredGroups().catch(() => []);
  for (const g of allGroups) {
    if (!g?.groupId) continue;
    groupMeta[g.groupId] = g;
    if (hydratedGroups.has(g.groupId)) {
      const msgs = await listStoredGroupMessages(g.groupId).catch(() => []);
      const existing = groupMessages[g.groupId] || [];
      const seen = new Set(existing.map((m) => m.id));
      let merged = existing.slice();
      for (const m of msgs) if (!seen.has(m.id)) merged = upsertMessage(merged, m);
      groupMessages[g.groupId] = merged;
    }
  }
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
          _callSignalHandler?.(row);
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
        showIncomingNotification({ tag: row.groupId });
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

  // Sends (optimistic)
  sendDirectMessage,
  sendGroupMessage,
  dropOptimistic,

  // Manual ingestion (used by upload flows that need to insert with media key)
  ingestRoomRow,
  ingestGroupRow,
  refreshGroupMeta,

  // Cleanup helpers
  removeRoomMessage(roomId, messageId) {
    if (!roomId || !messageId) return;
    const list = roomMessages[roomId] || [];
    roomMessages[roomId] = removeMessage(list, messageId);
    void deleteCachedRoomMessage(messageId).catch(() => {});
  },
};

export default messenger;
