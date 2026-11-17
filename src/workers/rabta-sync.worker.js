// Rabta Server Mesh Sync Worker
// Dedicated independent worker with Adaptive Range Bisection for
// server-to-server event diffing, storage limit verification, and
// binary blob cross-replication.

const RETENTION_DAYS = 30;
const LEAF_WINDOW_SPAN_SEC = 3600; // 1 hour leaf window
const LEAF_EVENT_COUNT_THRESHOLD = 40;
const MAX_BISECTION_DEPTH = 10;
const MAX_PROBES_PER_CYCLE = 64;
const STORAGE_LIMITS_TTL_MS = 60000;

let relays = [];
let intervalMs = 30000;
let autoSync = true;
let isHidden = false;
let isSyncing = false;
let timer = null;
let round = 0;
let totalEventsSynced = 0;
let totalBlobsSynced = 0;
let totalBlobsSkippedQuota = 0;

// Bisection & Quota metrics
let bisectionMetrics = {
  probes: 0,
  rangesMatched: 0,
  rangesBisected: 0,
  leafReconciled: 0,
  blobsSkippedQuota: 0,
};

// Target storage limits cache (URL -> { limits, fetchedAt })
const storageLimitsCache = new Map();

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
 * Enquire about a Rabta node's storage budget, limits, and writable capacity (GET /api/v1/node).
 */
async function enquireServerStorageLimits(url, timeoutMs = 6000) {
  const base = url.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/v1/node`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { ok: false, writable: false, reason: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const batteryMode = String(data?.peers?.battery?.mode || "").toLowerCase();
    const blobsEnabled = data?.blobs?.enabled !== false;
    const writable = batteryMode !== "read_only" && batteryMode !== "sync_disabled" && blobsEnabled;

    const budgetBytes = Math.max(
      0,
      Number(data?.storage?.budget_bytes ?? data?.storage?.configured_bytes ?? Infinity),
    );
    const usedBytes = Math.max(0, Number(data?.storage?.used_bytes ?? 0));
    const freeBytes = Math.max(0, Number(data?.storage?.free_bytes ?? Infinity));
    const remainingBudget = Number.isFinite(budgetBytes)
      ? Math.max(0, budgetBytes - usedBytes)
      : Infinity;
    const remainingBytes = Math.min(remainingBudget, freeBytes);

    const maxSingleBytes = Math.max(
      0,
      Number(data?.upload?.max_single_bytes ?? data?.blobs?.max_single_bytes ?? Infinity),
    );

    return {
      ok: true,
      writable,
      budgetBytes,
      usedBytes,
      remainingBytes,
      maxSingleBytes,
      nodeId: data?.node_id || null,
      raw: data,
    };
  } catch (err) {
    return { ok: false, writable: false, reason: err?.message || "Storage enquiry failed" };
  }
}

/**
 * Cached getter for a server's storage limits.
 */
async function getServerStorageLimits(url, forceRefresh = false) {
  const now = Date.now();
  const cached = storageLimitsCache.get(url);
  if (!forceRefresh && cached && now - cached.fetchedAt < STORAGE_LIMITS_TTL_MS) {
    return cached.limits;
  }
  const limits = await enquireServerStorageLimits(url);
  storageLimitsCache.set(url, { limits, fetchedAt: now });
  return limits;
}

/**
 * Verify whether a target Rabta relay can accept a blob of given size before trying.
 */
function canServerAcceptBlob(targetUrl, blobSizeBytes, limits) {
  if (!limits || !limits.ok) {
    return { canAccept: true, limits };
  }

  if (!limits.writable) {
    return {
      canAccept: false,
      reason: "Relay is in read-only mode or blobs are disabled",
      limits,
    };
  }

  if (Number.isFinite(limits.remainingBytes) && limits.remainingBytes <= 0) {
    return {
      canAccept: false,
      reason: "Relay storage budget is completely exhausted (0 bytes remaining)",
      limits,
    };
  }

  if (Number.isFinite(blobSizeBytes) && blobSizeBytes > 0) {
    if (Number.isFinite(limits.maxSingleBytes) && blobSizeBytes > limits.maxSingleBytes) {
      return {
        canAccept: false,
        reason: `Blob (${blobSizeBytes} B) exceeds relay single blob limit (${limits.maxSingleBytes} B)`,
        limits,
      };
    }

    if (Number.isFinite(limits.remainingBytes) && blobSizeBytes > limits.remainingBytes) {
      return {
        canAccept: false,
        reason: `Blob (${blobSizeBytes} B) exceeds remaining storage budget (${limits.remainingBytes} B remaining)`,
        limits,
      };
    }
  }

  return { canAccept: true, limits };
}

/**
 * Check health, storage limits & telemetry of a single Rabta node.
 */
async function probeServer(url, timeoutMs = 5000) {
  const base = url.replace(/\/+$/, "");
  const startedAt = Date.now();
  try {
    const [healthRes, storageLimits] = await Promise.all([
      fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(timeoutMs) }).catch(() => null),
      getServerStorageLimits(url, true),
    ]);

    const latency = Date.now() - startedAt;
    const isOnline = Boolean(healthRes?.ok || storageLimits?.ok);
    if (!isOnline) {
      return {
        url,
        online: false,
        latency,
        nodeId: null,
        liveEvents: 0,
        liveBlobs: 0,
        storage: null,
        error: healthRes ? `HTTP ${healthRes.status}` : "Unreachable",
      };
    }

    const data = healthRes?.ok ? await healthRes.json().catch(() => ({})) : {};
    return {
      url,
      online: true,
      latency,
      nodeId: data.node_id || storageLimits?.nodeId || null,
      liveEvents: Number(data.live_events ?? data.events?.live ?? 0),
      liveBlobs: Number(data.live_blobs ?? data.blobs?.live ?? 0),
      storage: storageLimits?.ok
        ? {
            writable: storageLimits.writable,
            budgetBytes: storageLimits.budgetBytes,
            usedBytes: storageLimits.usedBytes,
            remainingBytes: storageLimits.remainingBytes,
            maxSingleBytes: storageLimits.maxSingleBytes,
          }
        : null,
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
      storage: null,
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
async function fetchServerEventsRange(
  url,
  since = null,
  until = null,
  limit = 50,
  timeoutMs = 6000,
) {
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
 * Check if a server has a blob by hash and retrieve its size via HEAD request.
 */
async function queryServerBlobHead(url, hash, timeoutMs = 4000) {
  const base = url.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/v1/blobs/${hash}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 200) {
      const lenStr = res.headers.get("content-length");
      const sizeBytes = lenStr ? parseInt(lenStr, 10) : 0;
      return { exists: true, sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0 };
    }
    return { exists: false, sizeBytes: 0, status: res.status };
  } catch {
    return { exists: false, sizeBytes: 0, error: true };
  }
}

/**
 * Replicate a blob from source to target server safely:
 * Enquires target storage limits and verifies quota before downloading or uploading.
 */
async function replicateBlobSafely(sourceUrl, targetUrl, hash, state) {
  try {
    // 1. Check if target already has the blob
    const targetHead = await queryServerBlobHead(targetUrl, hash);
    if (targetHead.exists) {
      return false; // Already present on target
    }

    // 2. Check source HEAD for existence and byte size
    const sourceHead = await queryServerBlobHead(sourceUrl, hash);
    if (!sourceHead.exists) {
      log(`Source ${sourceUrl} does not have blob ${hash.slice(0, 10)}`, "warn");
      return false;
    }
    const blobSize = sourceHead.sizeBytes;

    // 3. Enquire target relay storage limits before trying
    const limits = await getServerStorageLimits(targetUrl);
    const check = canServerAcceptBlob(targetUrl, blobSize, limits);

    if (!check.canAccept) {
      log(
        `[Storage Quota] Skipping blob ${hash.slice(0, 10)} (${blobSize} B) -> ${targetUrl}: ${check.reason}`,
        "warn",
      );
      state.blobsSkippedQuota = (state.blobsSkippedQuota || 0) + 1;
      bisectionMetrics.blobsSkippedQuota = (bisectionMetrics.blobsSkippedQuota || 0) + 1;
      return false;
    }

    // 4. Quota satisfied, download from source and upload to target
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

    if (putRes.ok) {
      state.blobsSynced = (state.blobsSynced || 0) + 1;
      // Deduct from remaining bytes in cache for subsequent blobs this cycle
      if (Number.isFinite(limits.remainingBytes) && blobSize > 0) {
        limits.remainingBytes = Math.max(0, limits.remainingBytes - blobSize);
      }
      log(`Replicated blob ${hash.slice(0, 10)} (${blobSize} B) from ${sourceUrl} -> ${targetUrl}`);
      return true;
    } else {
      log(
        `Failed uploading blob ${hash.slice(0, 10)} to ${targetUrl}: HTTP ${putRes.status}`,
        "warn",
      );
      return false;
    }
  } catch (err) {
    log(`Blob sync error for ${hash.slice(0, 10)}: ${err?.message || err}`, "warn");
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
  state = { probesUsed: 0, eventsSynced: 0, blobsSynced: 0, blobsSkippedQuota: 0 },
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
          // Safely replicate referenced blobs after verifying storage quota
          if (Array.isArray(event.blobs)) {
            for (const h of event.blobs) {
              await replicateBlobSafely(serverA, serverB, h, state);
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
              await replicateBlobSafely(serverB, serverA, h, state);
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
 * Main cross-server synchronization cycle with Adaptive Bisection and Quota-Safe Blobs.
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
    // 1. Probe all servers for liveness, storage limits & telemetry
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
        blobsSkippedQuota: 0,
        totalEventsSynced,
        totalBlobsSynced,
        totalBlobsSkippedQuota,
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
    let roundBlobsSkippedQuota = 0;

    // Synchronize across server pairs using top-down range bisection
    for (let i = 0; i < onlineServers.length - 1; i++) {
      const serverA = onlineServers[i].url;
      const serverB = onlineServers[i + 1].url;

      const state = { probesUsed: 0, eventsSynced: 0, blobsSynced: 0, blobsSkippedQuota: 0 };
      await bisectRangeBetweenServers(serverA, serverB, startSec, endSec, state);

      roundEventsSynced += state.eventsSynced;
      roundBlobsSynced += state.blobsSynced;
      roundBlobsSkippedQuota += state.blobsSkippedQuota;
    }

    // 3. Fast hot sweep on recent head events
    const recentHotEvents = await fetchServerEventsRange(
      onlineServers[0].url,
      nowSec - 3600,
      endSec,
      50,
    );
    for (const ev of recentHotEvents) {
      if (!ev?.id) continue;
      for (let j = 1; j < onlineServers.length; j++) {
        const targetUrl = onlineServers[j].url;
        const pushed = await pushEventToServer(targetUrl, ev);
        if (pushed && Array.isArray(ev.blobs)) {
          for (const h of ev.blobs) {
            const hotState = { blobsSynced: 0, blobsSkippedQuota: 0 };
            await replicateBlobSafely(onlineServers[0].url, targetUrl, h, hotState);
            roundBlobsSynced += hotState.blobsSynced;
            roundBlobsSkippedQuota += hotState.blobsSkippedQuota;
          }
        }
      }
    }

    totalEventsSynced += roundEventsSynced;
    totalBlobsSynced += roundBlobsSynced;
    totalBlobsSkippedQuota += roundBlobsSkippedQuota;

    // 4. Calculate consistency metric across servers
    const totalEventsList = onlineServers.map((s) => s.liveEvents || 0);
    const minEvents = Math.min(...totalEventsList);
    const maxEvents = Math.max(...totalEventsList);
    const consistencyPct = maxEvents > 0 ? Math.round((minEvents / maxEvents) * 100) : 100;

    const durationMs = Date.now() - startedAt;
    log(
      `Round #${round} complete in ${durationMs}ms: ${roundEventsSynced} events synced (${bisectionMetrics.rangesMatched} ranges verified in 1 probe, ${roundBlobsSkippedQuota} blobs quota-protected)`,
    );

    post("summary", {
      round,
      durationMs,
      eventsSynced: roundEventsSynced,
      blobsSynced: roundBlobsSynced,
      blobsSkippedQuota: roundBlobsSkippedQuota,
      totalEventsSynced,
      totalBlobsSynced,
      totalBlobsSkippedQuota,
      consistencyPct: Math.min(100, Math.max(0, consistencyPct)),
      servers: serverStatuses,
      bisection: {
        probesUsed: bisectionMetrics.probes,
        rangesMatched: bisectionMetrics.rangesMatched,
        rangesBisected: bisectionMetrics.rangesBisected,
        leafReconciled: bisectionMetrics.leafReconciled,
        blobsSkippedQuota: bisectionMetrics.blobsSkippedQuota,
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
