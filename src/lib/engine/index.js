// Engine facade (main thread). UI asks ONLY Dexie; relays are the sync
// worker's business. publishLocal is the single write door: local verify →
// store → outbox notify.
import { verifyEvent } from "../rabta/index.js";
import { markRawEventsApplied, putRawEvent } from "../idb.js";
import { getBlobBytes as fetchBlobBytes, putBlob as storeBlob } from "./blobs.js";

export { createBlobAdapter, getBlobBytes, hashBytes, putBlob, putVerifiedBlob } from "./blobs.js";
export { createEngineStore } from "./store.js";
export { syncCycle } from "./core.js";

const EPHEMERAL_COLLECTIONS = new Set(["gupt/chat/typing", "gupt/calls/signal"]);
const ACK_TTL_MS = 10 * 60 * 1000;
const ACK_CACHE_MAX = 512;

let notifyOutbox = null;
let syncRequester = null;
const ackWaiters = new Map();
const recentAcks = new Map();

export function setOutboxNotifier(fn) {
  notifyOutbox = typeof fn === "function" ? fn : null;
}

/** Registered by the bridge; lets the UI wait for one engine cycle. */
export function setSyncRequester(fn) {
  syncRequester = typeof fn === "function" ? fn : null;
}

export async function requestEngineSync(opts) {
  if (!syncRequester) return false;
  try {
    return await syncRequester(opts);
  } catch {
    return false;
  }
}

function rememberAck(key) {
  const now = Date.now();
  recentAcks.set(key, now);
  if (recentAcks.size > ACK_CACHE_MAX) {
    for (const [id, at] of recentAcks) {
      if (now - at > ACK_TTL_MS) recentAcks.delete(id);
    }
    // Still too big: drop the oldest entries.
    for (const id of recentAcks.keys()) {
      if (recentAcks.size <= ACK_CACHE_MAX) break;
      recentAcks.delete(id);
    }
  }
}

function wasAcked(key) {
  const at = recentAcks.get(key);
  if (!at) return false;
  if (Date.now() - at > ACK_TTL_MS) {
    recentAcks.delete(key);
    return false;
  }
  return true;
}

/** Called by the bridge when the worker confirms a relay stored an event id. */
export function notifyRelayAck(eventId) {
  const key = String(eventId || "").toLowerCase();
  if (!key) return;
  rememberAck(key);
  const waiter = ackWaiters.get(key);
  if (waiter) {
    clearTimeout(waiter.timer);
    ackWaiters.delete(key);
    waiter.resolve(true);
  }
}

export function waitForRelayAck(eventId, timeoutMs = 45000) {
  const key = String(eventId || "").toLowerCase();
  if (!key) return Promise.resolve(false);
  // The worker may have confirmed before the caller started waiting.
  if (wasAcked(key)) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ackWaiters.delete(key);
      reject(new Error("Relay sync ack timeout"));
    }, timeoutMs);
    ackWaiters.set(key, { resolve, timer });
  });
}

/**
 * The single write path. Verifies the signed envelope, stores it like an
 * inbound one (same denorm handling), then nudges the sync worker.
 * Ephemeral typing/call signals must never enter the engine.
 */
export async function publishLocal(event, { origin = "dm", ...denorm } = {}) {
  if (!event?.id) throw new Error("publishLocal: missing event");
  if (EPHEMERAL_COLLECTIONS.has(event.collection)) {
    throw new Error("ephemeral events bypass the engine");
  }
  if (!verifyEvent(event)) throw new Error("publishLocal: signature/identity invalid");

  await putRawEvent(event, origin, {
    peerPubkey: denorm.peerPubkey ?? null,
    roomId: denorm.roomId ?? null,
    groupId: denorm.groupId ?? null,
    type: denorm.type ?? null,
  });
  // The caller already renders this row; no boot-time re-parse needed.
  void markRawEventsApplied([event.id]).catch(() => {});

  try {
    notifyOutbox?.();
  } catch {
    // Best effort; the worker timer drains regardless.
  }
  return { id: event.id, synced: false };
}

/** Blob write door used by attachment uploads (verified + cached locally). */
export async function enginePutBlob(bytes, opts = {}) {
  return storeBlob(bytes, opts);
}

export async function engineGetBlob(hash, opts = {}) {
  return fetchBlobBytes(hash, opts);
}
