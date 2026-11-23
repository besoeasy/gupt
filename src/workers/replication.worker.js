// Replication worker: coordinates outbox push, monotonic stream pull,
// and cold range reconciliation against remote Rabta relays.
// Adaptive cadence: 2.5s active / 10s idle / 60s hidden.
import { createEngineStore } from "../lib/engine/store.js";
import { createBlobAdapter } from "../lib/engine/blobs.js";
import { blobHashesOf, postEventOnce, putBlobToRelay, syncCycle } from "../lib/engine/core.js";
import { filterLiveRelays } from "../lib/relay/circuit.js";

const ACTIVE_INTERVAL_MS = 1000;
const IDLE_INTERVAL_MS = 3000;
const HIDDEN_INTERVAL_MS = 15000;
const MAX_BACKOFF_MS = 15000;
const COLD_RECONCILE_INTERVAL_MS = 60 * 1000; // Cold bisection sweep every 1 min

const PRIORITY_ACK_WAIT_MS = 6000;
// Must exceed the per-relay POST timeout (RELAY_RESPONSE_TIMEOUT_MS, 3s):
// the priority lane resolves on the first success, and a relay answering in
// 2.5–6s must still fast-ack instead of falling back to the batch cycle.
const PRIORITY_QUEUE_MAX = 256;
const HEARTBEAT_INTERVAL_MS = 10000;

let config = { pubkeyHex: null, relays: [], relayModes: {} };
let busy = false;
let pendingTick = false;
let consecutiveFailures = 0;
let timer = null;
let cycles = 0;
let lastOutbox = null;
let lastCycleStartedAt = 0;
let lastColdReconcileAt = 0;
let hidden = false;

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

// Proves the worker event loop is alive even during a long sync cycle. The
// main-thread watchdog uses this to distinguish a stuck cycle from a dead
// worker (and must not kill a legitimate large-attachment download).
setInterval(() => post("heartbeat"), HEARTBEAT_INTERVAL_MS);

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
    // Read-only nodes refuse every write; do not spend a priority slot on them.
    // Dead relays are skipped until their breaker expires (falls back to all
    // when every relay is dead).
    const writable = config.relays.filter(
      (relay) => String(config.relayModes?.[relay] || "").toLowerCase() !== "read_only",
    );
    const relays = filterLiveRelays(writable);
    if (!relays.length) {
      resolve();
      return;
    }
    let pending = relays.length;
    let acked = false;
    let finished = false;
    let waitTimer = null;
    const outcomes = [];
    const finish = () => {
      if (finished) return;
      finished = true;
      if (waitTimer) clearTimeout(waitTimer);
      resolve();
    };
    waitTimer = setTimeout(finish, PRIORITY_ACK_WAIT_MS);

    for (const relay of relays) {
      const startedAt = Date.now();
      postEventOnce(relay, event)
        .then((ok) => {
          outcomes.push({ relay, ok: Boolean(ok), latencyMs: Date.now() - startedAt });
          if (!ok || acked) return;
          acked = true;
          post("acked", { ids: [id] });
          finish(); // Fast-ack on 1st successful relay
        })
        .catch((err) => {
          outcomes.push({
            relay,
            ok: false,
            latencyMs: Date.now() - startedAt,
            error: err?.message || String(err),
          });
          log(`priority push ${id.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
        })
        .finally(() => {
          pending -= 1;
          if (pending === 0) {
            post("relayOutcomes", { operation: "publish", outcomes });
            finish();
          }
        });
    }
  });
}

async function pushPriorityBlobs(event, store) {
  const hashes = blobHashesOf(event);
  if (!hashes.length) return true;
  const writable = config.relays.filter(
    (relay) => String(config.relayModes?.[relay] || "").toLowerCase() !== "read_only",
  );
  const relays = filterLiveRelays(writable);
  if (!relays.length) return false;

  let ok = true;
  for (const hash of hashes) {
    // Another push already has this hash in flight; the outbox will retry.
    if (blobPriorityInflight.has(hash)) {
      ok = false;
      continue;
    }
    blobPriorityInflight.add(hash);
    try {
      const bytes = await store.getBlobBytes(hash);
      if (!bytes) {
        ok = false;
        continue;
      }
      const results = await Promise.allSettled(
        relays.map((relay) => putBlobToRelay(relay, hash, bytes, { retries: 1 })),
      );
      if (results.some((res) => res.status !== "fulfilled" || !res.value)) ok = false;
    } catch (err) {
      ok = false;
      log(`priority blob ${hash.slice(0, 12)} failed: ${err?.message || err}`);
    } finally {
      blobPriorityInflight.delete(hash);
    }
  }
  return ok;
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
        // Media must exist on the relays before the event that references it.
        const blobsReady = await pushPriorityBlobs(event, store);
        if (blobsReady) {
          await pushPriorityEvent(id, event);
        } else {
          log(`priority push ${id.slice(0, 12)} deferred: blob upload incomplete`);
        }
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
    forceReconcile ||
    (cycles > 0 &&
      (lastColdReconcileAt === 0 || now - lastColdReconcileAt >= COLD_RECONCILE_INTERVAL_MS));

  try {
    const summary = await syncCycle({
      store: engineStore(),
      pubkeyHex: config.pubkeyHex,
      relays: config.relays,
      relayModes: config.relayModes,
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
    relayModes = null,
    priorityId = null,
    hidden: nextHidden,
  } = msg?.data || {};

  if (type === "config") {
    config = {
      pubkeyHex: String(pubkeyHex || "").toLowerCase(),
      relays: Array.isArray(relays) ? relays.filter(Boolean) : [],
      relayModes: relayModes && typeof relayModes === "object" ? relayModes : {},
    };
    hidden = Boolean(nextHidden);
    consecutiveFailures = 0;
    lastColdReconcileAt = 0;
    log(
      `worker configured: ${config.pubkeyHex.slice(0, 8)} across ${config.relays.length} relay(s)`,
    );
    post("ready", { relays: config.relays.length });
    void runCycle(false); // Initial run performs fast hot pull first
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
    config = { pubkeyHex: null, relays: [], relayModes: {} };
  }
};
