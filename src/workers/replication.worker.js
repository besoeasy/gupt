// Replication worker: the only process that talks to Rabta relays for local
// data. Owns a second Dexie connection, pushes local unsynced data out, pulls
// everything addressed to us / owned by us in — with exponential backoff.
import { createEngineStore } from "../lib/engine/store.js";
import { createBlobAdapter } from "../lib/engine/blobs.js";
import { pollChatHeads, syncCycle } from "../lib/engine/core.js";

const HOT_INTERVAL_MS = 2000; // pending outbox work or unfinished backfill
const CHAT_POLL_INTERVAL_MS = 3000; // main-thread live subscription no longer reads DMs
const IDLE_INTERVAL_MS = 60 * 1000;
const IDLE_MAX_INTERVAL_MS = 10 * 60 * 1000;

let config = { pubkeyHex: null, relays: [] };
let busy = false;
let chatBusy = false;
let hasWork = false;
let pendingTick = false;
let consecutiveFailures = 0;
let timer = null;
let chatTimer = null;
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
  if (!config.pubkeyHex) return;
  timer = setTimeout(runCycle, currentIntervalMs());
}

function scheduleChatPoll() {
  if (chatTimer) clearTimeout(chatTimer);
  if (!config.pubkeyHex || !config.relays.length) return;
  chatTimer = setTimeout(runChatPoll, CHAT_POLL_INTERVAL_MS);
}

/** Poll only the newest DM page; full sync stays on its slower timer. */
async function runChatPoll() {
  if (chatBusy || busy || !config.pubkeyHex || !config.relays.length) {
    scheduleChatPoll();
    return;
  }
  chatBusy = true;
  try {
    const store = createEngineStore({
      blobs: createBlobAdapter(config.relays),
      log,
      selfHex: config.pubkeyHex,
    });
    const summary = await pollChatHeads({
      store,
      pubkeyHex: config.pubkeyHex,
      relays: config.relays,
      log,
    });
    if (summary.pulledIds?.length) {
      post("ingested", { ids: summary.pulledIds });
      // Let a full cycle converge blobs and cursors for the new message.
      if (!busy) {
        if (timer) clearTimeout(timer);
        pendingTick = true;
        void runCycle();
      }
    }
  } catch (err) {
    log(`chat poll crashed: ${err?.message || String(err)}`);
  } finally {
    chatBusy = false;
    scheduleChatPoll();
  }
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
    scheduleChatPoll();
  } else if (type === "tick") {
    if (busy) {
      pendingTick = true;
      return;
    }
    if (timer) clearTimeout(timer);
    void runCycle();
  } else if (type === "stop") {
    if (timer) clearTimeout(timer);
    if (chatTimer) clearTimeout(chatTimer);
    timer = null;
    chatTimer = null;
    pendingTick = false;
    hasWork = false;
    config = { pubkeyHex: null, relays: [] };
  }
};
