// Rabta Server Mesh Sync Worker
// Dedicated independent worker with Adaptive Range Bisection for
// server-to-server event diffing, storage limit verification,
// dynamic battery cadence backoff, and resumable HTTP Range blob cross-replication.

import { RETENTION_DAYS } from "../config/retention.js";

const LEAF_WINDOW_SPAN_SEC = 3600; // 1 hour leaf window
const LEAF_EVENT_COUNT_THRESHOLD = 40;
const MAX_BISECTION_DEPTH = 10;
const MAX_PROBES_PER_CYCLE = 64;
const STORAGE_LIMITS_TTL_MS = 60000;
const MAX_SYNC_BUDGET_PER_RUN = 50;
const EVENT_BASE_WEIGHT = 1;
const EVENT_BLOB_WEIGHT = 10;
const MAX_EVENTS_PER_RUN = MAX_SYNC_BUDGET_PER_RUN;
const MIN_WAIT_SEC = 10;
const MAX_WAIT_SEC = 30;

let relays = [];
let autoSync = true;
let isHidden = false;
let isSyncing = false;
let timer = null;
let round = 0;
let selfPubkey = null;
let totalEventsSynced = 0;
let totalBlobsSynced = 0;
let totalBlobsSkippedQuota = 0;
let totalBlobsResumed = 0;

function getRandomWaitMs(minSec = MIN_WAIT_SEC, maxSec = MAX_WAIT_SEC) {
  const waitSec = minSec + Math.random() * (maxSec - minSec);
  return Math.round(waitSec * 1000);
}

// Bisection, Quota & Battery metrics
let bisectionMetrics = {
  probes: 0,
  rangesMatched: 0,
  rangesBisected: 0,
  leafReconciled: 0,
  blobsSkippedQuota: 0,
  blobsResumed: 0,
  batteryBackoffs: 0,
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

function concatChunks(chunks, totalLength) {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Download blob bytes with automatic resume using HTTP Range requests.
 * If connection drops mid-stream, subsequent attempts send `Range: bytes=<receivedBytes>-`.
 */
async function fetchBlobResumable(url, { maxRetries = 3, timeoutMs = 12000 } = {}) {
  let receivedChunks = [];
  let receivedBytes = 0;
  let wasResumed = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers = {};
      if (receivedBytes > 0) {
        headers["Range"] = `bytes=${receivedBytes}-`;
      }

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 404) {
        return { ok: false, error: "HTTP 404", resumed: false };
      }

      if (res.status === 416) {
        // Range not satisfiable: reset accumulator
        receivedChunks = [];
        receivedBytes = 0;
        continue;
      }

      if (res.status === 200 && receivedBytes > 0) {
        // Server ignored Range, reset accumulator
        receivedChunks = [];
        receivedBytes = 0;
      }

      if (!res.ok && res.status !== 206) {
        throw new Error(`HTTP ${res.status}`);
      }

      if (res.status === 206 && receivedBytes > 0) {
        wasResumed = true;
      }

      if (res.body && typeof res.body.getReader === "function") {
        const reader = res.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              receivedChunks.push(value);
              receivedBytes += value.byteLength;
            }
          }
        } finally {
          reader.releaseLock?.();
        }
      } else {
        const buf = await res.arrayBuffer();
        const arr = new Uint8Array(buf);
        if (res.status === 206) {
          receivedChunks.push(arr);
          receivedBytes += arr.byteLength;
        } else {
          receivedChunks = [arr];
          receivedBytes = arr.byteLength;
        }
      }

      const finalBytes = concatChunks(receivedChunks, receivedBytes);
      return { ok: true, bytes: finalBytes, resumed: wasResumed, sizeBytes: receivedBytes };
    } catch (err) {
      if (attempt === maxRetries) {
        return { ok: false, error: err?.message || String(err), resumed: wasResumed };
      }
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
  }

  return { ok: false, error: "Retries exhausted", resumed: wasResumed };
}

/**
 * Enquire about a Rabta node's storage budget, limits, writable capacity,
 * and battery tier (GET /api/v1/node).
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
 * Check health, storage limits, battery tier & telemetry of a single Rabta node.
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
        userEvents: 0,
        userOurs: 0,
        userInbound: 0,
        storage: null,
        battery: {
          mode: "offline",
          level: 0,
          label: "Offline",
          multiplier: 1,
          backedOff: false,
        },
        error: healthRes ? `HTTP ${healthRes.status}` : "Unreachable",
      };
    }

    const data = healthRes?.ok ? await healthRes.json().catch(() => ({})) : {};

    let userOurs = 0;
    let userInbound = 0;
    let userEvents = 0;
    if (selfPubkey) {
      const nowSec = Math.floor(Date.now() / 1000);
      const startSec = Math.max(0, nowSec - RETENTION_DAYS * 86400);
      const endSec = nowSec + 60;
      const [cOurs, cInbound] = await Promise.all([
        queryServerCount(url, startSec, endSec, { owner: `ed25519:${selfPubkey}` }, timeoutMs),
        queryServerCount(url, startSec, endSec, { labels: [selfPubkey] }, timeoutMs),
      ]);
      userOurs = typeof cOurs === "number" ? cOurs : 0;
      userInbound = typeof cInbound === "number" ? cInbound : 0;
      userEvents = userOurs + userInbound;
    }

    return {
      url,
      online: true,
      latency,
      nodeId: data.node_id || storageLimits?.nodeId || null,
      liveEvents: Number(data.live_events ?? data.events?.live ?? 0),
      liveBlobs: Number(data.live_blobs ?? data.blobs?.live ?? 0),
      userEvents,
      userOurs,
      userInbound,
      storage: storageLimits?.ok
        ? {
            writable: storageLimits.writable,
            budgetBytes: storageLimits.budgetBytes,
            usedBytes: storageLimits.usedBytes,
            remainingBytes: storageLimits.remainingBytes,
            maxSingleBytes: storageLimits.maxSingleBytes,
          }
        : null,
      battery: storageLimits?.battery || {
        mode: "readwrite",
        level: 100,
        label: "Normal",
        multiplier: 1,
        backedOff: false,
      },
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
      userEvents: 0,
      userOurs: 0,
      userInbound: 0,
      storage: null,
      battery: {
        mode: "offline",
        level: 0,
        label: "Offline",
        multiplier: 1,
        backedOff: false,
      },
      error: err?.message || "Unreachable",
    };
  }
}

const HEX64_RE = /^[0-9a-f]{64}$/i;

function normalizeKey(k) {
  if (!k || typeof k !== "string") return "";
  return k
    .trim()
    .toLowerCase()
    .replace(/^ed25519:/, "");
}

/**
 * Determine whether an event is ours (authored by the user) or addressed to us.
 * Prevents mesh sync workers from replicating strangers' data across Rabta relays.
 */
function isEventOursOrAddressedToUs(event, userPubkey) {
  if (!event || typeof event !== "object") return false;
  const self = normalizeKey(userPubkey);
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

  // 3. Addressed to us in tags (e.g. ["p", pubkey] tags)
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
function extractEventBlobs(event) {
  if (!event || typeof event !== "object") return [];
  const hashes = new Set();

  if (Array.isArray(event.blobs)) {
    for (const h of event.blobs) {
      const clean = String(h || "")
        .trim()
        .toLowerCase();
      if (HEX64_RE.test(clean)) hashes.add(clean);
    }
  }

  if (Array.isArray(event.data?.blobs)) {
    for (const h of event.data.blobs) {
      const clean = String(h || "")
        .trim()
        .toLowerCase();
      if (HEX64_RE.test(clean)) hashes.add(clean);
    }
  }

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

  if (Array.isArray(event.data?.files)) {
    for (const f of event.data.files) {
      const clean = String(f?.hash || f?.sha256 || f || "")
        .trim()
        .toLowerCase();
      if (HEX64_RE.test(clean)) hashes.add(clean);
    }
  }

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
 * Weighted budget cost of an event:
 * Events containing binary blobs cost 10 budget units.
 * Pure text or metadata events cost 1 unit.
 */
function getEventSyncWeight(event) {
  const blobs = extractEventBlobs(event);
  return blobs.length > 0 ? EVENT_BLOB_WEIGHT : EVENT_BASE_WEIGHT;
}

/**
 * Determine whether an event should be cross-replicated between Rabta servers:
 * - If selfPubkey is supplied, enforces that the event is ours or addressed to us
 * - Skips already-expired events
 * - Skips stale ephemeral WebRTC call signaling older than 5 minutes
 */
function shouldReplicateEvent(event, options = {}) {
  if (!event || !event.id) return false;

  const nowSec =
    typeof options === "number"
      ? options
      : Number(options?.nowSec) || Math.floor(Date.now() / 1000);
  const userPubkey = typeof options === "object" ? options?.selfPubkey : selfPubkey;

  // Only replicate events that are ours or addressed to us
  if (userPubkey && !isEventOursOrAddressedToUs(event, userPubkey)) {
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

/**
 * Query event count on a server in a specific time window [since, until) with optional filter.
 */
async function queryServerCount(url, since = null, until = null, filter = {}, timeoutMs = 5000) {
  const base = url.replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (since !== null && Number.isFinite(since)) params.set("since", String(Math.floor(since)));
  if (until !== null && Number.isFinite(until)) params.set("until", String(Math.floor(until)));
  if (filter?.owner) {
    const s = String(filter.owner).trim().toLowerCase();
    params.set("owner", s.startsWith("ed25519:") ? s : `ed25519:${s}`);
  }
  if (Array.isArray(filter?.labels) && filter.labels.length) {
    const clean = [...new Set(filter.labels.map((l) => String(l || "").trim()).filter(Boolean))];
    if (clean.length) params.set("labels", clean.join(","));
  } else if (typeof filter?.labels === "string" && filter.labels.trim()) {
    params.set("labels", filter.labels.trim());
  }

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
 * Fetch events list from a node within a time window with optional filter.
 */
async function fetchServerEventsRange(
  url,
  since = null,
  until = null,
  filter = {},
  limit = 50,
  timeoutMs = 6000,
) {
  const base = url.replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (since !== null && Number.isFinite(since)) params.set("since", String(Math.floor(since)));
  if (until !== null && Number.isFinite(until)) params.set("until", String(Math.floor(until)));
  if (filter?.owner) {
    const s = String(filter.owner).trim().toLowerCase();
    params.set("owner", s.startsWith("ed25519:") ? s : `ed25519:${s}`);
  }
  if (Array.isArray(filter?.labels) && filter.labels.length) {
    const clean = [...new Set(filter.labels.map((l) => String(l || "").trim()).filter(Boolean))];
    if (clean.length) params.set("labels", clean.join(","));
  } else if (typeof filter?.labels === "string" && filter.labels.trim()) {
    params.set("labels", filter.labels.trim());
  }
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
 * 1. Checks if target already has the blob via HEAD.
 * 2. Checks source HEAD for existence & size.
 * 3. Enquires target storage limits and verifies quota before downloading.
 * 4. Downloads using resumable HTTP Range requests (resumes interrupted streams).
 * 5. Uploads to target and deducts remaining budget.
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

    // 4. Quota satisfied, download from source using resumable HTTP Range requests
    const sourceBase = sourceUrl.replace(/\/+$/, "");
    const blobEndpoint = `${sourceBase}/api/v1/blobs/${hash}`;
    const dlResult = await fetchBlobResumable(blobEndpoint, {
      maxRetries: 3,
      timeoutMs: 12000,
    });

    if (!dlResult.ok) {
      log(
        `Failed to download blob ${hash.slice(0, 10)} from ${sourceUrl}: ${dlResult.error}`,
        "warn",
      );
      return false;
    }

    if (dlResult.resumed) {
      state.blobsResumed = (state.blobsResumed || 0) + 1;
      bisectionMetrics.blobsResumed = (bisectionMetrics.blobsResumed || 0) + 1;
      log(`Resumed blob ${hash.slice(0, 10)} download via HTTP Range from ${sourceUrl}`);
    }

    const blobBytes = dlResult.bytes;

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
  filter = {},
  state = {
    probesUsed: 0,
    eventsSynced: 0,
    blobsSynced: 0,
    blobsSkippedQuota: 0,
    blobsResumed: 0,
    budgetUsed: 0,
    maxBudget: MAX_SYNC_BUDGET_PER_RUN,
    maxEvents: MAX_SYNC_BUDGET_PER_RUN,
  },
  depth = 0,
) {
  const currentBudget = state.budgetUsed ?? state.eventsSynced ?? 0;
  const budgetLimit = state.maxBudget ?? state.maxEvents ?? MAX_SYNC_BUDGET_PER_RUN;
  if (currentBudget >= budgetLimit) return;
  if (state.probesUsed >= MAX_PROBES_PER_CYCLE || startSec >= endSec) return;

  state.probesUsed++;
  bisectionMetrics.probes++;

  const [countA, countB] = await Promise.all([
    queryServerCount(serverA, startSec, endSec, filter),
    queryServerCount(serverB, startSec, endSec, filter),
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
    if ((state.budgetUsed ?? state.eventsSynced ?? 0) >= budgetLimit) return;
    bisectionMetrics.leafReconciled++;
    const [eventsA, eventsB] = await Promise.all([
      fetchServerEventsRange(serverA, startSec, endSec, filter, 100),
      fetchServerEventsRange(serverB, startSec, endSec, filter, 100),
    ]);

    const mapA = new Map(eventsA.filter((e) => e?.id).map((e) => [e.id, e]));
    const mapB = new Map(eventsB.filter((e) => e?.id).map((e) => [e.id, e]));
    const nowSec = Math.floor(Date.now() / 1000);

    // Push missing from A -> B (strictly check that event is ours or addressed to us)
    for (const [id, event] of mapA) {
      const used = state.budgetUsed ?? state.eventsSynced ?? 0;
      if (used >= budgetLimit) break;
      if (!mapB.has(id)) {
        if (!shouldReplicateEvent(event, { selfPubkey, nowSec })) continue;
        const weight = getEventSyncWeight(event);
        const ok = await pushEventToServer(serverB, event);
        if (ok) {
          state.eventsSynced = (state.eventsSynced || 0) + 1;
          state.budgetUsed = (state.budgetUsed || 0) + weight;
          log(
            `Bisected leaf: synced event ${id.slice(0, 10)} from ${serverA} -> ${serverB} (budget: ${state.budgetUsed}/${budgetLimit}, ${state.eventsSynced} ev, +${weight} weight)`,
          );
          // Safely replicate referenced blobs after verifying storage quota and using resumable Range
          const blobs = extractEventBlobs(event);
          for (const h of blobs) {
            await replicateBlobSafely(serverA, serverB, h, state);
          }
          if ((state.budgetUsed ?? state.eventsSynced) >= budgetLimit) break;
        }
      }
    }

    // Push missing from B -> A (strictly check that event is ours or addressed to us)
    for (const [id, event] of mapB) {
      const used = state.budgetUsed ?? state.eventsSynced ?? 0;
      if (used >= budgetLimit) break;
      if (!mapA.has(id)) {
        if (!shouldReplicateEvent(event, { selfPubkey, nowSec })) continue;
        const weight = getEventSyncWeight(event);
        const ok = await pushEventToServer(serverA, event);
        if (ok) {
          state.eventsSynced = (state.eventsSynced || 0) + 1;
          state.budgetUsed = (state.budgetUsed || 0) + weight;
          log(
            `Bisected leaf: synced event ${id.slice(0, 10)} from ${serverB} -> ${serverA} (budget: ${state.budgetUsed}/${budgetLimit}, ${state.eventsSynced} ev, +${weight} weight)`,
          );
          const blobs = extractEventBlobs(event);
          for (const h of blobs) {
            await replicateBlobSafely(serverB, serverA, h, state);
          }
          if ((state.budgetUsed ?? state.eventsSynced) >= budgetLimit) break;
        }
      }
    }
  } else {
    // Bisect range into two sub-intervals sequentially to prevent over-syncing past batch cap
    bisectionMetrics.rangesBisected++;
    const midSec = Math.floor((startSec + endSec) / 2);

    await bisectRangeBetweenServers(serverA, serverB, startSec, midSec, filter, state, depth + 1);
    const usedAfterFirst = state.budgetUsed ?? state.eventsSynced ?? 0;
    if (usedAfterFirst < budgetLimit) {
      await bisectRangeBetweenServers(serverA, serverB, midSec, endSec, filter, state, depth + 1);
    }
  }
}

/**
 * Main cross-server synchronization cycle with Adaptive Bisection,
 * Quota-Safe Blobs, Dynamic Battery Cadence, and Resumable HTTP Range chunking.
 */
async function runSyncCycle(forceAll = false) {
  if (isSyncing) return;
  if (!relays || relays.length === 0) {
    post("status", { status: "idle", details: "No Rabta servers configured" });
    return;
  }

  if (!selfPubkey) {
    const msg =
      "Waiting for user identity: only events authored by or addressed to the user are replicated.";
    log(msg, "info");
    post("status", { status: "idle", details: "Waiting for identity" });
    return;
  }

  isSyncing = true;
  round++;
  const startedAt = Date.now();
  post("status", { status: "syncing", round });

  log(
    `Starting Rabta adaptive bisection sync round #${round} across ${relays.length} servers (user: ${selfPubkey.slice(0, 8)}…, forceAll: ${forceAll})`,
  );

  try {
    // 1. Probe all servers for liveness, storage limits, battery tier & telemetry
    const serverStatuses = await Promise.all(relays.map((r) => probeServer(r)));
    const onlineServers = serverStatuses.filter((s) => s.online);

    let ourOutboundEvents = 0;
    let ourInboundEvents = 0;
    let ourTotalEvents = 0;

    for (const s of onlineServers) {
      ourOutboundEvents = Math.max(ourOutboundEvents, s.userOurs || 0);
      ourInboundEvents = Math.max(ourInboundEvents, s.userInbound || 0);
      ourTotalEvents = Math.max(ourTotalEvents, s.userEvents || 0);
    }

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
        blobsResumed: 0,
        budgetUsed: 0,
        maxBudget: MAX_SYNC_BUDGET_PER_RUN,
        totalEventsSynced,
        totalBlobsSynced,
        totalBlobsSkippedQuota,
        totalBlobsResumed,
        ourTotalEvents,
        ourOutboundEvents,
        ourInboundEvents,
        totalDistinctEvents: ourTotalEvents,
        consistencyPct: onlineServers.length === 1 ? 100 : 0,
        servers: serverStatuses,
        bisection: { ...bisectionMetrics },
        note: msg,
      });
      post("status", { status: onlineServers.length ? "idle" : "offline" });
      return;
    }

    // 2. Dynamic Battery Cadence: filter servers eligible for sync this round
    const eligibleServers = onlineServers.filter((server) => {
      if (forceAll) return true;
      const mult = server.battery?.multiplier || 1;
      if (mult <= 1) return true;
      const isEligible = round % mult === 0;
      if (!isEligible) {
        bisectionMetrics.batteryBackoffs++;
        log(
          `Relay ${server.url} in ${server.battery?.label} (${server.battery?.mode}): backed off sync in round #${round} (cadence: ${mult}x)`,
        );
      }
      return isEligible;
    });

    // Mark activeThisRound on each server telemetry entry
    for (const s of serverStatuses) {
      if (s.battery) {
        s.battery.activeThisRound = eligibleServers.some((el) => el.url === s.url);
      }
    }

    let roundEventsSynced = 0;
    let roundBlobsSynced = 0;
    let roundBlobsSkippedQuota = 0;
    let roundBlobsResumed = 0;
    let roundBudgetUsed = 0;

    // Check if we have at least 2 servers eligible for bisection this round
    if (eligibleServers.length < 2) {
      const backedOffCount = onlineServers.length - eligibleServers.length;
      log(
        `Round #${round}: ${backedOffCount} nodes backed off for battery conservation (${eligibleServers.length} eligible). Bisection will run when nodes reach cadence round.`,
        "info",
      );
    } else {
      // 3. Perform Adaptive Range Bisection between eligible online server pairs
      // Targeted strictly to our two umbrella scopes:
      // - ours: events authored by the user
      // - inbound: events addressed to the user
      const nowSec = Math.floor(Date.now() / 1000);
      const startSec = Math.max(0, nowSec - RETENTION_DAYS * 86400);
      const endSec = nowSec + 60; // Include newly arriving heads

      const umbrellaChannels = [
        { name: "ours", filter: { owner: `ed25519:${selfPubkey}` } },
        { name: "inbound", filter: { labels: [selfPubkey] } },
      ];

      const runState = {
        probesUsed: 0,
        eventsSynced: 0,
        blobsSynced: 0,
        blobsSkippedQuota: 0,
        blobsResumed: 0,
        budgetUsed: 0,
        maxBudget: MAX_SYNC_BUDGET_PER_RUN,
        maxEvents: MAX_SYNC_BUDGET_PER_RUN,
      };

      pairLoop: for (let i = 0; i < eligibleServers.length - 1; i++) {
        if (runState.budgetUsed >= runState.maxBudget) break pairLoop;
        const serverA = eligibleServers[i].url;
        const serverB = eligibleServers[i + 1].url;

        for (const ch of umbrellaChannels) {
          if (runState.budgetUsed >= runState.maxBudget) break pairLoop;
          await bisectRangeBetweenServers(serverA, serverB, startSec, endSec, ch.filter, runState);
        }
      }

      // Fast hot sweep on recent head events among eligible servers (strictly scoped)
      // Only runs if the weighted budget (50 units) has not been reached yet!
      if (runState.budgetUsed < runState.maxBudget) {
        hotSweep: for (const ch of umbrellaChannels) {
          if (runState.budgetUsed >= runState.maxBudget) break hotSweep;
          const recentHotEvents = await fetchServerEventsRange(
            eligibleServers[0].url,
            nowSec - 3600,
            endSec,
            ch.filter,
            50,
          );
          for (const ev of recentHotEvents) {
            if (runState.budgetUsed >= runState.maxBudget) break hotSweep;
            if (!ev?.id) continue;
            if (!shouldReplicateEvent(ev, { selfPubkey, nowSec })) continue;
            const weight = getEventSyncWeight(ev);
            for (let j = 1; j < eligibleServers.length; j++) {
              if (runState.budgetUsed >= runState.maxBudget) break hotSweep;
              const targetUrl = eligibleServers[j].url;
              const pushed = await pushEventToServer(targetUrl, ev);
              if (pushed) {
                runState.eventsSynced++;
                runState.budgetUsed += weight;
                log(
                  `Hot sweep: synced event ${ev.id.slice(0, 10)} -> ${targetUrl} (budget: ${runState.budgetUsed}/${runState.maxBudget}, ${runState.eventsSynced} ev, +${weight} weight)`,
                );
                const blobs = extractEventBlobs(ev);
                for (const h of blobs) {
                  await replicateBlobSafely(eligibleServers[0].url, targetUrl, h, runState);
                }
                if (runState.budgetUsed >= runState.maxBudget) break hotSweep;
              }
            }
          }
        }
      }

      roundEventsSynced = runState.eventsSynced;
      roundBlobsSynced = runState.blobsSynced;
      roundBlobsSkippedQuota = runState.blobsSkippedQuota;
      roundBlobsResumed = runState.blobsResumed;
      roundBudgetUsed = runState.budgetUsed;
    }

    totalEventsSynced += roundEventsSynced;
    totalBlobsSynced += roundBlobsSynced;
    totalBlobsSkippedQuota += roundBlobsSkippedQuota;
    totalBlobsResumed += roundBlobsResumed;

    // 4. Calculate consistency metric across online servers for user's events
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = Math.max(0, nowSec - RETENTION_DAYS * 86400);
    const endSec = nowSec + 60;
    const userCounts = await Promise.all(
      onlineServers.map(async (s) => {
        const [cOurs, cInbound] = await Promise.all([
          queryServerCount(s.url, startSec, endSec, { owner: `ed25519:${selfPubkey}` }),
          queryServerCount(s.url, startSec, endSec, { labels: [selfPubkey] }),
        ]);
        const ours = typeof cOurs === "number" ? cOurs : 0;
        const inbound = typeof cInbound === "number" ? cInbound : 0;
        s.userOurs = ours;
        s.userInbound = inbound;
        s.userEvents = ours + inbound;
        ourOutboundEvents = Math.max(ourOutboundEvents, ours);
        ourInboundEvents = Math.max(ourInboundEvents, inbound);
        ourTotalEvents = Math.max(ourTotalEvents, s.userEvents);
        return s.userEvents;
      }),
    );
    const minEvents = Math.min(...userCounts);
    const maxEvents = Math.max(...userCounts);
    const consistencyPct = maxEvents > 0 ? Math.round((minEvents / maxEvents) * 100) : 100;

    const durationMs = Date.now() - startedAt;
    log(
      `Round #${round} complete in ${durationMs}ms: ${roundEventsSynced} events synced (${bisectionMetrics.rangesMatched} ranges verified in 1 probe, ${roundBlobsSkippedQuota} blobs quota-protected, ${roundBlobsResumed} blobs resumed via Range)`,
    );

    post("summary", {
      round,
      durationMs,
      eventsSynced: roundEventsSynced,
      blobsSynced: roundBlobsSynced,
      blobsSkippedQuota: roundBlobsSkippedQuota,
      blobsResumed: roundBlobsResumed,
      budgetUsed: roundBudgetUsed,
      maxBudget: MAX_SYNC_BUDGET_PER_RUN,
      totalEventsSynced,
      totalBlobsSynced,
      totalBlobsSkippedQuota,
      totalBlobsResumed,
      ourTotalEvents,
      ourOutboundEvents,
      ourInboundEvents,
      totalDistinctEvents: ourTotalEvents,
      consistencyPct: Math.min(100, Math.max(0, consistencyPct)),
      servers: serverStatuses,
      bisection: {
        probesUsed: bisectionMetrics.probes,
        rangesMatched: bisectionMetrics.rangesMatched,
        rangesBisected: bisectionMetrics.rangesBisected,
        leafReconciled: bisectionMetrics.leafReconciled,
        blobsSkippedQuota: bisectionMetrics.blobsSkippedQuota,
        blobsResumed: bisectionMetrics.blobsResumed,
        batteryBackoffs: bisectionMetrics.batteryBackoffs,
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

  const nextWaitMs = getRandomWaitMs();
  const nextWaitSec = Math.round(nextWaitMs / 1000);
  log(
    `Next Rabta sync scheduled in ${nextWaitSec}s (random interval ${MIN_WAIT_SEC}s–${MAX_WAIT_SEC}s, max 50 budget units/run, 10 per blob)`,
  );
  post("scheduled", { nextWaitMs, nextWaitSec, scheduledAt: Date.now() });

  timer = setTimeout(() => {
    void runSyncCycle(false);
  }, nextWaitMs);
}

// ─── Worker Message Handler ──────────────────────────────────────────────────

self.onmessage = (event) => {
  const { type, config = {}, hidden: nextHidden, forceAll = false } = event.data || {};

  if (type === "config") {
    if (config.selfPubkey !== undefined) {
      selfPubkey = config.selfPubkey
        ? String(config.selfPubkey)
            .trim()
            .toLowerCase()
            .replace(/^ed25519:/, "")
        : null;
    }
    if (Array.isArray(config.relays)) {
      relays = config.relays.filter(Boolean);
    }
    if (typeof config.autoSync === "boolean") {
      autoSync = config.autoSync;
    }
    log(
      `Worker reconfigured: adaptive bisection across ${relays.length} servers (user: ${selfPubkey ? selfPubkey.slice(0, 8) + "…" : "none"})`,
    );
    post("ready", { relaysCount: relays.length });
    if (autoSync && !isSyncing && !timer) {
      void runSyncCycle(false);
    }
  } else if (type === "sync-now") {
    if (timer) clearTimeout(timer);
    timer = null;
    if (event.data?.selfPubkey !== undefined) {
      selfPubkey = event.data.selfPubkey
        ? String(event.data.selfPubkey)
            .trim()
            .toLowerCase()
            .replace(/^ed25519:/, "")
        : null;
    }
    void runSyncCycle(forceAll || true);
  } else if (type === "pause") {
    autoSync = false;
    if (timer) clearTimeout(timer);
    timer = null;
    post("status", { status: "paused" });
    log("Auto-sync paused by user");
  } else if (type === "resume") {
    autoSync = true;
    log("Auto-sync resumed");
    scheduleNext();
  } else if (type === "visibility") {
    isHidden = Boolean(nextHidden);
    if (!isHidden && autoSync && !isSyncing && !timer) {
      scheduleNext();
    }
  } else if (type === "stop") {
    if (timer) clearTimeout(timer);
    timer = null;
    autoSync = false;
    post("status", { status: "idle" });
  } else if (type === "reset") {
    if (timer) clearTimeout(timer);
    timer = null;
    round = 0;
    totalEventsSynced = 0;
    totalBlobsSynced = 0;
    totalBlobsSkippedQuota = 0;
    totalBlobsResumed = 0;
    storageLimitsCache.clear();
    bisectionMetrics = {
      probes: 0,
      rangesMatched: 0,
      rangesBisected: 0,
      leafReconciled: 0,
      blobsSkippedQuota: 0,
      blobsResumed: 0,
      batteryBackoffs: 0,
    };
    post("status", { status: "idle" });
  }
};
