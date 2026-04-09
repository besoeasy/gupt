import { dmRoomId, normalizeNostrPubkey, shortId } from "@/lib/crypto";
import { cacheRoomMessages, getRoomMeta, listRoomMeta, putRoomMeta } from "@/lib/idb";
import { api } from "@/lib/api";
import { groupsApi } from "@/lib/groups";
import { showIncomingNotification } from "@/lib/notifications";

const FULL_BACKFILL_INTERVAL_MS = 30 * 1000;
const GROUP_SYNC_INTERVAL_MS = 20 * 1000;

let startedForPubkey = "";
let bootPromise = null;
let directSubscription = null;
let directTimer = null;
let groupTimer = null;

function isChatMessage(row) {
  return row?.type === "text" || row?.type === "voice" || row?.type === "media";
}

function getLatestChatTs(rows) {
  return rows.reduce((latest, row) => Math.max(latest, Number(row?.ts || row?.created_at || 0)), 0);
}

async function persistConversationRows(selfPubkey, peerPubkey, rows, options = {}) {
  const normalizedPeer = normalizeNostrPubkey(peerPubkey);
  if (!selfPubkey || !normalizedPeer) return null;

  const roomId = await dmRoomId(selfPubkey, normalizedPeer);
  const chatRows = rows
    .filter(isChatMessage)
    .map((row) => ({ ...row, peerPubkey: normalizedPeer }));
  if (chatRows.length) {
    await cacheRoomMessages(roomId, chatRows);
  }

  const existing = await getRoomMeta(roomId);
  await putRoomMeta(roomId, {
    peerPubkey: normalizedPeer,
    name: existing?.name || `DM · ${shortId(normalizedPeer)}`,
    type: "dm",
    replied: Boolean(options.replied) || Boolean(existing?.replied),
    lastMessageTs: Math.max(Number(existing?.lastMessageTs || 0), getLatestChatTs(chatRows)),
    updatedAt: Date.now(),
  });

  return roomId;
}

export async function syncDirectMessages(identity, options = {}) {
  await identity.init();
  const selfPubkey = normalizeNostrPubkey(identity.pubkeyHex);
  if (!selfPubkey || !identity.privkeyHex) return;

  const fullBackfill = Boolean(options.fullBackfill);
  const existingRooms = await listRoomMeta();
  const roomByPeer = new Map(
    existingRooms.filter((room) => room?.peerPubkey).map((room) => [room.peerPubkey, room]),
  );
  const { peers, sentToPeers } = await api
    .listDirectPeers(selfPubkey)
    .catch(() => ({ peers: [], sentToPeers: new Set() }));

  await Promise.all(
    peers
      .map((peerPubkey) => normalizeNostrPubkey(peerPubkey))
      .filter(Boolean)
      .map(async (peerPubkey) => {
        const room = roomByPeer.get(peerPubkey);
        // On a full backfill (cold start) pass 0 so the relay returns all available
        // history without a client-imposed floor. Incremental syncs use the local cursor.
        const prevTs = Number(room?.lastMessageTs || 0);
        const sinceMs = fullBackfill ? 0 : prevTs;
        const { messages } = await api
          .getDirectMessages(identity.privkeyHex, selfPubkey, peerPubkey, sinceMs)
          .catch(() => ({ messages: [] }));
        await persistConversationRows(selfPubkey, peerPubkey, messages, {
          replied: sentToPeers.has(peerPubkey),
        });
        // Notify for genuinely new incoming messages on incremental polls only
        // (skip cold-start backfill to avoid a flood of old notifications)
        if (!fullBackfill && prevTs > 0) {
          const newIncoming = messages.filter(
            (m) => isChatMessage(m) && !m.mine && Number(m.ts || 0) > prevTs,
          );
          console.log("[gupt-sync] poll result", {
            peer: peerPubkey?.slice(0, 8),
            total: messages.length,
            newIncoming: newIncoming.length,
            prevTs,
          });
          if (newIncoming.length) {
            console.log("[gupt-sync] poll found new message from", peerPubkey?.slice(0, 8));
            showIncomingNotification({ tag: peerPubkey });
          }
        } else {
          console.log("[gupt-sync] poll skipping sound", { fullBackfill, prevTs, msgCount: messages.length });
        }
      }),
  );
}

export async function syncGroups(identity) {
  await identity.init();
  const selfHandle = (identity.profileName || "").replace(/\s+/g, "");
  await groupsApi.syncAll(identity, { selfHandle }).catch(() => null);
}

function startDirectSubscription(identity) {
  directSubscription?.unsubscribe?.();
  directSubscription = api.subscribeAllDirectMessages(
    identity.privkeyHex,
    identity.pubkeyHex,
    {
      next(row) {
        console.log("[gupt-sync] subscription row", {
          type: row?.type,
          mine: row?.mine,
          peer: row?.peerPubkey?.slice(0, 8),
        });
        if (!isChatMessage(row)) {
          console.log("[gupt-sync] subscription: not a chat message, skipping sound");
          return;
        }
        if (!row.mine) {
          console.log("[gupt-sync] subscription: incoming message → playing sound");
          showIncomingNotification({ tag: row.peerPubkey });
        } else {
          console.log("[gupt-sync] subscription: own message, skipping sound");
        }
        void persistConversationRows(identity.pubkeyHex, row.peerPubkey, [row], {
          replied: row.mine,
        });
      },
      error(error) {
        console.warn("[gupt-sync] direct message subscription failed", error);
      },
    },
    Date.now() - 5000,
  );
}

function stopTimers() {
  if (directTimer) clearInterval(directTimer);
  if (groupTimer) clearInterval(groupTimer);
  directTimer = null;
  groupTimer = null;
}

export function stopAppSync() {
  directSubscription?.unsubscribe?.();
  directSubscription = null;
  stopTimers();
  startedForPubkey = "";
  bootPromise = null;
}

export function startAppSync(identity) {
  const nextPubkey = normalizeNostrPubkey(identity.pubkeyHex);
  if (!nextPubkey || !identity.privkeyHex) return Promise.resolve();
  if (startedForPubkey && startedForPubkey !== nextPubkey) {
    stopAppSync();
  }

  if (bootPromise && startedForPubkey === nextPubkey) {
    return bootPromise;
  }

  startedForPubkey = nextPubkey;
  bootPromise = (async () => {
    await Promise.all([syncDirectMessages(identity, { fullBackfill: true }), syncGroups(identity)]);

    startDirectSubscription(identity);
    stopTimers();
    directTimer = setInterval(() => {
      void syncDirectMessages(identity);
    }, FULL_BACKFILL_INTERVAL_MS);
    groupTimer = setInterval(() => {
      void syncGroups(identity);
    }, GROUP_SYNC_INTERVAL_MS);
  })().catch((err) => {
    // Allow a retry on next call if boot fails
    startedForPubkey = "";
    bootPromise = null;
    throw err;
  });

  return bootPromise;
}
