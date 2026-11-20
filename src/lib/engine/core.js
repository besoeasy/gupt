// Rabta engine core — clean, deterministic relay replication.
// Completely free from legacy 1-hour window ledgers and heuristic hunting.
//
// Storage contract (implemented by createEngineStore):
//   listUnsyncedEvents(limit)                        -> rows: { id, event, syncAttempts }
//   markEventsSynced(ids, ts)
//   recordOutboxResult({ ackedIds, unackedIds })     -> { failedIds }
//   getOutboxStatus({ failedAfter })                 -> { pending, stuck, failed, failedIds, ... }
//   hasEventIds(ids)                                 -> Set of ids already stored
//   getEventsByIds(ids)                              -> rows
//   putInboundEvent(event, selfHex)                  -> boolean stored
//   getBlobBytes(hash)                               -> bytes | null
//   hasLocalBlob(hash)                               -> boolean
//   putBlobBytes(hash, bytes, opts)                  -> stored
//   getWatermark(key)                                -> number (timestamp sec)
//   setWatermark(key, ts)
//   countLocalEvents({ startSec, endSec, owner, label }) -> number

export const ENGINE_OUT_LIMIT = 25;
export const ENGINE_PULL_PAGE = 50;
export const ENGINE_PULL_BLOB_LIMIT = 6;
export const ENGINE_PRIORITY_PUSH_TIMEOUT_MS = 10000;
export const ENGINE_BLOB_HEDGE_MS = 1500;

export const ENGINE_CHAT_COLLECTION = "gupt/chat/dm";
export const ENGINE_GROUP_COLLECTION = "gupt/chat/group";
export const ENGINE_MEGA_COLLECTION_GLOB = "gupt/*";

export const ENGINE_APP_COLLECTIONS = [
  { origin: "profile", collection: "gupt/profiles" },
  { origin: "notes", collection: "gupt/vault/notes" },
  { origin: "bookmarks", collection: "gupt/vault/bookmarks" },
  { origin: "passwords", collection: "gupt/vault/passwords" },
  { origin: "feed", collection: "gupt/feed" },
  { origin: "invites", collection: "gupt/invites" },
];
export const ENGINE_ORIGINS = ["dm", "group", ...ENGINE_APP_COLLECTIONS.map((c) => c.origin)];

export const ENGINE_RETRY_BASE_MS = 1000;
export const ENGINE_REQUEST_RETRIES = 3;
export const ENGINE_PARTIAL_RETRY_MS = 5 * 60 * 1000;
export const ENGINE_PARTIAL_RETRY_BASE_MS = 3000;
export const ENGINE_PARTIAL_RETRY_FACTOR = 4;
export const ENGINE_STUCK_RETRY_MS = 60 * 1000;
export const ENGINE_FAILED_AFTER_ATTEMPTS = 5;
export const ENGINE_DONE_AT = Number.MAX_SAFE_INTEGER;

import { RETENTION_DAYS } from "../../config/retention.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  RELAY_RESPONSE_TIMEOUT_MS,
  filterLiveRelays,
  isRelayDead,
  markRelayAlive,
  noteRelayOutcome,
} from "../relay/circuit.js";

const HEX_RE = /^[0-9a-f]{64}$/i;

function toBytes(value) {
  if (!value) return new Uint8Array(0);
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}
const BLOB_LEDGER_MAX = 2048;
const PARTIAL_RETRY_MEMORY = 256;

// In-memory cache of known (relay, blob) and retry attempts
const blobRelayDone = new Set();
const blobRelayInflight = new Map();
const partialRetryAttempts = new Map();

function blobRelayKey(relay, hash) {
  return `${String(relay || "").replace(/\/+$/, "")}|${String(hash || "").toLowerCase()}`;
}

export function relayHasKnownBlob(relay, hash) {
  return blobRelayDone.has(blobRelayKey(relay, hash));
}

function rememberBlobRelay(relay, hash) {
  if (blobRelayDone.size >= BLOB_LEDGER_MAX) {
    const oldest = blobRelayDone.values().next().value;
    if (oldest !== undefined) blobRelayDone.delete(oldest);
  }
  blobRelayDone.add(blobRelayKey(relay, hash));
}

function nextPartialRetryDelayMs(eventId) {
  const key = String(eventId);
  const attempts = partialRetryAttempts.get(key) || 0;
  partialRetryAttempts.set(key, attempts + 1);
  if (partialRetryAttempts.size > PARTIAL_RETRY_MEMORY) {
    const oldest = partialRetryAttempts.keys().next().value;
    if (oldest !== undefined) partialRetryAttempts.delete(oldest);
  }
  return Math.min(
    ENGINE_PARTIAL_RETRY_MS,
    ENGINE_PARTIAL_RETRY_BASE_MS * ENGINE_PARTIAL_RETRY_FACTOR ** Math.min(attempts, 4),
  );
}

function clearPartialRetry(eventId) {
  partialRetryAttempts.delete(String(eventId));
}

export function putBlobTimeoutMs(bytes) {
  const size = Number(bytes?.byteLength) || 0;
  return Math.min(120000, Math.max(10000, 5000 + Math.ceil(size / (128 * 1024)) * 2000));
}

export async function sha256HexOfBytes(bytes) {
  // Pure JS: blob verification runs in workers and over plain HTTP, where
  // `crypto.subtle` is not available. Output is byte-identical to WebCrypto.
  return bytesToHex(nobleSha256(toBytes(bytes)));
}

export function blobHashesOf(event) {
  const list = Array.isArray(event?.blobs) ? event.blobs : [];
  return [...new Set(list.map((h) => String(h || "").toLowerCase()).filter((h) => HEX_RE.test(h)))];
}

async function fetchWithTimeout(
  url,
  { method = "GET", headers = null, body = null, timeoutMs = 20000, signal = null } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    return await fetch(url, {
      method,
      headers: headers || undefined,
      body: body || undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function nextRetryMs(attempt) {
  return ENGINE_RETRY_BASE_MS * 2 ** Math.max(0, attempt) + Math.random() * 400;
}

/** Extract the relay origin from a full request URL for circuit checks. */
export function relayOriginOf(url) {
  const raw = String(url || "");
  try {
    return new URL(raw).origin;
  } catch {
    const match = raw.match(/^https?:\/\/[^/]+/i);
    return (match ? match[0] : raw).replace(/\/+$/, "");
  }
}

/** Parse Retry-After (seconds or HTTP date) into a bounded millisecond wait. */
export function parseRetryAfterMs(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60 * 60 * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.min(Math.max(0, at - Date.now()), 60 * 60 * 1000) : 0;
}

export async function relayRequest(url, opts = {}, log = () => {}) {
  const retries = Math.max(
    1,
    Math.min(ENGINE_REQUEST_RETRIES, Math.floor(Number(opts.retries)) || ENGINE_REQUEST_RETRIES),
  );
  const signal = opts.signal || null;
  // Bulk blob transfers legitimately take longer than the response window;
  // they feed transport failures into the breaker but never slow-marks.
  const slowMarksDead = opts.slowMarksDead !== false;
  const origin = relayOriginOf(url);
  if (origin && isRelayDead(origin)) {
    const err = new Error(`Relay dead for ${origin}`);
    err.relayDead = true;
    err.relay = origin;
    throw err;
  }
  const startedAt = Date.now();
  // A response of any status proves the relay answered; only a slow
  // control-plane response trips the breaker.
  const noteResponse = (ok, error = null) => {
    if (!origin) return;
    const latencyMs = Date.now() - startedAt;
    if (latencyMs > RELAY_RESPONSE_TIMEOUT_MS && !slowMarksDead) {
      markRelayAlive(origin);
      return;
    }
    noteRelayOutcome(origin, { ok, latencyMs, error });
  };
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, opts);
      if (res.ok) {
        noteResponse(true);
        return { res };
      }
      if (res.status === 304) {
        noteResponse(true);
        return { res, notModified: true };
      }
      if (res.status === 404) {
        noteResponse(true);
        return { res, notFound: true };
      }
      if (res.status === 429) {
        // Battery empty / busy: retrying burns the budget further. Surface the
        // node's Retry-After so the outbox can pace itself.
        const err = new Error(`HTTP 429 for ${url}`);
        err.status = 429;
        err.retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
        throw err;
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 408) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
      }
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
      lastErr.status = res.status;
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err?.status >= 400 && err.status < 500 && err.status !== 408) {
        noteResponse(false, err);
        throw err;
      }
      lastErr = err;
    }
    if (attempt < retries - 1) {
      const delay = nextRetryMs(attempt);
      await sleep(delay, signal);
      if (signal?.aborted) throw lastErr || new Error(`request aborted: ${url}`);
    }
  }
  if (origin) {
    const latencyMs = Date.now() - startedAt;
    if (latencyMs > RELAY_RESPONSE_TIMEOUT_MS && !slowMarksDead) {
      markRelayAlive(origin);
    } else {
      noteRelayOutcome(origin, { ok: false, latencyMs, error: lastErr });
    }
  }
  throw lastErr || new Error(`request failed: ${url}`);
}

export async function relayHasEvent(relay, eventId) {
  const { notFound } = await relayRequest(`${relay}/api/v1/events/${eventId}`, {
    timeoutMs: RELAY_RESPONSE_TIMEOUT_MS,
    retries: 1,
  });
  return !notFound;
}

export async function postEventToRelay(relay, event) {
  const { res } = await relayRequest(`${relay}/api/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    timeoutMs: RELAY_RESPONSE_TIMEOUT_MS,
    retries: 1,
  });
  return res.ok; // 201 stored, 200 duplicate
}

export async function postEventOnce(relay, event, { timeoutMs = RELAY_RESPONSE_TIMEOUT_MS } = {}) {
  const target = String(relay || "").replace(/\/+$/, "");
  if (target && isRelayDead(target)) {
    const err = new Error(`Relay dead for ${target}`);
    err.relayDead = true;
    err.relay = target;
    throw err;
  }
  const startedAt = Date.now();
  try {
    const res = await fetchWithTimeout(`${target}/api/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      timeoutMs: Math.min(Number(timeoutMs) || RELAY_RESPONSE_TIMEOUT_MS, 10_000),
    });
    noteRelayOutcome(target, { ok: res.ok, latencyMs: Date.now() - startedAt });
    if (res.ok) return true; // 201 stored, 200 duplicate
    throw new Error(`HTTP ${res.status} for ${target}/api/v1/events`);
  } catch (err) {
    if (!err?.status) {
      noteRelayOutcome(target, {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: err,
      });
    }
    throw err;
  }
}

export async function relayHasBlob(relay, hash) {
  const { res, notFound } = await relayRequest(`${relay}/api/v1/blobs/${hash}`, {
    method: "HEAD",
    timeoutMs: RELAY_RESPONSE_TIMEOUT_MS,
    retries: 1,
  });
  return !notFound && res.ok;
}

export async function getBlobVerified(
  relay,
  hash,
  { signal = null, timeoutMs = 60000, retries, onProgress = null } = {},
) {
  const base = String(relay || "").replace(/\/+$/, "");
  const key = String(hash || "").toLowerCase();
  const url = `${base}/api/v1/blobs/${key}`;
  const maxRetries = Math.max(1, Math.min(5, Math.floor(Number(retries)) || 3));
  let receivedChunks = [];
  let receivedBytes = 0;
  let lastErr = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const headers = {};
    if (receivedBytes > 0) {
      headers["Range"] = `bytes=${receivedBytes}-`;
    }
    try {
      const { res, notFound } = await relayRequest(url, {
        headers,
        timeoutMs,
        signal,
        retries: 1,
        slowMarksDead: false,
      });
      if (notFound) return null;

      // If server returned 200 OK instead of 206 Partial Content, reset accumulator
      if (res.status === 200 && receivedBytes > 0) {
        receivedChunks = [];
        receivedBytes = 0;
      }
      if (res.status === 416) {
        receivedChunks = [];
        receivedBytes = 0;
        throw new Error(`Range Not Satisfiable for ${url}`);
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
              onProgress?.({ receivedBytes });
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
        onProgress?.({ receivedBytes });
      }

      const totalBuf = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const chunk of receivedChunks) {
        totalBuf.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const actual = await sha256HexOfBytes(totalBuf);
      if (actual !== key) {
        const err = new Error(`blob ${key.slice(0, 12)}… corrupted at ${relay}`);
        err.name = "CorruptBlobError";
        throw err;
      }
      rememberBlobRelay(relay, key);
      return totalBuf;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
      if (attempt < maxRetries - 1) {
        await sleep(nextRetryMs(attempt), signal);
      }
    }
  }
  throw lastErr || new Error(`failed to get blob ${key} from ${relay}`);
}

export function getBlobFromRelays(
  relays,
  hash,
  { hedgeMs = ENGINE_BLOB_HEDGE_MS, signal = null, timeoutMs, retries, onProgress = null } = {},
) {
  const list = filterLiveRelays([
    ...new Set(
      (Array.isArray(relays) ? relays : [])
        .map((relay) => String(relay || "").replace(/\/+$/, ""))
        .filter(Boolean),
    ),
  ]);
  const key = String(hash || "").toLowerCase();
  if (!list.length || !HEX_RE.test(key) || signal?.aborted) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const controller = new AbortController();
    const started = new Set();
    const timers = new Set();
    let inflight = 0;
    let settled = false;

    const cleanup = () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      signal?.removeEventListener("abort", forwardAbort);
    };
    const finish = (bytes) => {
      if (settled) return;
      settled = true;
      cleanup();
      controller.abort();
      resolve(bytes);
    };
    const forwardAbort = () => finish(null);
    signal?.addEventListener("abort", forwardAbort, { once: true });

    const run = (index) => {
      if (settled || index >= list.length || started.has(index)) return;
      started.add(index);
      inflight += 1;
      let done = false;

      const next = () => {
        if (done || settled) return;
        done = true;
        inflight -= 1;
        if (settled) return;
        if (index + 1 < list.length) run(index + 1);
        else if (inflight === 0) finish(null);
      };

      getBlobVerified(list[index], key, {
        signal: controller.signal,
        timeoutMs,
        retries,
        onProgress,
      })
        .then((bytes) => {
          if (done || settled) return;
          if (!bytes) {
            next();
            return;
          }
          done = true;
          finish(bytes);
        })
        .catch(next);

      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!settled) run(index + 1);
      }, hedgeMs);
      timers.add(timer);
    };

    run(0);
  });
}

export async function putBlobToRelay(
  relay,
  hash,
  bytes,
  { timeoutMs = putBlobTimeoutMs(bytes), retries = 2 } = {},
) {
  const base = String(relay || "").replace(/\/+$/, "");
  const key = String(hash || "").toLowerCase();
  if (!base || !key) return false;
  if (relayHasKnownBlob(base, key)) return true;

  const flightKey = blobRelayKey(base, key);
  const inflight = blobRelayInflight.get(flightKey);
  if (inflight) return inflight;

  const task = (async () => {
    const actual = await sha256HexOfBytes(bytes);
    if (actual !== key) {
      const err = new Error(`refusing to PUT corrupted blob to ${base}`);
      err.name = "CorruptBlobError";
      throw err;
    }
    try {
      const { res } = await relayRequest(`${base}/api/v1/blobs`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", "Content-Length": bytes.byteLength },
        body: bytes,
        timeoutMs,
        retries,
        slowMarksDead: false,
      });
      if (res.ok) rememberBlobRelay(base, key);
      return res.ok;
    } catch (err) {
      if (err?.status === 409) {
        rememberBlobRelay(base, key);
        return true;
      }
      throw err;
    }
  })();
  blobRelayInflight.set(flightKey, task);
  try {
    return await task;
  } finally {
    blobRelayInflight.delete(flightKey);
  }
}

/**
 * Build URL query params for the GET /api/v1/events listing and count
 * endpoints: collection/glob, labels (comma-joined AND), owner, and the
 * half-open created_at (since/until) and expires_at (expires_since/until)
 * windows. The relay rejects unknown or empty params, so only set what's
 * actually present.
 */
function buildRabtaQuery(body, { limit = null, cursor = null } = {}) {
  const q = new URLSearchParams();
  if (body?.collection) q.set("collection", String(body.collection));
  else if (body?.collection_glob) q.set("collection_glob", String(body.collection_glob));

  if (Array.isArray(body?.labels) && body.labels.length) {
    const labels = [...new Set(body.labels.map((l) => String(l || "").trim()))].filter(Boolean);
    if (labels.length) q.set("labels", labels.join(","));
  }
  if (body?.owner) {
    const s = String(body.owner).trim().toLowerCase();
    q.set("owner", s.startsWith("ed25519:") ? s : `ed25519:${s}`);
  }
  for (const [src, lo, hi] of [
    ["created_at", "since", "until"],
    ["expires_at", "expires_since", "expires_until"],
  ]) {
    const range = body?.[src];
    if (range && typeof range === "object") {
      if (typeof range.gte === "number") q.set(lo, String(Math.floor(range.gte)));
      if (typeof range.lt === "number") q.set(hi, String(Math.floor(range.lt)));
    }
  }
  if (limit != null) q.set("limit", String(Math.max(1, Math.min(100, Math.floor(Number(limit))))));
  if (cursor) q.set("cursor", String(cursor));
  return q;
}

// ETag cache for list pages: url -> { etag, events, nextCursor }. A 304
// answer means nothing changed since the last identical query; the cached
// page is reused instead of re-transferring it.
const pageEtagCache = new Map();
const PAGE_ETAG_CACHE_MAX = 32;

export function clearEngineCache() {
  pageEtagCache.clear();
}

function rememberPageEtag(url, etag, events, nextCursor) {
  if (pageEtagCache.size >= PAGE_ETAG_CACHE_MAX) {
    pageEtagCache.delete(pageEtagCache.keys().next().value);
  }
  pageEtagCache.set(url, { etag, events, nextCursor });
}

export async function queryCountOnce(
  relay,
  queryBody,
  { timeoutMs = RELAY_RESPONSE_TIMEOUT_MS, signal = null, retries = 1 } = {},
) {
  const params = buildRabtaQuery(queryBody);
  const { res } = await relayRequest(`${relay}/api/v1/events/count?${params}`, {
    timeoutMs: Math.min(Number(timeoutMs) || RELAY_RESPONSE_TIMEOUT_MS, RELAY_RESPONSE_TIMEOUT_MS),
    signal,
    retries: 1,
  });
  const json = await res.json().catch(() => null);
  return typeof json?.count === "number" ? json.count : 0;
}

async function queryPage(relay, queryBody, cursor = null, limit = ENGINE_PULL_PAGE) {
  const params = buildRabtaQuery(queryBody, { limit, cursor });
  const url = `${relay}/api/v1/events?${params}`;
  const cached = pageEtagCache.get(url);
  const { res } = await relayRequest(url, {
    headers: cached?.etag ? { "If-None-Match": cached.etag } : undefined,
    timeoutMs: RELAY_RESPONSE_TIMEOUT_MS,
    retries: 1,
  });
  if (res.status === 304 && cached) {
    return { events: cached.events, nextCursor: cached.nextCursor, notModified: true };
  }
  const json = await res.json().catch(() => null);
  if (!json || !Array.isArray(json.events)) return { events: [], nextCursor: null };
  const etag = res.headers.get("ETag");
  if (etag) rememberPageEtag(url, etag, json.events, json.next_cursor || null);
  return { events: json.events, nextCursor: json.next_cursor || null };
}

// ─────────────────────────────────────────────────────────────────────────────
// The 2 Umbrella Ingress Channels
// ─────────────────────────────────────────────────────────────────────────────

export function getUmbrellaSpecs(pubkeyHex) {
  const self = String(pubkeyHex || "")
    .toLowerCase()
    .replace(/^ed25519:/, "");
  return [
    {
      name: "inbound",
      body: {
        labels: [self],
        collection_glob: ENGINE_MEGA_COLLECTION_GLOB,
      },
      isOwner: false,
    },
    {
      name: "outbound",
      body: {
        owner: `ed25519:${self}`,
        collection_glob: ENGINE_MEGA_COLLECTION_GLOB,
      },
      isOwner: true,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Hot Ingress: Monotonic Watermark Stream
// ─────────────────────────────────────────────────────────────────────────────

const SKEW_GRACE_S = 180; // Overlap window absorbing network latency & clock skew (3 min)

export async function pullMonotonicStream({
  store,
  pubkeyHex,
  relays,
  log = () => {},
  maxPagesPerChannel = 3,
}) {
  const summary = {
    pulledEvents: 0,
    pulledIds: [],
    storedEvents: [],
    errors: [],
    relayOk: [],
    relayOutcomes: [],
  };
  const self = String(pubkeyHex || "")
    .toLowerCase()
    .replace(/^ed25519:/, "");
  // Dead relays stay out of the pull until their 300s breaker expires; when
  // all are dead the filter falls back to the full list (3s cap each).
  const relayList = filterLiveRelays((Array.isArray(relays) ? relays : []).filter(Boolean));
  if (!self || !relayList.length) return summary;

  const seenIds = new Set();
  const specs = getUmbrellaSpecs(self);

  // Pull every live relay concurrently: a single slow relay used to hold the
  // whole cycle behind it, so worst case was 3s x relays. Now it is one 3s
  // window. Per-relay watermarks keep the streams independent; the
  // synchronous seenIds check-and-add makes the first relay to observe an
  // event its sole importer, so concurrent relays never double-store.
  const relayTasks = relayList.map(async (relay) => {
    const task = {
      relay,
      pulledEvents: 0,
      pulledIds: [],
      storedEvents: [],
      errors: [],
      relayReachable: true,
      relayStartedAt: Date.now(),
      queryLatencyTotalMs: 0,
      queryLatencySamples: 0,
    };

    for (const spec of specs) {
      const wmKey = `engine:wm:${self}:${relay}:${spec.name}`;
      try {
        const currentWatermark = (await store.getWatermark?.(wmKey)) || 0;
        const timeFilter =
          currentWatermark > 0
            ? { created_at: { gte: Math.max(0, currentWatermark - SKEW_GRACE_S) } }
            : {};

        let cursor = null;
        let pages = 0;
        let highestTs = currentWatermark;

        while (pages < maxPagesPerChannel) {
          pages++;
          const queryBody = { ...spec.body, ...timeFilter };
          const queryStartedAt = Date.now();
          const page = await queryPage(relay, queryBody, cursor, ENGINE_PULL_PAGE);
          task.queryLatencyTotalMs += Date.now() - queryStartedAt;
          task.queryLatencySamples++;

          if (!page.events.length) break;

          for (const ev of page.events) {
            if (!ev?.id) continue;
            const ts = Number(ev.created_at) || 0;
            if (ts > highestTs) highestTs = ts;

            if (seenIds.has(ev.id)) continue;
            seenIds.add(ev.id);

            // Fast IndexedDB existence check
            const have = await store.hasEventIds([ev.id]);
            if (have.has(ev.id)) continue;

            const stored = await store.putInboundEvent(ev, self);
            if (stored) {
              task.pulledEvents++;
              task.pulledIds.push(ev.id);
              task.storedEvents.push(ev);
            }
          }

          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }

        // Monotonically advance watermark
        if (highestTs > currentWatermark) {
          await store.setWatermark?.(wmKey, highestTs);
        }
      } catch (err) {
        task.relayReachable = false;
        const msg = `pull ${spec.name} from ${relay} failed: ${err?.message || err}`;
        task.errors.push(msg);
        log(msg);
      }
    }

    return task;
  });

  const settled = await Promise.allSettled(relayTasks);
  for (const [index, result] of settled.entries()) {
    if (result.status !== "fulfilled") {
      const relay = relayList[index];
      const msg = `pull from ${relay} failed: ${result.reason?.message || result.reason}`;
      summary.errors.push(msg);
      log(msg);
      summary.relayOk.push([relay, false]);
      summary.relayOutcomes.push({ relay, ok: false, latencyMs: 0 });
      continue;
    }
    const task = result.value;
    summary.pulledEvents += task.pulledEvents;
    summary.pulledIds.push(...task.pulledIds);
    summary.storedEvents.push(...task.storedEvents);
    summary.errors.push(...task.errors);
    summary.relayOk.push([task.relay, task.relayReachable]);
    summary.relayOutcomes.push({
      relay: task.relay,
      ok: task.relayReachable,
      latencyMs: task.queryLatencySamples
        ? Math.round(task.queryLatencyTotalMs / task.queryLatencySamples)
        : Date.now() - task.relayStartedAt,
    });
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cold Reconciler: Top-Down Binary Range Bisection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-down divide-and-conquer range reconciliation against a single relay.
 * If total count in [startSec, endSec) matches local count, 1 request proves
 * the whole range is in sync! If counts disagree, bisects recursively down
 * to leaf windows (<= 50 events or <= 1 hour span) and pulls the missing page.
 */
export async function reconcileRangeBisection({
  store,
  pubkeyHex,
  relay,
  spec,
  startSec = null,
  endSec = Math.floor(Date.now() / 1000) + 60,
  log = () => {},
  maxProbes = 16,
}) {
  const self = String(pubkeyHex || "")
    .toLowerCase()
    .replace(/^ed25519:/, "");
  let probesUsed = 0;
  const pulledIds = [];
  const storedEvents = [];

  // Default to the retention window instead of 1970 to avoid probe exhaustion
  const effectiveStart =
    startSec !== null && startSec !== undefined
      ? startSec
      : Math.max(0, Math.floor(Date.now() / 1000) - RETENTION_DAYS * 86400);

  async function bisect(s, e) {
    if (probesUsed >= maxProbes || s >= e) return;

    probesUsed++;
    let relayCount;
    try {
      relayCount = await queryCountOnce(relay, {
        ...spec.body,
        created_at: { gte: s, lt: e },
      });
    } catch {
      return; // Relay unreachable or timed out
    }

    const localCount = await store.countLocalEvents({
      startSec: s,
      endSec: e,
      owner: spec.isOwner ? self : null,
      label: !spec.isOwner ? self : null,
    });

    // Range is completely in sync!
    if (relayCount === localCount) return;

    // Leaf condition: window is <= 24 hours or has <= 100 events. Fetch directly!
    const span = e - s;
    if (span <= 86400 || relayCount <= ENGINE_PULL_PAGE * 2) {
      try {
        const page = await queryPage(
          relay,
          { ...spec.body, created_at: { gte: s, lt: e } },
          null,
          ENGINE_PULL_PAGE,
        );
        for (const ev of page.events) {
          if (!ev?.id) continue;
          const have = await store.hasEventIds([ev.id]);
          if (have.has(ev.id)) continue;
          const stored = await store.putInboundEvent(ev, self);
          if (stored) {
            pulledIds.push(ev.id);
            storedEvents.push(ev);
          }
        }
      } catch (err) {
        log(`reconcile fetch leaf [${s}, ${e}] from ${relay} failed: ${err?.message || err}`);
      }
      return;
    }

    // Otherwise, bisect in half
    const mid = Math.floor((s + e) / 2);
    await bisect(s, mid);
    await bisect(mid, e);
  }

  await bisect(effectiveStart, endSec);

  // Fallback: If probes exhausted without fetching anything and relay might have un-synced events, pull latest page
  if (probesUsed >= maxProbes && !pulledIds.length) {
    try {
      const page = await queryPage(
        relay,
        { ...spec.body, created_at: { gte: effectiveStart, lt: endSec } },
        null,
        ENGINE_PULL_PAGE,
      );
      for (const ev of page.events) {
        if (!ev?.id) continue;
        const have = await store.hasEventIds([ev.id]);
        if (have.has(ev.id)) continue;
        const stored = await store.putInboundEvent(ev, self);
        if (stored) {
          pulledIds.push(ev.id);
          storedEvents.push(ev);
        }
      }
    } catch {}
  }

  return { pulledIds, storedEvents, probesUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Egress: Atomic Outbox Push & Blob Mirroring
// ─────────────────────────────────────────────────────────────────────────────

export async function pushOutboxBatch({
  store,
  blobs,
  relays,
  relayModes = null,
  log = () => {},
  onAck = null,
}) {
  const summary = {
    pushedEvents: 0,
    pushedBlobs: 0,
    acknowledgedIds: [],
    failedIds: [],
    errors: [],
    outboxRemaining: 0,
    outbox: null,
    relayOk: new Map(),
    relayOutcomes: [],
  };

  const relayList = filterLiveRelays((Array.isArray(relays) ? relays : []).filter(Boolean));
  if (!relayList.length) return summary;

  // Read-only nodes refuse every write (429 battery_empty). Keep them for
  // pulls, but do not count them as push targets. Unknown modes still count.
  const pushRelays = relayList.filter(
    (relay) => String(relayModes?.[relay] || "").toLowerCase() !== "read_only",
  );
  const targets = pushRelays.length ? pushRelays : relayList;

  let batteryRetryMs = 0;
  const noteRetryAfter = (err) => {
    if (err?.status === 429) {
      batteryRetryMs = Math.max(batteryRetryMs, Number(err.retryAfterMs) || 0);
    }
  };

  let pending = [];
  try {
    pending = await store.listUnsyncedEvents(ENGINE_OUT_LIMIT);
  } catch (err) {
    summary.errors.push(`outbox read: ${err?.message || err}`);
    return summary;
  }

  const blobSource = blobs && typeof blobs.getBlobBytes === "function" ? blobs : store;
  const unackedIds = [];

  for (const row of pending) {
    const event = row?.event;
    if (!event?.id) continue;

    const attempts = Math.max(0, Number(row?.syncAttempts) || 0);
    let eventAcked = false;

    const ackOnce = async () => {
      if (eventAcked) return;
      eventAcked = true;
      try {
        await onAck?.(event.id);
      } catch {}
    };

    const hashes = blobHashesOf(event);
    const bytesByHash = new Map();
    for (const hash of hashes) {
      try {
        const bytes = await blobSource.getBlobBytes(hash);
        if (bytes) bytesByHash.set(hash, bytes);
      } catch (err) {
        summary.errors.push(`blob read ${hash.slice(0, 12)}: ${err?.message || err}`);
      }
    }

    // Mirror an event's blobs to a relay before publishing the event there.
    // Recipients may pull the event the moment it lands; publishing first
    // leaves them with an event whose media 404s until a later retry.
    const outcomes = await Promise.all(
      targets.map(async (relay) => {
        const outcome = { relay, hasEvent: false, blobsOk: true, ok: true, latencyMs: 0 };
        const startedAt = Date.now();
        try {
          for (const hash of hashes) {
            const bytes = bytesByHash.get(hash);
            if (!bytes) {
              outcome.blobsOk = false;
              continue;
            }
            try {
              if (await putBlobToRelay(relay, hash, bytes)) {
                summary.pushedBlobs++;
              } else {
                outcome.blobsOk = false;
              }
            } catch (err) {
              outcome.ok = false;
              outcome.blobsOk = false;
              noteRetryAfter(err);
              log(`push blob ${hash.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
            }
          }

          if (!outcome.blobsOk) return outcome;

          if (await relayHasEvent(relay, event.id)) {
            outcome.hasEvent = true;
          } else if (await postEventToRelay(relay, event)) {
            outcome.hasEvent = true;
            summary.pushedEvents++;
          }
        } catch (err) {
          outcome.ok = false;
          noteRetryAfter(err);
          log(`push event ${event.id.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
        } finally {
          outcome.latencyMs = Date.now() - startedAt;
        }

        if (outcome.hasEvent) await ackOnce();

        return outcome;
      }),
    );

    const eventsComplete = outcomes.every((outcome) => outcome.hasEvent);
    const blobsComplete = outcomes.every((outcome) => outcome.hasEvent && outcome.blobsOk);

    for (const outcome of outcomes) {
      summary.relayOk.set(
        outcome.relay,
        (summary.relayOk.get(outcome.relay) ?? true) && outcome.ok,
      );
      summary.relayOutcomes.push({
        relay: outcome.relay,
        ok: outcome.hasEvent,
        latencyMs: outcome.latencyMs,
      });
    }

    try {
      if (eventAcked && eventsComplete && blobsComplete) {
        clearPartialRetry(event.id);
        await store.markEventsSynced([event.id], ENGINE_DONE_AT);
      } else if (eventAcked) {
        // At least one relay accepted: schedule fast escalating partial retry
        await store.markEventsSynced(
          [event.id],
          Date.now() + Math.max(nextPartialRetryDelayMs(event.id), batteryRetryMs),
        );
      } else if (targets.length) {
        // Nothing accepted: back off stuck retry (never sooner than a 429's
        // Retry-After, so a tired node is not hammered).
        const retryMs =
          attempts + 1 >= ENGINE_FAILED_AFTER_ATTEMPTS
            ? ENGINE_PARTIAL_RETRY_MS
            : ENGINE_STUCK_RETRY_MS;
        await store.markEventsSynced([event.id], Date.now() + Math.max(retryMs, batteryRetryMs));
      }
    } catch (err) {
      summary.errors.push(`mark synced ${event.id.slice(0, 12)}: ${err?.message || err}`);
    }

    if (eventAcked) {
      summary.acknowledgedIds.push(event.id);
    } else if (targets.length) {
      unackedIds.push(event.id);
    }
  }

  try {
    summary.outboxRemaining = (await store.listUnsyncedEvents(1)).length;
    summary.outbox = await store.getOutboxStatus();
  } catch {}

  if (unackedIds.length || summary.acknowledgedIds.length) {
    try {
      const result = await store.recordOutboxResult?.({
        ackedIds: summary.acknowledgedIds,
        unackedIds,
        failedAfter: ENGINE_FAILED_AFTER_ATTEMPTS,
      });
      if (result?.failedIds?.length) summary.failedIds = result.failedIds;
    } catch (err) {
      summary.errors.push(`outbox attempts: ${err?.message || err}`);
    }
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Synchronous Cycle Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export async function syncCycle({
  store,
  blobs,
  pubkeyHex,
  relays,
  relayModes = null,
  log = () => {},
  onAck = null,
  fullReconcile = false,
}) {
  const relayList = filterLiveRelays((Array.isArray(relays) ? relays : []).filter(Boolean));
  const self = String(pubkeyHex || "")
    .toLowerCase()
    .replace(/^ed25519:/, "");

  const summary = {
    pushedEvents: 0,
    pulledEvents: 0,
    pushedBlobs: 0,
    pulledBlobs: 0,
    errors: [],
    acknowledgedIds: [],
    pulledIds: [],
    failedIds: [],
    outboxRemaining: 0,
    outbox: null,
    backfillMore: false,
    relayOk: [],
    relayOutcomes: [],
  };

  if (!self || !relayList.length) return summary;

  // 1. OUT: Drain Outbox
  const outboxRes = await pushOutboxBatch({
    store,
    blobs,
    relays: relayList,
    relayModes,
    log,
    onAck,
  });
  summary.pushedEvents = outboxRes.pushedEvents;
  summary.pushedBlobs = outboxRes.pushedBlobs;
  summary.acknowledgedIds = outboxRes.acknowledgedIds;
  summary.failedIds = outboxRes.failedIds;
  summary.outboxRemaining = outboxRes.outboxRemaining;
  summary.outbox = outboxRes.outbox;
  summary.errors.push(...outboxRes.errors);

  // 2. IN: Fast Monotonic Stream
  const streamRes = await pullMonotonicStream({
    store,
    pubkeyHex: self,
    relays: relayList,
    log,
  });
  summary.pulledEvents = streamRes.pulledEvents;
  summary.pulledIds.push(...streamRes.pulledIds);
  summary.errors.push(...streamRes.errors);

  const newlyStoredEvents = [...(streamRes.storedEvents || [])];

  // Merge relay health
  const relayHealthMap = new Map(outboxRes.relayOk);
  for (const [r, ok] of streamRes.relayOk) {
    relayHealthMap.set(r, (relayHealthMap.get(r) ?? true) && ok);
  }
  summary.relayOutcomes = [
    ...(outboxRes.relayOutcomes || []).map((entry) => ({ ...entry, op: "publish" })),
    ...(streamRes.relayOutcomes || []).map((entry) => ({ ...entry, op: "query" })),
  ];

  // 3. COLD RECONCILE: Top-Down Binary Range Bisection (when requested or on boot)
  if (fullReconcile) {
    const specs = getUmbrellaSpecs(self);
    for (const relay of relayList) {
      for (const spec of specs) {
        try {
          const recRes = await reconcileRangeBisection({
            store,
            pubkeyHex: self,
            relay,
            spec,
            log,
          });
          if (recRes.pulledIds.length) {
            summary.pulledEvents += recRes.pulledIds.length;
            summary.pulledIds.push(...recRes.pulledIds);
          }
          if (recRes.storedEvents?.length) {
            newlyStoredEvents.push(...recRes.storedEvents);
          }
        } catch (err) {
          summary.errors.push(`reconcile ${spec.name} on ${relay}: ${err?.message || err}`);
        }
      }
    }
  }

  // 4. BLOBS: Fetch missing inbound blobs into local cache and mirror across all relays
  const inboundBlobHashes = new Set();
  for (const ev of newlyStoredEvents) {
    for (const hash of blobHashesOf(ev)) {
      inboundBlobHashes.add(hash);
    }
  }

  let fetchedBlobs = 0;
  for (const hash of inboundBlobHashes) {
    if (fetchedBlobs >= ENGINE_PULL_BLOB_LIMIT) {
      summary.backfillMore = true;
      break;
    }
    try {
      const hasLocal = await store.hasLocalBlob?.(hash);
      const bytes = await store.getBlobBytes(hash);
      if (!bytes) {
        summary.errors.push(`inbound blob ${hash.slice(0, 12)}: unavailable`);
        continue;
      }
      if (!hasLocal) {
        summary.pulledBlobs++;
        fetchedBlobs++;
      }

      // Converge every relay in parallel (PUTs are idempotent by content hash)
      const results = await Promise.allSettled(
        relayList.map((relay) => putBlobToRelay(relay, hash, bytes)),
      );
      for (const res of results) {
        if (res.status === "fulfilled" && res.value) {
          summary.pushedBlobs++;
        }
      }
    } catch (err) {
      summary.errors.push(`sync blob ${hash.slice(0, 12)}: ${err?.message || err}`);
    }
  }

  summary.relayOk = [...relayHealthMap.entries()];
  return summary;
}
