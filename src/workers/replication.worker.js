// Replication worker: coordinates outbox push, monotonic stream pull,
// and cold range reconciliation against remote Rabta relays.
// Adaptive cadence: 2.5s active / 10s idle / 60s hidden.
import { createEngineStore } from "../lib/engine/store.js";
import { createBlobAdapter } from "../lib/engine/blobs.js";
import {
  blobHashesOf,
  postEventOnce,
  putBlobToRelay,
  syncCycle,
} from "../lib/engine/core.js";

const ACTIVE_INTERVAL_MS = 2500;
const IDLE_INTERVAL_MS = 10000;
const HIDDEN_INTERVAL_MS = 60000;
const MAX_BACKOFF_MS = 120000;
const COLD_RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // Cold bisection sweep every 5 min

const PRIORITY_ACK_WAIT_MS = 2500;
const PRIORITY_QUEUE_MAX = 256;
const BLOB_PRIORITY_MAX = 4;

let config = { pubkeyHex: null, relays: [] };
let busy = false;
let pendingTick = false;
let consecutiveFailures = 0;
let timer = null;
let cycles = 0;
let lastOutbox = null;
let lastCycleStartedAt = 0;
let lastColdReconcileAt = 0;
let hidden = false;

const relayHealth = new Map();
const priorityQueue = [];
const priorityQueued = new Set();
let priorityBusy = false;
const blobPriorityInflight = new Set();

function post(type, payload) {
  self.postMessage({ type, ...payload });
}

function log(msg) {
  post("log", { msg });
}

function engineStore() {
  return createEngineStore({
    blobs: createBlobAdapter(config.relays),
    log,
    selfHex: config.pubkeyHex,
  });
}

function getCadenceMs() {
  if (pendingTick || priorityQueue.length) return 0;
  if (hidden) return HIDDEN_INTERVAL_MS;
  const base = consecutiveFailures > 0 ? IDLE_INTERVAL_MS : ACTIVE_INTERVAL_MS;
  return Math.min(MAX_BACKOFF_MS, base * 2 ** Math.min(consecutiveFailures, 4));
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!config.pubkeyHex || !config.relays.length) return;
  const delay = getCadenceMs();
  timer = setTimeout(runCycle, delay);
}

function kickCycle() {
  if (busy) {
    pendingTick = true;
    return;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(runCycle, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Priority Outbox: Immediate push on send
// ─────────────────────────────────────────────────────────────────────────────

function enqueuePriority(id) {
  const key = String(id || "").toLowerCase();
  if (!key || priorityQueued.has(key)) return;
  priorityQueued.add(key);
  priorityQueue.push(key);
  if (priorityQueued.size > PRIORITY_QUEUE_MAX) {
    for (const old of priorityQueued) {
      if (priorityQueued.size <= PRIORITY_QUEUE_MAX) break;
      priorityQueued.delete(old);
    }
  }
  void drainPriority();
}

function pushPriorityEvent(id, event) {
  return new Promise((resolve) => {
    const relays = [...config.relays];
    if (!relays.length) {
      resolve();
      return;
    }
    let pending = relays.length;
    let acked = false;
    let finished = false;
    let waitTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (waitTimer) clearTimeout(waitTimer);
      resolve();
    };
    waitTimer = setTimeout(finish, PRIORITY_ACK_WAIT_MS);

    for (const relay of relays) {
      postEventOnce(relay, event)
        .then((ok) => {
          if (!ok || acked) return;
          acked = true;
          post("acked", { ids: [id] });
          finish(); // Fast-ack on 1st successful relay
        })
        .catch((err) => {
          log(`priority push ${id.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
        })
        .finally(() => {
          pending -= 1;
          if (pending === 0) finish();
        });
    }
  });
}

async function pushPriorityBlobs(event, store) {
  const hashes = blobHashesOf(event);
  if (!hashes.length) return;
  const relays = [...config.relays];
  for (const hash of hashes) {
    if (blobPriorityInflight.size >= BLOB_PRIORITY_MAX) return;
    if (blobPriorityInflight.has(hash)) continue;
    blobPriorityInflight.add(hash);
    try {
      const bytes = await store.getBlobBytes(hash);
      if (!bytes) continue;
      await Promise.allSettled(
        relays.map((relay) => putBlobToRelay(relay, hash, bytes, { retries: 1 })),
      );
    } catch (err) {
      log(`priority blob ${hash.slice(0, 12)} failed: ${err?.message || err}`);
    } finally {
      blobPriorityInflight.delete(hash);
    }
  }
}

async function drainPriority() {
  if (priorityBusy || !priorityQueue.length) return;
  if (!config.pubkeyHex || !config.relays.length) return;
  priorityBusy = true;
  try {
    const store = engineStore();
    while (priorityQueue.length) {
      const id = priorityQueue.shift();
      let event = null;
      try {
        const rows = await store.getEventsByIds([id]);
        event = rows.find((row) => row.id === id)?.event || null;
      } catch (err) {
        log(`priority read ${id.slice(0, 12)} failed: ${err?.message || err}`);
      }
      if (event) {
        void pushPriorityBlobs(event, store);
        await pushPriorityEvent(id, event);
      }
    }
  } finally {
    priorityBusy = false;
    if (priorityQueue.length) void drainPriority();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Replication Cycle
// ─────────────────────────────────────────────────────────────────────────────

async function runCycle(forceReconcile = false) {
  if (!config.pubkeyHex || !config.relays.length) return;
  if (busy) {
    pendingTick = true;
    return;
  }

  busy = true;
  pendingTick = false;
  lastCycleStartedAt = Date.now();
  const startedAt = lastCycleStartedAt;

  const now = Date.now();
  const shouldReconcile =
    forceReconcile || cycles === 0 || now - lastColdReconcileAt >= COLD_RECONCILE_INTERVAL_MS;

  try {
    const summary = await syncCycle({
      store: engineStore(),
      pubkeyHex: config.pubkeyHex,
      relays: config.relays,
      log,
      onAck: (id) => post("acked", { ids: [id] }),
      fullReconcile: shouldReconcile,
    });

    if (shouldReconcile) {
      lastColdReconcileAt = now;
    }

    cycles++;
    consecutiveFailures = summary.errors.length ? Math.min(consecutiveFailures + 1, 5) : 0;
    if (summary.outbox) lastOutbox = summary.outbox;

    post("summary", { ...summary, cycle: cycles, durationMs: Date.now() - startedAt });
    if (summary.pulledIds?.length) post("ingested", { ids: summary.pulledIds });
  } catch (err) {
    consecutiveFailures = Math.min(consecutiveFailures + 1, 5);
    log(`cycle crashed: ${err?.message || err}`);
    post("summary", {
      pushedEvents: 0,
      pulledEvents: 0,
      pushedBlobs: 0,
      pulledBlobs: 0,
      errors: [String(err?.message || err)],
      cycle: ++cycles,
      durationMs: Date.now() - startedAt,
      outbox: lastOutbox,
    });
  } finally {
    busy = false;
    scheduleNext();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Message Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

self.onmessage = (msg) => {
  const {
    type,
    pubkeyHex,
    relays = null,
    priorityId = null,
    hidden: nextHidden,
  } = msg?.data || {};

  if (type === "config") {
    config = {
      pubkeyHex: String(pubkeyHex || "").toLowerCase(),
      relays: Array.isArray(relays) ? relays.filter(Boolean) : [],
    };
    hidden = Boolean(nextHidden);
    consecutiveFailures = 0;
    relayHealth.clear();
    lastColdReconcileAt = 0;
    log(`worker configured: ${config.pubkeyHex.slice(0, 8)} across ${config.relays.length} relay(s)`);
    post("ready", { relays: config.relays.length });
    void runCycle(true); // Initial run performs cold reconciliation
  } else if (type === "tick") {
    if (priorityId) enqueuePriority(priorityId);
    kickCycle();
  } else if (type === "reconcile") {
    void runCycle(true);
  } else if (type === "visibility") {
    const wasHidden = hidden;
    hidden = Boolean(nextHidden);
    if (wasHidden && !hidden) {
      // Just became visible: wake up immediately
      kickCycle();
    }
  } else if (type === "stop") {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingTick = false;
    priorityQueue.length = 0;
    priorityQueued.clear();
    priorityBusy = false;
    relayHealth.clear();
    config = { pubkeyHex: null, relays: [] };
  }
};
