// Replication worker: the only process that talks to Rabta relays for local
// data. Owns a second Dexie connection, pushes local unsynced data out, pulls
// everything addressed to us / owned by us in — with exponential backoff.
import { createEngineStore } from "../lib/engine/store.js";
import { createBlobAdapter } from "../lib/engine/blobs.js";
import { syncCycle } from "../lib/engine/core.js";

const HOT_INTERVAL_MS = 2000; // pending outbox work or unfinished backfill
const IDLE_INTERVAL_MS = 60 * 1000;
const IDLE_MAX_INTERVAL_MS = 10 * 60 * 1000;

let config = { pubkeyHex: null, relays: [] };
let busy = false;
let hasWork = false;
let pendingTick = false;
let consecutiveFailures = 0;
let timer = null;
let cycles = 0;
let lastOutbox = null;

function post(type, payload) {
  self.postMessage({ type, ...payload });
}

function log(msg) {
  post("log", { msg });
}

function currentIntervalMs() {
  if (hasWork || pendingTick) return HOT_INTERVAL_MS;
  return Math.min(IDLE_INTERVAL_MS * 2 ** consecutiveFailures, IDLE_MAX_INTERVAL_MS);
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(runCycle, currentIntervalMs());
}

async function runCycle() {
  if (busy || !config.pubkeyHex || !config.relays.length) {
    scheduleNext();
    return;
  }
  busy = true;
  pendingTick = false;
  const startedAt = Date.now();
  try {
    const store = createEngineStore({
      blobs: createBlobAdapter(config.relays),
      log,
      selfHex: config.pubkeyHex,
    });
    const summary = await syncCycle({
      store,
      pubkeyHex: config.pubkeyHex,
      relays: config.relays,
      log,
      onAck: (id) => post("acked", { ids: [id] }),
    });
    cycles++;
    consecutiveFailures = summary.errors.length ? Math.min(consecutiveFailures + 1, 10) : 0;
    hasWork = summary.outboxRemaining > 0 || summary.backfillMore;
    if (summary.outbox) lastOutbox = summary.outbox;

    post("summary", { ...summary, cycle: cycles, durationMs: Date.now() - startedAt });
    if (summary.pulledIds?.length) post("ingested", { ids: summary.pulledIds });
  } catch (err) {
    consecutiveFailures = Math.min(consecutiveFailures + 1, 10);
    hasWork = false;
    log(`cycle crashed: ${err?.message || String(err)}`);
    post("summary", {
      pushedEvents: 0,
      pulledEvents: 0,
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

self.onmessage = (msg) => {
  const { type, pubkeyHex, relays = null } = msg?.data || {};
  if (type === "config") {
    config = {
      pubkeyHex: String(pubkeyHex || "").toLowerCase(),
      relays: Array.isArray(relays) ? relays.filter(Boolean) : [],
    };
    log(`worker configured: ${config.pubkeyHex.slice(0, 8)} x ${config.relays.length} relays`);
    post("ready", { relays: config.relays.length });
    void runCycle();
  } else if (type === "tick") {
    if (busy) {
      pendingTick = true;
      return;
    }
    if (timer) clearTimeout(timer);
    void runCycle();
  } else if (type === "stop") {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingTick = false;
    hasWork = false;
  }
};
