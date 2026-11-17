import { readConfiguredRelays, DEFAULT_RELAYS } from "../../config/servers.js";
import { buildEventListParams, checkRelayHealth, publishEventToRelay } from "./index.js";
import { fetchBlobBytes } from "../blobFetch.js";

export const RABTA_SYNC_MAX_BUDGET_PER_RUN = 50;
export const RABTA_SYNC_EVENT_BASE_WEIGHT = 1;
export const RABTA_SYNC_EVENT_BLOB_WEIGHT = 10;
export const RABTA_SYNC_MIN_WAIT_SEC = 10;
export const RABTA_SYNC_MAX_WAIT_SEC = 100;
export const BASE_WORKER_RESTART_DELAY_MS = 2000;
export const MAX_WORKER_RESTART_DELAY_MS = 60000;

export function calculateWorkerBackoffDelay(failures) {
  const f = Math.max(1, Number(failures) || 1);
  const exponent = Math.max(0, f - 1);
  return Math.min(
    MAX_WORKER_RESTART_DELAY_MS,
    BASE_WORKER_RESTART_DELAY_MS * Math.pow(2, exponent),
  );
}

/**
 * Determine the weight cost of an event during a sync cycle.
 * Events with binary blobs cost 10 budget units; lightweight text/metadata events cost 1.
 */
export function getEventSyncWeight(event) {
  if (!event || typeof event !== "object") return RABTA_SYNC_EVENT_BASE_WEIGHT;
  const hasBlobs =
    (Array.isArray(event.blobs) && event.blobs.length > 0) ||
    Boolean(event.data?.blobs?.length) ||
    Boolean(event.data?.media) ||
    Boolean(event.data?.files?.length) ||
    (Array.isArray(event.tags) && event.tags.some((t) => t[0] === "blob" || t[0] === "part"));
  return hasBlobs ? RABTA_SYNC_EVENT_BLOB_WEIGHT : RABTA_SYNC_EVENT_BASE_WEIGHT;
}

/**
 * Generate a random wait duration in milliseconds between minSec and maxSec (default 10s to 100s).
 */
export function getRandomRabtaSyncWaitMs(
  minSec = RABTA_SYNC_MIN_WAIT_SEC,
  maxSec = RABTA_SYNC_MAX_WAIT_SEC,
) {
  const waitSec = minSec + Math.random() * (maxSec - minSec);
  return Math.round(waitSec * 1000);
}

/**
 * Returns clean list of relay URLs.
 */
export function getPoolRelays(relays) {
  const list = Array.isArray(relays) && relays.length ? relays : readConfiguredRelays();
  const effective = list.length ? list : [...DEFAULT_RELAYS];
  return effective.map((r) => r.replace(/\/+$/, ""));
}

/**
 * Query all configured Rabta servers as a unified pool in parallel.
 * Merges events, deduplicates by event ID, and sorts descending by created_at.
 * Allows the entire application to query the Rabta mesh directly without local Dexie cache.
 */
export async function queryRabtaPool(
  {
    collection,
    collectionGlob,
    labels,
    owner,
    limit = 50,
    cursor = null,
    since = null,
    until = null,
  } = {},
  relays,
  { timeoutMs = 6000 } = {},
) {
  const targets = getPoolRelays(relays);
  const params = buildEventListParams({
    collection,
    collectionGlob,
    labels,
    owner,
    limit,
    cursor,
    since,
    until,
  });

  const eventMap = new Map();
  const relayOutcomes = [];

  await Promise.allSettled(
    targets.map(async (relay) => {
      const startedAt = Date.now();
      try {
        const res = await fetch(`${relay}/api/v1/events?${params}`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          relayOutcomes.push({
            relay,
            ok: false,
            latencyMs: Date.now() - startedAt,
            error: `HTTP ${res.status}`,
          });
          return;
        }
        const data = await res.json();
        const serverEvents = Array.isArray(data.events) ? data.events : [];
        for (const ev of serverEvents) {
          if (ev?.id && !eventMap.has(ev.id)) {
            eventMap.set(ev.id, ev);
          }
        }
        relayOutcomes.push({
          relay,
          ok: true,
          count: serverEvents.length,
          latencyMs: Date.now() - startedAt,
        });
      } catch (err) {
        relayOutcomes.push({
          relay,
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: err?.message || "Network error",
        });
      }
    }),
  );

  const events = Array.from(eventMap.values()).sort((a, b) => {
    if (b.created_at !== a.created_at) return b.created_at - a.created_at;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });

  return {
    events,
    count: events.length,
    relayOutcomes,
    totalServers: targets.length,
    onlineServers: relayOutcomes.filter((r) => r.ok).length,
    fromPool: true,
  };
}

/**
 * Fetch a single event envelope from the server pool, trying relays concurrently.
 */
export async function fetchEventFromPool(id, relays, { timeoutMs = 5000 } = {}) {
  const targets = getPoolRelays(relays);
  if (!id) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const promises = targets.map(async (relay) => {
      const res = await fetch(`${relay}/api/v1/events/${id}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const ev = await res.json();
        return ev;
      }
      throw new Error(`HTTP ${res.status}`);
    });

    const firstSuccess = await Promise.any(promises);
    return firstSuccess;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Broadcast an event to all servers in the pool in parallel.
 */
export async function publishToRabtaPool(event, relays, { timeoutMs = 6000 } = {}) {
  const targets = getPoolRelays(relays);
  const results = {};

  await Promise.allSettled(
    targets.map(async (relay) => {
      try {
        const outcome = await publishEventToRelay(relay, event, { timeoutMs });
        results[relay] = outcome;
      } catch (err) {
        results[relay] = { ok: false, error: err?.message || "Publish failed" };
      }
    }),
  );

  return results;
}

/**
 * Fetch blob bytes from the server pool with automatic HTTP Range resuming and failover.
 */
export async function fetchBlobFromPool(hash, relays, { timeoutMs = 10000, retries = 3 } = {}) {
  const targets = getPoolRelays(relays);
  if (!hash) throw new Error("No blob hash provided");

  let lastError = null;
  for (const relay of targets) {
    try {
      const url = `${relay}/api/v1/blobs/${encodeURIComponent(hash)}`;
      const bytes = await fetchBlobBytes(url, { timeoutMs, retries });
      if (bytes && bytes.byteLength > 0) {
        return bytes;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Blob ${hash} not found on any Rabta server.`);
}

/**
 * Upload blob bytes to all servers in the pool.
 * Enquires target relay storage limits before uploading to avoid quota exhaustion.
 */
export async function uploadBlobToPool(bytes, relays, { timeoutMs = 15000 } = {}) {
  const targets = getPoolRelays(relays);
  const blobSize = bytes?.byteLength ?? bytes?.length ?? 0;
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const results = [];

  await Promise.allSettled(
    targets.map(async (relay) => {
      const check = await canServerAcceptBlob(relay, blobSize);
      if (!check.canAccept) {
        results.push({ relay, ok: false, reason: check.reason, skippedQuota: true });
        return;
      }

      const res = await fetch(`${relay}/api/v1/blobs`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        results.push({ relay, ok: true, hash: data.hash, size: data.size || blobSize });
      } else {
        results.push({ relay, ok: false, status: res.status });
      }
    }),
  );

  return results;
}

/**
 * Compare servers in pool and compute synchronization consistency score.
 */
export async function getPoolSummary(relays, { timeoutMs = 5000 } = {}) {
  const targets = getPoolRelays(relays);
  const healthResults = await Promise.allSettled(
    targets.map((relay) => checkRelayHealth(relay, { timeoutMs, detailed: true })),
  );

  const servers = targets.map((relay, idx) => {
    const outcome = healthResults[idx];
    if (outcome.status === "fulfilled" && outcome.value.ok) {
      const info = outcome.value;
      return {
        url: relay,
        online: true,
        latencyMs: info.latency,
        nodeId: info.nodeId,
        liveEvents: info.liveEvents ?? 0,
        liveBlobs: info.liveBlobs ?? 0,
        storageUsedBytes: info.storageUsedBytes ?? 0,
        limits: info.limits,
        error: null,
      };
    }
    return {
      url: relay,
      online: false,
      latencyMs: 0,
      nodeId: null,
      liveEvents: 0,
      liveBlobs: 0,
      storageUsedBytes: 0,
      limits: null,
      error:
        outcome.status === "fulfilled"
          ? outcome.value.error || "Unreachable"
          : outcome.reason?.message || "Failed",
    };
  });

  const onlineServers = servers.filter((s) => s.online);
  let consistencyPct = 100;
  if (onlineServers.length >= 2) {
    const counts = onlineServers.map((s) => s.liveEvents);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    if (maxCount > 0) {
      consistencyPct = Math.round((minCount / maxCount) * 100);
    }
  }

  return {
    servers,
    totalServers: servers.length,
    onlineCount: onlineServers.length,
    consistencyPct,
    checkedAt: Date.now(),
  };
}

/**
 * Load chat messages directly from the Rabta server pool based on user scroll and timestamps.
 * Enables simple, zero-cache chat loading: fetches from the server pool, deduplicating by event ID,
 * and paginating monotonically backwards or forwards using timestamps.
 */
export async function queryChatFromPool(
  { roomId, peerPubkey, since, until, limit = 50 } = {},
  relays,
) {
  const labels = [];
  if (roomId) labels.push(`room:${roomId}`);
  if (peerPubkey) labels.push(`peer:${peerPubkey}`);

  return queryRabtaPool(
    {
      collection: "gupt/dm",
      labels: labels.length ? labels : undefined,
      since,
      until,
      limit,
    },
    relays,
  );
}

/**
 * Enquire about a Rabta node's storage budget, limits, and writable capacity (GET /api/v1/node).
 */
export async function enquireServerStorageLimits(url, { timeoutMs = 6000 } = {}) {
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

    const rawBattery = data?.peers?.battery || {};
    const rawLevel = rawBattery.level ?? rawBattery.percentage ?? rawBattery.pct;
    const batteryLevel = Number.isFinite(Number(rawLevel))
      ? Number(rawLevel) <= 1
        ? Math.round(Number(rawLevel) * 100)
        : Number(rawLevel)
      : 100;

    let batteryCadenceMultiplier = 1;
    let batteryLabel = "Normal";
    let batteryBackedOff = false;

    if (batteryMode === "sync_disabled" || batteryMode === "read_only" || batteryLevel <= 5) {
      batteryCadenceMultiplier = 4;
      batteryBackedOff = true;
      batteryLabel =
        batteryMode === "sync_disabled"
          ? "Sync Disabled"
          : batteryMode === "read_only"
            ? "Read-Only (Empty)"
            : "Critical Battery";
    } else if (
      batteryMode === "eco" ||
      batteryMode === "constrained" ||
      batteryMode === "battery_low" ||
      batteryLevel <= 25
    ) {
      batteryCadenceMultiplier = 2;
      batteryBackedOff = true;
      batteryLabel =
        batteryMode === "eco"
          ? "Eco Mode"
          : batteryMode === "constrained"
            ? "Constrained"
            : "Low Battery";
    }

    return {
      ok: true,
      writable,
      budgetBytes,
      usedBytes,
      remainingBytes,
      maxSingleBytes,
      nodeId: data?.node_id || null,
      battery: {
        mode: batteryMode || "readwrite",
        level: batteryLevel,
        label: batteryLabel,
        multiplier: batteryCadenceMultiplier,
        backedOff: batteryBackedOff,
      },
      raw: data,
    };
  } catch (err) {
    return { ok: false, writable: false, reason: err?.message || "Storage enquiry failed" };
  }
}

/**
 * Determine dynamic sync cadence multiplier for a relay based on its battery telemetry.
 */
export function getRelayCadenceMultiplier(storageLimits) {
  if (!storageLimits?.battery) return 1;
  return storageLimits.battery.multiplier || 1;
}

/**
 * Verify whether a target Rabta relay can accept a blob of given size before trying.
 */
export async function canServerAcceptBlob(targetUrl, blobSizeBytes, cachedLimits = null) {
  const limits = cachedLimits || (await enquireServerStorageLimits(targetUrl));
  if (!limits.ok) {
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

const HEX64_RE = /^[0-9a-f]{64}$/i;

function normalizeKey(k) {
  if (!k || typeof k !== "string") return "";
  return k.trim().toLowerCase().replace(/^ed25519:/, "");
}

/**
 * Determine whether an event is ours (authored by the user) or addressed to us.
 * Prevents mesh sync workers from replicating strangers' data across Rabta relays.
 */
export function isEventOursOrAddressedToUs(event, selfPubkey) {
  if (!event || typeof event !== "object") return false;
  const self = normalizeKey(selfPubkey);
  if (!self) return false;

  // 1. Authored by us ("ours")
  if (normalizeKey(event.owner) === self) return true;
  if (normalizeKey(event.pubkey) === self) return true;
  if (normalizeKey(event.author) === self) return true;
  if (normalizeKey(event.sender) === self) return true;

  // 2. Addressed to us in labels (DMs, Group chats where members are labeled, Notes, Passwords, Bookmarks, Signaling)
  if (Array.isArray(event.labels)) {
    for (const label of event.labels) {
      if (normalizeKey(label) === self) return true;
    }
  }

  // 3. Addressed to us in tags (e.g. Nostr/Rabta ["p", pubkey] tags)
  if (Array.isArray(event.tags)) {
    for (const tag of event.tags) {
      if (
        Array.isArray(tag) &&
        (tag[0] === "p" || tag[0] === "recipient" || tag[0] === "to") &&
        normalizeKey(tag[1]) === self
      ) {
        return true;
      }
    }
  }

  // 4. Addressed to us in direct envelope recipient fields
  if (normalizeKey(event.recipient) === self) return true;
  if (normalizeKey(event.to) === self) return true;

  return false;
}

/**
 * Extract all binary blob hashes referenced by an event across all message formats:
 * - Direct event.blobs array (chat DMs, groups, feed posts)
 * - event.data.blobs
 * - event.data.media (single media object or array with parts, hash, sha256, cid)
 * - event.data.files
 * - event.tags (blob, part, x)
 */
export function extractEventBlobs(event) {
  if (!event || typeof event !== "object") return [];
  const hashes = new Set();

  // 1. Direct event.blobs
  if (Array.isArray(event.blobs)) {
    for (const h of event.blobs) {
      const clean = String(h || "")
        .trim()
        .toLowerCase();
      if (HEX64_RE.test(clean)) hashes.add(clean);
    }
  }

  // 2. event.data.blobs
  if (Array.isArray(event.data?.blobs)) {
    for (const h of event.data.blobs) {
      const clean = String(h || "")
        .trim()
        .toLowerCase();
      if (HEX64_RE.test(clean)) hashes.add(clean);
    }
  }

  // 3. event.data.media (e.g. chat attachments, feed media)
  const media = event.data?.media;
  const mediaItems = Array.isArray(media) ? media : media ? [media] : [];
  for (const m of mediaItems) {
    if (Array.isArray(m?.parts)) {
      for (const p of m.parts) {
        const clean = String(p || "")
          .trim()
          .toLowerCase();
        if (HEX64_RE.test(clean)) hashes.add(clean);
      }
    }
    const single = m?.hash || m?.sha256 || m?.cid;
    if (typeof single === "string") {
      const clean = single.trim().toLowerCase();
      if (HEX64_RE.test(clean)) hashes.add(clean);
    }
  }

  // 4. event.data.files
  if (Array.isArray(event.data?.files)) {
    for (const f of event.data.files) {
      const clean = String(f?.hash || f?.sha256 || f || "")
        .trim()
        .toLowerCase();
      if (HEX64_RE.test(clean)) hashes.add(clean);
    }
  }

  // 5. event.tags
  if (Array.isArray(event.tags)) {
    for (const t of event.tags) {
      if (Array.isArray(t) && (t[0] === "blob" || t[0] === "part" || t[0] === "x")) {
        const clean = String(t[1] || "")
          .trim()
          .toLowerCase();
        if (HEX64_RE.test(clean)) hashes.add(clean);
      }
    }
  }

  return [...hashes];
}

/**
 * Determine whether an event should be cross-replicated between Rabta servers:
 * - If selfPubkey is provided, ensures event is ours or addressed to us
 * - Skips already-expired events
 * - Skips stale ephemeral WebRTC call signaling older than 5 minutes
 */
export function shouldReplicateEvent(event, options = {}) {
  if (!event || !event.id) return false;

  const nowSec =
    typeof options === "number"
      ? options
      : Number(options?.nowSec) || Math.floor(Date.now() / 1000);
  const selfPubkey = typeof options === "object" ? options?.selfPubkey : null;

  // If selfPubkey is supplied, enforce that the event is ours or addressed to us
  if (selfPubkey && !isEventOursOrAddressedToUs(event, selfPubkey)) {
    return false;
  }

  // Skip already-expired events
  if (event.expires_at != null && Number(event.expires_at) <= nowSec) {
    return false;
  }

  // Skip ephemeral WebRTC call signals older than 5 minutes (stale calls)
  if (event.collection === "gupt/calls/signal") {
    const createdAt = Number(event.created_at || 0);
    if (createdAt && nowSec - createdAt > 300) {
      return false;
    }
  }

  return true;
}
