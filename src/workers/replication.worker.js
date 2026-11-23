// Replication worker: coordinates outbox push, monotonic stream pull,
// and cold range reconciliation against remote Rabta relays.
// Adaptive cadence: 2.5s active / 10s idle / 60s hidden.
import { createEngineStore } from "../lib/engine/store.js";
import { createBlobAdapter } from "../lib/engine/blobs.js";
import { blobHashesOf, postEventOnce, putBlobToRelay, syncCycle } from "../lib/engine/core.js";
import { ENGINE_SEND_ROUNDS, relayAttemptTimeoutMs } from "../lib/engine/core.js";
import { rankRelays } from "../lib/relay/score.js";
import { filterLiveRelays } from "../lib/relay/circuit.js";
import { checkRelayHealth } from "../lib/rabta/index.js";
import { recordRelayOutcomes } from "../lib/idb.js";

const ACTIVE_INTERVAL_MS = 1000;
const IDLE_INTERVAL_MS = 3000;
const HIDDEN_INTERVAL_MS = 15000;
const MAX_BACKOFF_MS = 15000;
const COLD_RECONCILE_INTERVAL_MS = 60 * 1000; // Cold bisection sweep every 1 min
const CAPABILITIES_REFRESH_MS = 10 * 60 * 1000;

const PRIORITY_QUEUE_MAX = 256;
const HEARTBEAT_INTERVAL_MS = 10000;
// A message send must not wait for a whole cold pull. Short cycles still get
// the lane to themselves; once a cycle has run longer than this, the priority
// push goes out alongside it (relays treat a duplicate publish as success).
const PRIORITY_WAIT_GRACE_MS = 2000;

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
let pendingPriority = false;
const blobPriorityInflight = new Set();

function post(type, payload) {
  self.postMessage({ type, ...payload });
}

function log(msg) {
  post("log", { msg });
}

/** Same timeline as the main-thread [gupt:send] trace, for send stages that
 * only the worker can see (queueing, cycle blocking, relay selection). */
function trace(eventId, stage, detail = null) {
  const key = String(eventId || "").toLowerCase();
  if (!key) return;
  post("trace", { eventId: key, stage, detail });
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
// Relay capabilities: what each node can actually store
// ─────────────────────────────────────────────────────────────────────────────

let capabilitiesProbeAt = 0;
let capabilitiesBusy = false;

/**
 * Read GET /api/v1/node once per relay and persist the limits beside the
 * scores. The sender uses maxSingleBytes/remainingBytes to skip a relay that
 * cannot hold an attachment before spending a request on it. Probes run
 * sequentially and never block a send.
 */
async function probeRelayCapabilities() {
  if (capabilitiesBusy || !config.relays.length) return;
  capabilitiesBusy = true;
  const outcomes = [];
  try {
    for (const relay of filterLiveRelays(config.relays)) {
      try {
        const res = await checkRelayHealth(relay, {
          detailed: true,
          force: true,
          timeoutMs: 5000,
        });
        if (!res.ok) {
          outcomes.push({
            relay,
            ok: false,
            latencyMs: Number(res.latency) || 0,
            error: res.error || "Probe failed",
          });
          continue;
        }
        outcomes.push({
          relay,
          ok: true,
          latencyMs: Number(res.latency) || 0,
          mode: res.mode || undefined,
          maxSingleBytes: Number(res.maxSingleBytes) || 0,
          remainingBytes: Number(res.remainingBytes) || 0,
          writable: res.writable !== false,
        });
      } catch (err) {
        outcomes.push({
          relay,
          ok: false,
          latencyMs: 0,
          error: err?.message || String(err),
        });
      }
    }
    if (outcomes.length) await recordRelayOutcomes("connect", outcomes);
    capabilitiesProbeAt = Date.now();
  } catch (err) {
    log(`capability probe failed: ${err?.message || err}`);
  } finally {
    capabilitiesBusy = false;
  }
}

function maybeProbeCapabilities() {
  if (capabilitiesBusy) return;
  if (Date.now() - capabilitiesProbeAt < CAPABILITIES_REFRESH_MS) return;
  void probeRelayCapabilities();
}

// ─────────────────────────────────────────────────────────────────────────────
// Priority Outbox: Immediate push on send
// ─────────────────────────────────────────────────────────────────────────────

function enqueuePriority(id) {
  const key = String(id || "").toLowerCase();
  if (!key || priorityQueued.has(key)) return;
  priorityQueued.add(key);
  priorityQueue.push(key);
  trace(key, "priority-queued", { queue: priorityQueue.length });
  if (priorityQueued.size > PRIORITY_QUEUE_MAX) {
    for (const old of priorityQueued) {
      if (priorityQueued.size <= PRIORITY_QUEUE_MAX) break;
      priorityQueued.delete(old);
    }
  }
  void drainPriority();
}

async function pushPriorityEvent(id, event, store, readyRelays = null) {
  // Parallel fast lane: every ranked relay is asked at once, best score only
  // deciding the ranking. The first accept wakes the sender; the rest mirror
  // alongside it. Per-relay state is persisted on the outbox row, so a restart
  // (or the batch pass that follows) never re-asks a relay that already has it.
  const writable = config.relays.filter(
    (relay) => String(config.relayModes?.[relay] || "").toLowerCase() !== "read_only",
  );
  const candidates = filterLiveRelays(writable);
  if (!candidates.length) {
    trace(id, "priority-no-live-relays", { writable: writable.length });
    return;
  }
  let scores = null;
  try {
    scores = await store.getRelayScores?.();
  } catch {}
  const isBlobSend = blobHashesOf(event).length > 0;
  const ordered = rankRelays(candidates, scores, {
    operation: isBlobSend ? "blob" : "publish",
    relayModes: config.relayModes,
  });
  const available = readyRelays ? ordered.filter((relay) => readyRelays.has(relay)) : ordered;
  if (!available.length) {
    trace(id, "priority-no-ready-relay");
    return;
  }
  trace(id, "priority-push-start", {
    relays: available.length,
    blobSend: isBlobSend,
  });
  let entry = null;
  try {
    entry = await store.getOutboxEntry?.(id);
  } catch {}
  const previous =
    entry?.relayStates && typeof entry.relayStates === "object" ? entry.relayStates : {};
  const alreadyOk = new Set(
    Object.entries(previous)
      .filter(([, state]) => state?.state === "ok")
      .map(([relay]) => relay),
  );
  const remaining = available.filter((relay) => !alreadyOk.has(relay));
  if (!remaining.length) {
    if (ordered.length && ordered.every((relay) => alreadyOk.has(relay))) {
      await store.completeOutboxEvent?.(id).catch(() => {});
    }
    return;
  }

  // Every candidate relay at once: the fastest accept releases the sender, so
  // a dead or slow node never sits in front of a healthy one. Each attempt
  // persists its own relay state, and another round only runs if none
  // accepted (each round doubles the per-attempt budget).
  let acked = false;
  for (let round = 0; round < ENGINE_SEND_ROUNDS; round++) {
    const roundRelays = remaining.filter((relay) => !alreadyOk.has(relay));
    if (!roundRelays.length) break;
    await Promise.all(
      roundRelays.map(async (relay) => {
        const startedAt = Date.now();
        const outcome = { relay, ok: false, latencyMs: 0 };
        const timeoutMs = relayAttemptTimeoutMs(scores?.[relay]?.latencyMs, round);
        await store.recordOutboxRelayState?.(id, relay, { state: "trying", at: startedAt });
        post("sendReport", {
          report: { eventId: id, relay, state: "trying", timeoutMs, at: startedAt },
        });
        try {
          const ok = await postEventOnce(relay, event, { timeoutMs });
          outcome.ok = Boolean(ok);
          outcome.latencyMs = Date.now() - startedAt;
          await store.recordOutboxRelayState?.(id, relay, {
            state: outcome.ok ? "ok" : "error",
            latencyMs: outcome.latencyMs,
            error: outcome.ok ? null : "Relay did not accept the event",
            at: Date.now(),
          });
          post("relayOutcomes", {
            operation: "publish",
            outcomes: [{ ...outcome, eventId: id }],
          });
          post("sendReport", {
            report: {
              eventId: id,
              relay,
              state: outcome.ok ? "ok" : "error",
              latencyMs: outcome.latencyMs,
              at: Date.now(),
              error: outcome.ok ? null : "Relay did not accept the event",
            },
          });
          if (outcome.ok) {
            alreadyOk.add(relay);
            if (!acked) {
              acked = true;
              post("acked", { ids: [id] });
            }
            if (ordered.every((candidate) => alreadyOk.has(candidate))) {
              await store.completeOutboxEvent?.(id).catch(() => {});
              post("sendReport", { report: { eventId: id, state: "complete", at: Date.now() } });
            }
          }
        } catch (err) {
          outcome.ok = false;
          outcome.latencyMs = Date.now() - startedAt;
          outcome.error = err?.message || String(err);
          await store.recordOutboxRelayState?.(id, relay, {
            state: "error",
            latencyMs: outcome.latencyMs,
            error: outcome.error,
            at: Date.now(),
          });
          post("relayOutcomes", {
            operation: "publish",
            outcomes: [{ ...outcome, eventId: id }],
          });
          post("sendReport", {
            report: {
              eventId: id,
              relay,
              state: "error",
              latencyMs: outcome.latencyMs,
              at: Date.now(),
              error: outcome.error,
            },
          });
          log(`priority push ${id.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
        }
      }),
    );
    if (acked) break;
  }
  trace(id, "priority-no-accept", { rounds: ENGINE_SEND_ROUNDS, relays: remaining.length });
  log(`priority push ${id.slice(0, 12)}: no relay accepted after ${ENGINE_SEND_ROUNDS} round(s)`);
}

async function pushPriorityBlobs(event, store) {
  const hashes = blobHashesOf(event);
  if (!hashes.length) return { ok: true, ready: null };
  const writable = config.relays.filter(
    (relay) => String(config.relayModes?.[relay] || "").toLowerCase() !== "read_only",
  );
  const candidates = filterLiveRelays(writable);
  if (!candidates.length) return { ok: false, ready: null };
  let scores = null;
  try {
    scores = await store.getRelayScores?.();
  } catch {}

  const bytesByHash = new Map();
  for (const hash of hashes) {
    if (blobPriorityInflight.has(hash)) return { ok: false, ready: null };
    try {
      const bytes = await store.getBlobBytes(hash);
      if (!bytes) return { ok: false, ready: null };
      bytesByHash.set(hash, bytes);
    } catch {
      return { ok: false, ready: null };
    }
  }

  const maxBytes = Math.max(0, ...[...bytesByHash.values()].map((b) => b.byteLength || 0));
  const ordered = rankRelays(candidates, scores, {
    operation: "blob",
    relayModes: config.relayModes,
    blobSizeBytes: maxBytes,
  });

  // One relay that holds every part is enough to publish the event; the batch
  // cycle mirrors the same parts to the other relays afterwards. Trying every
  // relay here would make a media send wait on the slowest node twice.
  for (const relay of ordered) {
    const relayStartedAt = Date.now();
    let holdsAll = true;
    for (const hash of hashes) {
      const bytes = bytesByHash.get(hash);
      if (!bytes) {
        holdsAll = false;
        break;
      }
      if (blobPriorityInflight.has(hash)) {
        holdsAll = false;
        break;
      }
      blobPriorityInflight.add(hash);
      const startedAt = Date.now();
      post("sendReport", {
        report: { eventId: event.id, relay, state: "trying", at: startedAt, blob: true },
      });
      try {
        const stored = await putBlobToRelay(relay, hash, bytes, { retries: 1 });
        post("relayOutcomes", {
          operation: "blob",
          outcomes: [
            {
              relay,
              ok: Boolean(stored),
              latencyMs: Date.now() - startedAt,
              eventId: event.id,
            },
          ],
        });
        if (!stored) {
          holdsAll = false;
          post("sendReport", {
            report: {
              eventId: event.id,
              relay,
              state: "error",
              latencyMs: Date.now() - startedAt,
              at: Date.now(),
              error: "Relay refused the attachment",
            },
          });
          break;
        }
      } catch (err) {
        if ([413, 507, 429].includes(Number(err?.status))) void probeRelayCapabilities();
        holdsAll = false;
        post("relayOutcomes", {
          operation: "blob",
          outcomes: [
            {
              relay,
              ok: false,
              latencyMs: Date.now() - startedAt,
              error: err?.message || String(err),
              eventId: event.id,
            },
          ],
        });
        post("sendReport", {
          report: {
            eventId: event.id,
            relay,
            state: "error",
            latencyMs: Date.now() - startedAt,
            at: Date.now(),
            error: err?.message || String(err),
          },
        });
        log(`priority blob ${hash.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
        break;
      } finally {
        blobPriorityInflight.delete(hash);
      }
    }
    if (holdsAll) {
      post("sendReport", {
        report: {
          eventId: event.id,
          relay,
          state: "ok",
          latencyMs: Date.now() - relayStartedAt,
          at: Date.now(),
        },
      });
      return { ok: true, ready: new Set([relay]) };
    }
  }
  return { ok: false, ready: new Set() };
}

async function drainPriority() {
  if (priorityBusy || !priorityQueue.length) return;
  if (!config.pubkeyHex || !config.relays.length) {
    trace(priorityQueue[0], "worker-no-relays", {
      queue: priorityQueue.length,
      relays: config.relays.length,
    });
    return;
  }
  // One sender at a time: a short cycle holds the store and the relay queues,
  // so a priority send waits for it instead of pushing the same event twice.
  // A long cycle (cold pull, big attachment) yields after the grace period:
  // waiting minutes for it is what made sends look stuck.
  if (busy) {
    const cycleAgeMs = lastCycleStartedAt ? Date.now() - lastCycleStartedAt : null;
    if (cycleAgeMs === null || cycleAgeMs < PRIORITY_WAIT_GRACE_MS) {
      if (!pendingPriority) {
        trace(priorityQueue[0], "priority-blocked-by-cycle", {
          queue: priorityQueue.length,
          cycleAgeMs,
        });
      }
      pendingPriority = true;
      return;
    }
    trace(priorityQueue[0], "priority-bypassing-cycle", {
      queue: priorityQueue.length,
      cycleAgeMs,
    });
  }
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
        const blobs = await pushPriorityBlobs(event, store);
        if (blobs.ok) {
          await pushPriorityEvent(id, event, store, blobs.ready);
        } else {
          trace(id, "priority-blob-deferred");
          log(`priority push ${id.slice(0, 12)} deferred: blob upload incomplete`);
        }
      } else {
        trace(id, "priority-event-missing");
        log(`priority read ${id.slice(0, 12)} returned no event`);
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
    const activeStore = engineStore();
    let relayScores = null;
    try {
      relayScores = await activeStore.getRelayScores?.();
    } catch {}
    const summary = await syncCycle({
      store: activeStore,
      pubkeyHex: config.pubkeyHex,
      relays: config.relays,
      relayModes: config.relayModes,
      relayScores,
      log,
      onAck: (id) => post("acked", { ids: [id] }),
      onSend: (report) => post("sendReport", { report }),
      fullReconcile: shouldReconcile,
      pushOutbox: !priorityBusy,
    });

    if (shouldReconcile) {
      lastColdReconcileAt = now;
    }

    cycles++;
    consecutiveFailures = summary.errors.length ? Math.min(consecutiveFailures + 1, 5) : 0;
    if (summary.outbox) lastOutbox = summary.outbox;

    post("summary", { ...summary, cycle: cycles, durationMs: Date.now() - startedAt });
    if (summary.pulledIds?.length) post("ingested", { ids: summary.pulledIds });
    if (summary.capabilityStale) void probeRelayCapabilities();
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
    if (priorityQueue.length || pendingPriority) {
      pendingPriority = false;
      void drainPriority();
    }
    maybeProbeCapabilities();
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
    void probeRelayCapabilities();
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
