// Rabta Server Mesh Sync Worker
// Dedicated independent worker whose sole responsibility is cross-server
// synchronization between all configured Rabta nodes.

let relays = [];
let intervalMs = 30000;
let autoSync = true;
let isHidden = false;
let isSyncing = false;
let timer = null;
let round = 0;
let totalEventsSynced = 0;
let totalBlobsSynced = 0;

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
 * Fetch events list from a node.
 */
async function fetchServerEvents(url, limit = 100, timeoutMs = 6000) {
  const base = url.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/v1/events?limit=${limit}`, {
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
    return res.ok || res.status === 409; // 409/duplicate is success
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
 * Main cross-server synchronization cycle.
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

  log(`Starting Rabta server sync round #${round} across ${relays.length} servers`);

  try {
    // 1. Probe all servers
    const serverStatuses = await Promise.all(relays.map((r) => probeServer(r)));
    const onlineServers = serverStatuses.filter((s) => s.online);

    if (onlineServers.length < 2) {
      const msg =
        onlineServers.length === 1
          ? `Only 1 server online (${onlineServers[0].url}). Need at least 2 servers for cross-sync.`
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
        note: msg,
      });
      post("status", { status: onlineServers.length ? "idle" : "offline" });
      return;
    }

    // 2. Fetch events from each online server
    const eventsByServer = new Map();
    const allEventsMap = new Map();

    await Promise.all(
      onlineServers.map(async (srv) => {
        const events = await fetchServerEvents(srv.url, 100);
        const map = new Map();
        for (const ev of events) {
          if (ev?.id) {
            map.set(ev.id, ev);
            if (!allEventsMap.has(ev.id)) {
              allEventsMap.set(ev.id, ev);
            }
          }
        }
        eventsByServer.set(srv.url, map);
      }),
    );

    // 3. Reconcile missing events between servers
    let roundEventsSynced = 0;
    let roundBlobsSynced = 0;
    const allEventIds = Array.from(allEventsMap.keys());
    let consistentEventCount = 0;

    for (const id of allEventIds) {
      const event = allEventsMap.get(id);
      const holders = [];
      const missing = [];

      for (const srv of onlineServers) {
        const srvEvents = eventsByServer.get(srv.url);
        if (srvEvents && srvEvents.has(id)) {
          holders.push(srv.url);
        } else {
          missing.push(srv.url);
        }
      }

      if (missing.length === 0) {
        consistentEventCount++;
      } else if (holders.length > 0) {
        const sourceUrl = holders[0];
        // Replicate event to missing servers
        for (const targetUrl of missing) {
          const ok = await pushEventToServer(targetUrl, event);
          if (ok) {
            roundEventsSynced++;
            log(
              `Replicated event ${id.slice(0, 10)} from ${sourceUrl} to ${targetUrl}`,
            );

            // Replicate referenced blobs if any
            if (Array.isArray(event.blobs) && event.blobs.length) {
              for (const blobHash of event.blobs) {
                const hasBlob = await checkServerBlob(targetUrl, blobHash);
                if (!hasBlob) {
                  const blobOk = await replicateBlob(sourceUrl, targetUrl, blobHash);
                  if (blobOk) {
                    roundBlobsSynced++;
                    log(
                      `Replicated blob ${blobHash.slice(0, 10)} to ${targetUrl}`,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }

    totalEventsSynced += roundEventsSynced;
    totalBlobsSynced += roundBlobsSynced;

    const totalDistinct = allEventIds.length;
    const consistencyPct =
      totalDistinct > 0
        ? Math.round(
            ((consistentEventCount + roundEventsSynced) /
              (totalDistinct * (onlineServers.length - 1 || 1))) *
              100,
          )
        : 100;

    const durationMs = Date.now() - startedAt;
    log(
      `Round #${round} complete in ${durationMs}ms: ${roundEventsSynced} events synced, ${roundBlobsSynced} blobs synced (Consistency: ${Math.min(100, consistencyPct)}%)`,
    );

    post("summary", {
      round,
      durationMs,
      eventsSynced: roundEventsSynced,
      blobsSynced: roundBlobsSynced,
      totalEventsSynced,
      totalBlobsSynced,
      totalDistinctEvents: totalDistinct,
      consistencyPct: Math.min(100, Math.max(0, consistencyPct)),
      servers: serverStatuses,
      completedAt: Date.now(),
    });

    post("status", { status: "synced", round });
  } catch (err) {
    log(`Sync round crashed: ${err?.message || err}`, "error");
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
    log(`Worker reconfigured with ${relays.length} servers (cadence: ${intervalMs / 1000}s)`);
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
