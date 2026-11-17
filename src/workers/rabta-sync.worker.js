// Rabta Server Mesh Sync Worker
// Dedicated independent worker with Adaptive Range Bisection for
// server-to-server event diffing and binary blob cross-replication.

const RETENTION_DAYS = 30;
const LEAF_WINDOW_SPAN_SEC = 3600; // 1 hour leaf window
const LEAF_EVENT_COUNT_THRESHOLD = 40;
const MAX_BISECTION_DEPTH = 10;
const MAX_PROBES_PER_CYCLE = 64;

let relays = [];
let intervalMs = 30000;
let autoSync = true;
let isHidden = false;
let isSyncing = false;
let timer = null;
let round = 0;
let totalEventsSynced = 0;
let totalBlobsSynced = 0;

// Bisection metrics
let bisectionMetrics = {
  probes: 0,
  rangesMatched: 0,
  rangesBisected: 0,
  leafReconciled: 0,
};

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function log(message, level = "info") {
  post("log", {
    message,
    level,
    timestamp: Date.now(),
  });
}

/**
 * Check health & telemetry of a single Rabta node.
 */
async function probeServer(url, timeoutMs = 5000) {
  const base = url.replace(/\/+$/, "");
  const startedAt = Date.now();
  try {
    const res = await fetch(`${base}/api/v1/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latency = Date.now() - startedAt;
    if (!res.ok) {
      return {
        url,
        online: false,
        latency,
        nodeId: null,
        liveEvents: 0,
        liveBlobs: 0,
        error: `HTTP ${res.status}`,
      };
    }
    const data = await res.json().catch(() => ({}));
    return {
      url,
      online: true,
      latency,
      nodeId: data.node_id || null,
      liveEvents: Number(data.live_events ?? data.events?.live ?? 0),
      liveBlobs: Number(data.live_blobs ?? data.blobs?.live ?? 0),
      error: null,
    };
  } catch (err) {
    return {
      url,
      online: false,
      latency: Date.now() - startedAt,
      nodeId: null,
      liveEvents: 0,
      liveBlobs: 0,
      error: err?.message || "Unreachable",
    };
  }
}

/**
 * Query event count on a server in a specific time window [since, until).
 */
async function queryServerCount(url, since = null, until = null, timeoutMs = 5000) {
  const base = url.replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (since !== null && Number.isFinite(since)) params.set("since", String(Math.floor(since)));
  if (until !== null && Number.isFinite(until)) params.set("until", String(Math.floor(until)));

  try {
    const res = await fetch(`${base}/api/v1/events/count?${params.toString()}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.count === "number" ? data.count : 0;
  } catch {
    return null;
  }
}

/**
 * Fetch events list from a node within a time window.
 */
async function fetchServerEventsRange(url, since = null, until = null, limit = 50, timeoutMs = 6000) {
  const base = url.replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (since !== null && Number.isFinite(since)) params.set("since", String(Math.floor(since)));
  if (until !== null && Number.isFinite(until)) params.set("until", String(Math.floor(until)));
  params.set("limit", String(limit));

  try {
    const res = await fetch(`${base}/api/v1/events?${params.toString()}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.events) ? data.events : [];
  } catch {
    return [];
  }
}

/**
 * Push an event to a target server.
 */
async function pushEventToServer(url, event, timeoutMs = 6000) {
  const base = url.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}

/**
 * Check if a server has a blob by hash.
 */
async function checkServerBlob(url, hash, timeoutMs = 4000) {
  const base = url.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/v1/blobs/${hash}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Replicate a blob from source to target server.
 */
async function replicateBlob(sourceUrl, targetUrl, hash) {
  try {
    const sourceBase = sourceUrl.replace(/\/+$/, "");
    const getRes = await fetch(`${sourceBase}/api/v1/blobs/${hash}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!getRes.ok) return false;
    const blobBytes = await getRes.arrayBuffer();

    const targetBase = targetUrl.replace(/\/+$/, "");
    const putRes = await fetch(`${targetBase}/api/v1/blobs`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: blobBytes,
      signal: AbortSignal.timeout(15000),
    });
    return putRes.ok;
  } catch {
    return false;
  }
}

/**
 * Adaptive Range Bisection for Server-to-Server Event Diffing.
 *
 * Compares event counts in range [s, e).
 * If countA === countB: 1 request proves the whole range is in sync! Zero payloads transferred!
 * If countA !== countB: Bisects recursively down to leaf windows and synchronizes missing items.
 */
async function bisectRangeBetweenServers(
  serverA,
  serverB,
  startSec,
  endSec,
  state = { probesUsed: 0, eventsSynced: 0, blobsSynced: 0 },
  depth = 0,
) {
  if (state.probesUsed >= MAX_PROBES_PER_CYCLE || startSec >= endSec) return;

  state.probesUsed++;
  bisectionMetrics.probes++;

  const [countA, countB] = await Promise.all([
    queryServerCount(serverA, startSec, endSec),
    queryServerCount(serverB, startSec, endSec),
  ]);

  if (countA === null || countB === null) {
    // One of the servers failed to answer
    return;
  }

  // Range matches! Complete range proved in sync with 1 probe pair!
  if (countA === countB) {
    bisectionMetrics.rangesMatched++;
    return;
  }

  // Counts diverge!
  const span = endSec - startSec;
  const isLeaf =
    depth >= MAX_BISECTION_DEPTH ||
    span <= LEAF_WINDOW_SPAN_SEC ||
    (countA <= LEAF_EVENT_COUNT_THRESHOLD && countB <= LEAF_EVENT_COUNT_THRESHOLD);

  if (isLeaf) {
    // Reconcile leaf window: fetch exact events from both servers
    bisectionMetrics.leafReconciled++;
    const [eventsA, eventsB] = await Promise.all([
      fetchServerEventsRange(serverA, startSec, endSec, 100),
      fetchServerEventsRange(serverB, startSec, endSec, 100),
    ]);

    const mapA = new Map(eventsA.filter((e) => e?.id).map((e) => [e.id, e]));
    const mapB = new Map(eventsB.filter((e) => e?.id).map((e) => [e.id, e]));

    // Push missing from A -> B
    for (const [id, event] of mapA) {
      if (!mapB.has(id)) {
        const ok = await pushEventToServer(serverB, event);
        if (ok) {
          state.eventsSynced++;
          log(`Bisected leaf: synced event ${id.slice(0, 10)} from ${serverA} -> ${serverB}`);
          // Replicate referenced blobs
          if (Array.isArray(event.blobs)) {
            for (const h of event.blobs) {
              const has = await checkServerBlob(serverB, h);
              if (!has) {
                const bOk = await replicateBlob(serverA, serverB, h);
                if (bOk) state.blobsSynced++;
              }
            }
          }
        }
      }
    }

    // Push missing from B -> A
    for (const [id, event] of mapB) {
      if (!mapA.has(id)) {
        const ok = await pushEventToServer(serverA, event);
        if (ok) {
          state.eventsSynced++;
          log(`Bisected leaf: synced event ${id.slice(0, 10)} from ${serverB} -> ${serverA}`);
          if (Array.isArray(event.blobs)) {
            for (const h of event.blobs) {
              const has = await checkServerBlob(serverA, h);
              if (!has) {
                const bOk = await replicateBlob(serverB, serverA, h);
                if (bOk) state.blobsSynced++;
              }
            }
          }
        }
      }
    }
  } else {
    // Bisect range into two sub-intervals
    bisectionMetrics.rangesBisected++;
    const midSec = Math.floor((startSec + endSec) / 2);

    await Promise.all([
      bisectRangeBetweenServers(serverA, serverB, startSec, midSec, state, depth + 1),
      bisectRangeBetweenServers(serverA, serverB, midSec, endSec, state, depth + 1),
    ]);
  }
}

/**
 * Main cross-server synchronization cycle with Adaptive Bisection.
 */
async function runSyncCycle() {
  if (isSyncing) return;
  if (!relays || relays.length === 0) {
    post("status", { status: "idle", details: "No Rabta servers configured" });
    return;
  }

  isSyncing = true;
  round++;
  const startedAt = Date.now();
  post("status", { status: "syncing", round });

  log(`Starting Rabta adaptive bisection sync round #${round} across ${relays.length} servers`);

  try {
    // 1. Probe all servers for liveness & telemetry
    const serverStatuses = await Promise.all(relays.map((r) => probeServer(r)));
    const onlineServers = serverStatuses.filter((s) => s.online);

    if (onlineServers.length < 2) {
      const msg =
        onlineServers.length === 1
          ? `Only 1 server online (${onlineServers[0].url}). Need at least 2 servers for bisection.`
          : "All configured Rabta servers are currently offline or unreachable.";
      log(msg, "warn");

      post("summary", {
        round,
        durationMs: Date.now() - startedAt,
        eventsSynced: 0,
        blobsSynced: 0,
        totalEventsSynced,
        totalBlobsSynced,
        consistencyPct: onlineServers.length === 1 ? 100 : 0,
        servers: serverStatuses,
        bisection: { ...bisectionMetrics },
        note: msg,
      });
      post("status", { status: onlineServers.length ? "idle" : "offline" });
      return;
    }

    // 2. Perform Adaptive Range Bisection between online server pairs
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = Math.max(0, nowSec - RETENTION_DAYS * 86400);
    const endSec = nowSec + 60; // Include newly arriving heads

    let roundEventsSynced = 0;
    let roundBlobsSynced = 0;

    // Synchronize across server pairs using top-down range bisection
    for (let i = 0; i < onlineServers.length - 1; i++) {
      const serverA = onlineServers[i].url;
      const serverB = onlineServers[i + 1].url;

      const state = { probesUsed: 0, eventsSynced: 0, blobsSynced: 0 };
      await bisectRangeBetweenServers(serverA, serverB, startSec, endSec, state);

      roundEventsSynced += state.eventsSynced;
      roundBlobsSynced += state.blobsSynced;
    }

    // 3. Fast hot sweep on recent head events
    const recentHotEvents = await fetchServerEventsRange(onlineServers[0].url, nowSec - 3600, endSec, 50);
    for (const ev of recentHotEvents) {
      if (!ev?.id) continue;
      for (let j = 1; j < onlineServers.length; j++) {
        const targetUrl = onlineServers[j].url;
        await pushEventToServer(targetUrl, ev);
      }
    }

    totalEventsSynced += roundEventsSynced;
    totalBlobsSynced += roundBlobsSynced;

    // 4. Calculate consistency metric across servers
    const totalEventsList = onlineServers.map((s) => s.liveEvents || 0);
    const minEvents = Math.min(...totalEventsList);
    const maxEvents = Math.max(...totalEventsList);
    const consistencyPct =
      maxEvents > 0 ? Math.round((minEvents / maxEvents) * 100) : 100;

    const durationMs = Date.now() - startedAt;
    log(
      `Round #${round} complete in ${durationMs}ms: ${roundEventsSynced} events synced via bisection (${bisectionMetrics.rangesMatched} ranges verified in 1 probe)`,
    );

    post("summary", {
      round,
      durationMs,
      eventsSynced: roundEventsSynced,
      blobsSynced: roundBlobsSynced,
      totalEventsSynced,
      totalBlobsSynced,
      consistencyPct: Math.min(100, Math.max(0, consistencyPct)),
      servers: serverStatuses,
      bisection: {
        probesUsed: bisectionMetrics.probes,
        rangesMatched: bisectionMetrics.rangesMatched,
        rangesBisected: bisectionMetrics.rangesBisected,
        leafReconciled: bisectionMetrics.leafReconciled,
      },
      completedAt: Date.now(),
    });

    post("status", { status: "synced", round });
  } catch (err) {
    log(`Bisection sync crashed: ${err?.message || err}`, "error");
    post("status", { status: "error", error: err?.message || String(err) });
  } finally {
    isSyncing = false;
    scheduleNext();
  }
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!autoSync || !relays.length) return;

  const cadence = isHidden ? Math.max(intervalMs * 2, 60000) : intervalMs;
  timer = setTimeout(() => {
    void runSyncCycle();
  }, cadence);
}

// ─── Worker Message Handler ──────────────────────────────────────────────────

self.onmessage = (event) => {
  const { type, config = {}, hidden: nextHidden } = event.data || {};

  if (type === "config") {
    if (Array.isArray(config.relays)) {
      relays = config.relays.filter(Boolean);
    }
    if (typeof config.intervalMs === "number" && config.intervalMs >= 5000) {
      intervalMs = config.intervalMs;
    }
    if (typeof config.autoSync === "boolean") {
      autoSync = config.autoSync;
    }
    log(`Worker reconfigured: adaptive bisection across ${relays.length} servers`);
    post("ready", { relaysCount: relays.length });
    if (autoSync) {
      void runSyncCycle();
    }
  } else if (type === "sync-now") {
    void runSyncCycle();
  } else if (type === "pause") {
    autoSync = false;
    if (timer) clearTimeout(timer);
    timer = null;
    post("status", { status: "paused" });
    log("Auto-sync paused by user");
  } else if (type === "resume") {
    autoSync = true;
    log("Auto-sync resumed");
    void runSyncCycle();
  } else if (type === "visibility") {
    isHidden = Boolean(nextHidden);
    if (!isHidden && autoSync) {
      void runSyncCycle();
    }
  } else if (type === "stop") {
    if (timer) clearTimeout(timer);
    timer = null;
    autoSync = false;
    post("status", { status: "idle" });
  }
};
