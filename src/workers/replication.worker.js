// Replication worker: the only process that talks to Rabta relays for local
// data. Owns a second Dexie connection, pushes local unsynced data out, pulls
// everything addressed to us / owned by us in — with exponential backoff.
import { createEngineStore } from "../lib/engine/store.js";
import { createBlobAdapter } from "../lib/engine/blobs.js";
import { pollChatHeads, postEventOnce, syncCycle } from "../lib/engine/core.js";

const HOT_INTERVAL_MS = 2000; // pending outbox work or unfinished backfill
const IDLE_INTERVAL_MS = 60 * 1000;
const IDLE_MAX_INTERVAL_MS = 10 * 60 * 1000;

// Fast receive: a cheap head probe on its own cadence, independent of the
// full sync. One slow relay must not stretch the interval, hence the circuit
// breaker below.
const CHAT_VISIBLE_MS = 500;
const CHAT_HIDDEN_MS = 1000;
const CHAT_BACKOFF_MAX_MS = 15 * 1000;
const CHAT_OWNER_EVERY = 6; // owner probe roughly every 3s while visible
const RELAY_SKIP_BASE_MS = 1500;
const RELAY_SKIP_MAX_MS = 15 * 1000;
const RELAY_PROBE_ALL_MS = 30 * 1000;
const PRIORITY_ACK_WAIT_MS = 2500;
const PRIORITY_QUEUE_MAX = 256;

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
let lastCycleStartedAt = 0;

let hidden = false;
let chatFailures = 0;
let chatTick = 0;
let lastRelayProbeAll = 0;
const relayHealth = new Map();

const priorityQueue = [];
const priorityQueued = new Set();
let priorityBusy = false;

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

function currentIntervalMs() {
  if (hasWork || pendingTick) return HOT_INTERVAL_MS;
  return Math.min(IDLE_INTERVAL_MS * 2 ** consecutiveFailures, IDLE_MAX_INTERVAL_MS);
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  if (!config.pubkeyHex) return;
  // A tick that arrived during a running cycle must not wait for the hot
  // interval: start the next cycle as soon as this one finishes.
  timer = setTimeout(runCycle, pendingTick ? 0 : currentIntervalMs());
}

function chatJitter(interval) {
  return interval * (Math.random() * 0.2 - 0.05);
}

function scheduleChatPoll(elapsedMs = 0) {
  if (chatTimer) clearTimeout(chatTimer);
  chatTimer = null;
  if (!config.pubkeyHex || !config.relays.length) return;
  const base = hidden ? CHAT_HIDDEN_MS : CHAT_VISIBLE_MS;
  const interval = chatFailures
    ? Math.min(CHAT_BACKOFF_MAX_MS, base * 2 ** Math.min(chatFailures, 5))
    : base;
  const delay = Math.max(0, interval - elapsedMs + chatJitter(interval));
  chatTimer = setTimeout(() => {
    chatTimer = null;
    void runChatPoll();
  }, delay);
}

/** Skip relays that just failed, but retry everything periodically. */
function fastRelayList() {
  const now = Date.now();
  if (now - lastRelayProbeAll >= RELAY_PROBE_ALL_MS) {
    lastRelayProbeAll = now;
    return config.relays;
  }
  const healthy = config.relays.filter((relay) => (relayHealth.get(relay)?.skipUntil || 0) <= now);
  return healthy.length ? healthy : config.relays;
}

function noteRelayHealth(outcomes) {
  const now = Date.now();
  for (const [relay, ok] of outcomes || []) {
    if (ok) {
      relayHealth.set(relay, { failures: 0, skipUntil: 0 });
      continue;
    }
    const failures = (relayHealth.get(relay)?.failures || 0) + 1;
    const cooldown = Math.min(RELAY_SKIP_MAX_MS, RELAY_SKIP_BASE_MS * 2 ** (failures - 1));
    relayHealth.set(relay, {
      failures,
      skipUntil: now + cooldown * (0.8 + Math.random() * 0.4),
    });
  }
}

/** Coalesce fast-path ingests into at most one full cycle per hot interval. */
function kickCycle() {
  if (busy) {
    pendingTick = true;
    return;
  }
  const wait = Math.max(0, HOT_INTERVAL_MS - (Date.now() - lastCycleStartedAt));
  if (timer) clearTimeout(timer);
  timer = setTimeout(runCycle, wait);
}

/** Poll only the newest chat heads; full sync stays on its slower timer. */
async function runChatPoll() {
  if (!config.pubkeyHex || !config.relays.length) return;
  if (chatBusy) {
    scheduleChatPoll();
    return;
  }
  chatBusy = true;
  const startedAt = Date.now();
  try {
    const includeOwner = chatTick % CHAT_OWNER_EVERY === 0;
    chatTick += 1;
    const summary = await pollChatHeads({
      store: engineStore(),
      pubkeyHex: config.pubkeyHex,
      relays: fastRelayList(),
      log,
      includeOwner,
    });
    noteRelayHealth(summary.relayOk);
    chatFailures = summary.relayOk?.some(([, ok]) => ok) ? 0 : Math.min(chatFailures + 1, 5);
    if (summary.pulledIds?.length) {
      post("ingested", { ids: summary.pulledIds });
      // Let a full cycle converge blobs and cursors for the new message.
      kickCycle();
    }
  } catch (err) {
    chatFailures = Math.min(chatFailures + 1, 5);
    log(`chat poll crashed: ${err?.message || String(err)}`);
  } finally {
    chatBusy = false;
    scheduleChatPoll(Date.now() - startedAt);
  }
}

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

/**
 * Push one freshly published event ahead of the outbox scan. Relays get the
 * POST in parallel and the UI is acked on the first success; the regular cycle
 * still converges the remaining relays and any blobs.
 */
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
          // Move the queue on at the first success; slower relays keep
          // uploading in the background and the full cycle converges them.
          finish();
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
      if (event) await pushPriorityEvent(id, event);
    }
  } finally {
    priorityBusy = false;
    if (priorityQueue.length) void drainPriority();
  }
}

async function runCycle() {
  if (!config.pubkeyHex) return;
  if (busy) {
    // The running cycle schedules the immediate follow-up when it finishes.
    pendingTick = true;
    return;
  }
  if (!config.relays.length) {
    pendingTick = false;
    scheduleNext();
    return;
  }
  busy = true;
  pendingTick = false;
  lastCycleStartedAt = Date.now();
  const startedAt = lastCycleStartedAt;
  try {
    const summary = await syncCycle({
      store: engineStore(),
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
    log(`cycle crashed: ${err?.message || err}`);
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
  const { type, pubkeyHex, relays = null, priorityId = null, hidden: nextHidden } = msg?.data || {};
  if (type === "config") {
    config = {
      pubkeyHex: String(pubkeyHex || "").toLowerCase(),
      relays: Array.isArray(relays) ? relays.filter(Boolean) : [],
    };
    hidden = Boolean(nextHidden);
    chatFailures = 0;
    chatTick = 0;
    relayHealth.clear();
    lastRelayProbeAll = 0;
    log(`worker configured: ${config.pubkeyHex.slice(0, 8)} x ${config.relays.length} relays`);
    post("ready", { relays: config.relays.length });
    void runCycle();
    scheduleChatPoll();
  } else if (type === "tick") {
    if (priorityId) enqueuePriority(priorityId);
    kickCycle();
  } else if (type === "visibility") {
    hidden = Boolean(nextHidden);
    if (chatTimer) {
      clearTimeout(chatTimer);
      chatTimer = null;
    }
    if (!chatBusy) void runChatPoll();
  } else if (type === "stop") {
    if (timer) clearTimeout(timer);
    if (chatTimer) clearTimeout(chatTimer);
    timer = null;
    chatTimer = null;
    pendingTick = false;
    hasWork = false;
    priorityQueue.length = 0;
    priorityQueued.clear();
    priorityBusy = false;
    relayHealth.clear();
    config = { pubkeyHex: null, relays: [] };
  }
};
