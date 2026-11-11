// Rabta engine core — pure relay-sync logic. Imports NOTHING app-level so the
// replication worker and the Node test harness can both run it.
//
// Storage contract (implemented by engineDexieStore):
//   listUnsyncedEvents(limit)          -> rows: { id, event }
//   markEventsSynced(ids, ts)
//   hasEventIds(ids)                   -> Set of ids already stored
//   putInboundEvent(event, selfHex)    -> boolean stored
//   getBlobBytes(hash)                 -> verified bytes | null
//   getPullCursor(key) / putPullCursor(key, cursor)   (optional)
//   hasLocalBlob(hash)                 (optional)

export const ENGINE_OUT_LIMIT = 25;
export const ENGINE_PULL_PAGE = 50;
export const ENGINE_PULL_DEEP_PAGES = 4;
export const ENGINE_PULL_BLOB_LIMIT = 6;
export const ENGINE_CHAT_COLLECTION = "gupt/chat/dm";
export const ENGINE_GROUP_COLLECTION = "gupt/chat/group";
const ENGINE_CHAT_COLLECTIONS = new Set([ENGINE_CHAT_COLLECTION, ENGINE_GROUP_COLLECTION]);
/** One combined head probe per relay; filtered to chat collections below. */
export const ENGINE_FAST_PROBE_LIMIT = 10;
export const ENGINE_FAST_PROBE_TIMEOUT_MS = 1500;
export const ENGINE_PRIORITY_PUSH_TIMEOUT_MS = 10000;
/** App collections owned by the local account, replicated by the engine. */
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
export const ENGINE_REQUEST_RETRIES = 4;
/** Partial replication: retry quickly at first, then back off to this cap. */
export const ENGINE_PARTIAL_RETRY_MS = 5 * 60 * 1000;
export const ENGINE_PARTIAL_RETRY_BASE_MS = 3000;
export const ENGINE_PARTIAL_RETRY_FACTOR = 4;
/** No relay ack at all: rotate the outbox instead of starving newer events. */
export const ENGINE_STUCK_RETRY_MS = 60 * 1000;
/** Unacknowledged attempts before a local write is reported as failed. */
export const ENGINE_FAILED_AFTER_ATTEMPTS = 5;
/**
 * Fully replicated. A far-future timestamp keeps the row out of the outbox
 * forever while staying inside the existing lastReplicatedAt index.
 */
export const ENGINE_DONE_AT = Number.MAX_SAFE_INTEGER;

const HEX_RE = /^[0-9a-f]{64}$/;
const BLOB_LEDGER_MAX = 2048;
const PARTIAL_RETRY_MEMORY = 256;

// Session-scoped mirror state. Content-addressed PUTs are idempotent, so the
// engine only needs to remember which (blob, relay) pairs are settled and
// share in-flight uploads between the priority path and the sync cycle.
const blobRelayDone = new Set();
const blobRelayInflight = new Map();
const partialRetryAttempts = new Map();

function blobRelayKey(relay, hash) {
  return `${relay}|${hash}`;
}

function rememberBlobRelay(relay, hash) {
  if (blobRelayDone.size >= BLOB_LEDGER_MAX) {
    const oldest = blobRelayDone.values().next().value;
    if (oldest !== undefined) blobRelayDone.delete(oldest);
  }
  blobRelayDone.add(blobRelayKey(relay, hash));
}

/** True when this session already saw the relay accept the blob. */
export function relayHasKnownBlob(relay, hash) {
  return blobRelayDone.has(blobRelayKey(String(relay || "").replace(/\/+$/, ""), hash));
}

/**
 * Partial failures retry in 3s, 12s, 48s, ... up to the 5 minute cap. The row's
 * syncAttempts cannot drive this: an event ack resets it to zero every cycle.
 */
function nextPartialRetryDelayMs(eventId) {
  const key = String(eventId);
  const attempt = partialRetryAttempts.get(key) || 0;
  partialRetryAttempts.delete(key);
  partialRetryAttempts.set(key, attempt + 1);
  if (partialRetryAttempts.size > PARTIAL_RETRY_MEMORY) {
    const oldest = partialRetryAttempts.keys().next().value;
    if (oldest !== undefined) partialRetryAttempts.delete(oldest);
  }
  return Math.min(
    ENGINE_PARTIAL_RETRY_MS,
    ENGINE_PARTIAL_RETRY_BASE_MS * ENGINE_PARTIAL_RETRY_FACTOR ** attempt,
  );
}

function clearPartialRetry(eventId) {
  partialRetryAttempts.delete(String(eventId));
}

/** Upload budget scales with size so a big blob is not cut off mid-transfer. */
export function putBlobTimeoutMs(bytes) {
  const size = Number(bytes?.byteLength) || 0;
  return Math.min(120000, Math.max(10000, 5000 + Math.ceil(size / (128 * 1024)) * 2000));
}

export async function sha256HexOfBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function nextRetryMs(attempt) {
  return ENGINE_RETRY_BASE_MS * 2 ** Math.max(0, attempt) + Math.random() * 400;
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

/** setTimeout that resolves early when the caller aborts. */
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

/** fetch with exponential backoff; 404 resolves with notFound instead of throwing. */
export async function relayRequest(url, opts = {}, log = () => {}) {
  const retries = Math.max(
    1,
    Math.min(ENGINE_REQUEST_RETRIES, Math.floor(Number(opts.retries)) || ENGINE_REQUEST_RETRIES),
  );
  const signal = opts.signal || null;
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, opts);
      if (res.ok) return { res };
      if (res.status === 404) return { res, notFound: true };
      // Deterministic client errors are not worth retrying.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
      }
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
      lastErr.status = res.status;
    } catch (err) {
      // An aborted caller must not burn retries or backoff.
      if (signal?.aborted) throw err;
      // Deterministic client errors must not burn the retry budget.
      if (err?.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
        throw err;
      }
      lastErr = err;
    }
    if (attempt < retries - 1) {
      const delay = nextRetryMs(attempt);
      log(`retry ${attempt + 1} ${url} in ${Math.round(delay)}ms`);
      await sleep(delay, signal);
      if (signal?.aborted) throw lastErr || new Error(`request aborted: ${url}`);
    }
  }
  throw lastErr || new Error(`request failed: ${url}`);
}

export async function relayHasEvent(relay, eventId) {
  const { notFound } = await relayRequest(`${relay}/api/v1/events/${eventId}`, {
    timeoutMs: 10000,
  });
  return !notFound;
}

export async function postEventToRelay(relay, event) {
  try {
    const { res } = await relayRequest(`${relay}/api/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      timeoutMs: 30000,
    });
    return res.ok;
  } catch (err) {
    // A concurrent writer (priority push) may have stored the same id.
    if (err?.status === 409) return true;
    throw err;
  }
}

/** One POST, no retries: the priority path must fail fast and let the cycle retry. */
export async function postEventOnce(
  relay,
  event,
  { timeoutMs = ENGINE_PRIORITY_PUSH_TIMEOUT_MS } = {},
) {
  const res = await fetchWithTimeout(`${relay}/api/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    timeoutMs,
  });
  if (res.ok) return true;
  if (res.status === 409) return true;
  throw new Error(`HTTP ${res.status} for ${relay}/api/v1/events`);
}

export async function relayHasBlob(relay, hash) {
  try {
    const { res, notFound } = await relayRequest(`${relay}/api/v1/blobs/${hash}`, {
      method: "HEAD",
      timeoutMs: 10000,
    });
    if (notFound) return false;
    if (res.status !== 405 && res.status !== 501) return true;
  } catch {
    // Fall through to GET for relays without HEAD support.
  }
  const { notFound } = await relayRequest(`${relay}/api/v1/blobs/${hash}`, {
    timeoutMs: 15000,
  });
  return !notFound;
}

/**
 * GET a blob and enforce sha256 == hash before returning. A corrupted payload
 * is a relay fault: callers fail over, never cache it.
 */
export async function getBlobVerified(
  relay,
  hash,
  { signal = null, timeoutMs = 60000, retries } = {},
) {
  const { res, notFound } = await relayRequest(`${relay}/api/v1/blobs/${hash}`, {
    timeoutMs,
    signal,
    retries,
  });
  if (notFound) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  const actual = await sha256HexOfBytes(buf);
  const key = String(hash).toLowerCase();
  if (actual !== key) {
    const err = new Error(`blob ${String(hash).slice(0, 12)}… corrupted at ${relay}`);
    err.name = "CorruptBlobError";
    throw err;
  }
  // A verified GET proves the relay holds the blob: skip it on the next PUT.
  rememberBlobRelay(String(relay || "").replace(/\/+$/, ""), key);
  return buf;
}

export const ENGINE_BLOB_HEDGE_MS = 1500;

/**
 * First verified relay copy wins. Relays are hedged: the next one starts when
 * the current one fails, returns 404, or stays silent for hedgeMs. Losing
 * requests are aborted so a metered connection stops transferring early.
 */
export function getBlobFromRelays(
  relays,
  hash,
  { hedgeMs = ENGINE_BLOB_HEDGE_MS, signal = null, timeoutMs, retries } = {},
) {
  const list = [
    ...new Set(
      (Array.isArray(relays) ? relays : [])
        .map((relay) => String(relay || "").replace(/\/+$/, ""))
        .filter(Boolean),
    ),
  ];
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

      getBlobVerified(list[index], key, { signal: controller.signal, timeoutMs, retries })
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

/**
 * Idempotent blob mirror. Content-addressed PUTs need no HEAD probe: this
 * session's ledger skips settled pairs and in-flight uploads are shared, so
 * the priority path and the cycle can race safely.
 */
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
      });
      if (res.ok) rememberBlobRelay(base, key);
      return res.ok;
    } catch (err) {
      // Some relays report an existing content-addressed blob as a conflict.
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
 * Sanitize query body strictly to Rabta's accepted schema:
 * ListQuery and CountQuery deny unknown fields.
 */
function sanitizeRabtaQuery(body, { isCount = false, limit = null, cursor = null } = {}) {
  const q = {};
  if (body?.collection) q.collection = String(body.collection);
  else if (body?.collection_glob) q.collection_glob = String(body.collection_glob);

  if (Array.isArray(body?.labels) && body.labels.length) {
    const cleanLabels = [
      ...new Set(body.labels.map((l) => String(l || "").trim()).filter(Boolean)),
    ];
    if (cleanLabels.length) q.labels = cleanLabels;
  }

  if (body?.owner) q.owner = String(body.owner);

  if (body?.created_at && typeof body.created_at === "object") {
    const range = {};
    if (body.created_at.gte != null && Number.isFinite(Number(body.created_at.gte))) {
      range.gte = Math.floor(Number(body.created_at.gte));
    }
    if (body.created_at.lt != null && Number.isFinite(Number(body.created_at.lt))) {
      range.lt = Math.floor(Number(body.created_at.lt));
    }
    if (range.gte != null || range.lt != null) {
      if (range.gte == null || range.lt == null || range.gte < range.lt) {
        q.created_at = range;
      }
    }
  }

  if (body?.expires_at && typeof body.expires_at === "object") {
    const range = {};
    if (body.expires_at.gte != null && Number.isFinite(Number(body.expires_at.gte))) {
      range.gte = Math.floor(Number(body.expires_at.gte));
    }
    if (body.expires_at.lt != null && Number.isFinite(Number(body.expires_at.lt))) {
      range.lt = Math.floor(Number(body.expires_at.lt));
    }
    if (range.gte != null || range.lt != null) {
      if (range.gte == null || range.lt == null || range.gte < range.lt) {
        q.expires_at = range;
      }
    }
  }

  if (!isCount) {
    if (limit != null) q.limit = Math.max(1, Math.min(100, Math.floor(Number(limit))));
    if (cursor) q.cursor = String(cursor);
  }

  return q;
}

export async function queryCountOnce(
  relay,
  queryBody,
  { timeoutMs = 15000, signal = null, retries = 2 } = {},
) {
  const payload = sanitizeRabtaQuery(queryBody, { isCount: true });
  const { res } = await relayRequest(`${relay}/api/v1/events/query/count`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs,
    signal,
    retries,
  });
  const json = await res.json().catch(() => null);
  return typeof json?.count === "number" ? json.count : 0;
}

async function queryPage(relay, queryBody, cursor, limit = ENGINE_PULL_PAGE) {
  const body = sanitizeRabtaQuery(queryBody, { isCount: false, limit, cursor });
  const { res } = await relayRequest(`${relay}/api/v1/events/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 30000,
  });
  const json = await res.json().catch(() => null);
  if (!json || !Array.isArray(json.events)) return { events: [], nextCursor: null };
  return { events: json.events, nextCursor: json.next_cursor || null };
}

async function fetchPages(relay, queryBody, startCursor, maxPages) {
  const events = [];
  let cursor = startCursor || null;
  let pages = 0;
  do {
    const page = await queryPage(relay, queryBody, cursor);
    events.push(...page.events);
    cursor = page.nextCursor || null;
    pages++;
  } while (cursor && pages < maxPages);
  return { events, nextCursor: cursor, done: !cursor };
}

export function blobHashesOf(event) {
  const list = Array.isArray(event?.blobs) ? event.blobs : [];
  return [...new Set(list.map((h) => String(h || "").toLowerCase()).filter((h) => HEX_RE.test(h)))];
}

async function queryFastOnce(
  relay,
  body,
  { limit = ENGINE_FAST_PROBE_LIMIT, timeoutMs = ENGINE_FAST_PROBE_TIMEOUT_MS } = {},
) {
  const payload = sanitizeRabtaQuery(body, { isCount: false, limit });
  const res = await fetchWithTimeout(`${relay}/api/v1/events/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${relay}`);
  const json = await res.json().catch(() => null);
  return Array.isArray(json?.events) ? json.events : [];
}

/**
 * Cheap chat head poll for the replication worker. One combined `labels: [self]`
 * probe per relay catches incoming DMs and group copies; an occasional owner
 * probe catches our own sent DMs from another device. Both run in parallel and
 * never retry, so a down relay cannot stretch the poll cadence.
 * Time bounds (`created_at: { gte: watermark - grace }`) ensure idle probes
 * transfer empty responses instead of re-downloading existing chat payloads.
 * `relayOk` reports per-relay health for the worker's circuit breaker.
 */
export async function pollChatHeads({
  store,
  pubkeyHex,
  relays,
  log = () => {},
  includeOwner = false,
  limit = ENGINE_FAST_PROBE_LIMIT,
  timeoutMs = ENGINE_FAST_PROBE_TIMEOUT_MS,
  watermark = 0,
}) {
  const summary = { pulledIds: [], errors: [], relayOk: [], latestCreatedAt: watermark };
  const self = String(pubkeyHex || "").toLowerCase();
  const relayList = (Array.isArray(relays) ? relays : []).filter(Boolean);
  if (!self || !relayList.length) return summary;

  const CHAT_SKEW_WINDOW_S = 10;
  const timeFilter =
    watermark > 0 ? { created_at: { gte: Math.max(0, watermark - CHAT_SKEW_WINDOW_S) } } : {};

  const specs = [{ labels: [self], ...timeFilter }];
  if (includeOwner) {
    specs.push({ owner: `ed25519:${self}`, collection: ENGINE_CHAT_COLLECTION, ...timeFilter });
  }
  const seen = new Map();

  await Promise.allSettled(
    relayList.map(async (relay) => {
      const results = await Promise.allSettled(
        specs.map((body) => queryFastOnce(relay, body, { limit, timeoutMs })),
      );
      let reachable = false;
      let lastErr = null;
      for (const result of results) {
        if (result.status === "rejected") {
          lastErr = result.reason;
          continue;
        }
        reachable = true;
        for (const event of result.value) {
          if (!event?.id || !ENGINE_CHAT_COLLECTIONS.has(event.collection)) continue;
          if (!seen.has(event.id)) seen.set(event.id, event);
        }
      }
      if (reachable) {
        summary.relayOk.push([relay, true]);
      } else {
        summary.relayOk.push([relay, false]);
        const msg = `chat head ${relay}: ${lastErr?.message || lastErr || "failed"}`;
        summary.errors.push(msg);
        log(msg);
      }
    }),
  );

  let highest = watermark;
  for (const event of seen.values()) {
    const ts = Number(event?.created_at) || 0;
    if (ts > highest) highest = ts;
  }
  summary.latestCreatedAt = highest;

  if (!seen.size) return summary;

  const have = await store.hasEventIds([...seen.keys()]).catch(() => new Set());
  for (const event of seen.values()) {
    if (have.has(event.id)) continue;
    try {
      const stored = await store.putInboundEvent(event, self);
      if (stored) summary.pulledIds.push(event.id);
    } catch (err) {
      const msg = `chat store ${String(event.id).slice(0, 12)}: ${err?.message || err}`;
      summary.errors.push(msg);
      log(msg);
    }
  }
  return summary;
}

/**
 * One full mirror cycle against every relay:
 *   push local unsynced events + their blobs,
 *   pull events we own or that address us, storing anything missing.
 * Per-relay failures are isolated; partial replication retries later.
 */
export async function syncCycle({ store, blobs, pubkeyHex, relays, log = () => {}, onAck = null }) {
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
  };
  const blobSource = blobs && typeof blobs.getBlobBytes === "function" ? blobs : store;
  const relayList = (Array.isArray(relays) ? relays : []).filter(Boolean);

  // ── OUT ──────────────────────────────────────────────────────────────────
  let pending = [];
  try {
    pending = await store.listUnsyncedEvents(ENGINE_OUT_LIMIT);
  } catch (err) {
    summary.errors.push(`outbox read: ${err?.message || err}`);
  }
  const unackedIds = [];
  const relayOk = new Map();

  for (const row of pending) {
    const event = row?.event;
    if (!event?.id) continue;

    const attempts = Math.max(0, Number(row?.syncAttempts) || 0);
    let eventAcked = false;
    // Acknowledge as soon as the first relay has the event: slow relays and
    // blob uploads must not delay the UI's "sent" state.
    const ackOnce = async () => {
      if (eventAcked) return;
      eventAcked = true;
      try {
        await onAck?.(event.id);
      } catch {
        // An ack callback failure must not abort the cycle.
      }
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

    // Mirror unit = (event, relay): ensure the event, then every blob it
    // references. Relays run in parallel so one slow relay cannot stall the
    // rest; blob PUTs are idempotent by content hash.
    const outcomes = await Promise.all(
      relayList.map(async (relay) => {
        const outcome = { relay, hasEvent: false, blobsOk: true, ok: true };
        try {
          if (await relayHasEvent(relay, event.id)) {
            outcome.hasEvent = true;
          } else if (await postEventToRelay(relay, event)) {
            outcome.hasEvent = true;
            summary.pushedEvents++;
          }
        } catch (err) {
          outcome.ok = false;
          log(`push event ${event.id.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
        }
        if (outcome.hasEvent) await ackOnce();
        for (const hash of hashes) {
          if (!outcome.hasEvent) break;
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
            log(`push blob ${hash.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
          }
        }
        return outcome;
      }),
    );

    const eventsComplete = outcomes.every((outcome) => outcome.hasEvent);
    const blobsComplete = outcomes.every((outcome) => outcome.hasEvent && outcome.blobsOk);
    for (const outcome of outcomes) {
      relayOk.set(outcome.relay, (relayOk.get(outcome.relay) ?? true) && outcome.ok);
    }

    try {
      if (eventAcked && eventsComplete && blobsComplete) {
        clearPartialRetry(event.id);
        await store.markEventsSynced([event.id], ENGINE_DONE_AT);
      } else if (eventAcked) {
        // One relay has it: retry the rest soon, escalating on repeat failures.
        await store.markEventsSynced([event.id], Date.now() + nextPartialRetryDelayMs(event.id));
      } else if (relayList.length) {
        // Nothing accepted it (offline/read-only): rotate, don't block the queue.
        // Once it crosses the failure threshold, back off like a partial retry.
        const retryMs =
          attempts + 1 >= ENGINE_FAILED_AFTER_ATTEMPTS
            ? ENGINE_PARTIAL_RETRY_MS
            : ENGINE_STUCK_RETRY_MS;
        await store.markEventsSynced([event.id], Date.now() + retryMs);
      }
    } catch (err) {
      summary.errors.push(`mark synced ${event.id.slice(0, 12)}: ${err?.message || err}`);
    }
    if (eventAcked) {
      summary.acknowledgedIds.push(event.id);
    } else if (relayList.length) {
      unackedIds.push(event.id);
    }
  }
  summary.relayOk = [...relayOk.entries()];

  try {
    summary.outboxRemaining = (await store.listUnsyncedEvents(1)).length;
  } catch {
    // Best effort only.
  }

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

  // ── IN ───────────────────────────────────────────────────────────────────
  const seen = new Map();
  const cursorUpdates = [];
  const specs = [
    {
      name: "owner",
      body: { owner: `ed25519:${pubkeyHex}`, collection: ENGINE_CHAT_COLLECTION },
      origin: "dm",
    },
    {
      name: "labels",
      body: { labels: [pubkeyHex], collection: ENGINE_CHAT_COLLECTION },
      origin: "dm",
    },
    {
      name: "group",
      body: { labels: [pubkeyHex], collection: ENGINE_GROUP_COLLECTION },
      origin: "group",
    },
    ...ENGINE_APP_COLLECTIONS.map(({ origin, collection }) => ({
      name: origin,
      body: { owner: `ed25519:${pubkeyHex}`, collection },
      origin,
    })),
  ];

  const FORWARD_SKEW_WINDOW_S = 15;

  for (const relay of relayList) {
    for (const spec of specs) {
      const key = `engine:pull:${pubkeyHex}:${relay}:${spec.name}`;
      try {
        const rawCursor = await store.getPullCursor?.(key);
        let state = null;
        if (rawCursor) {
          try {
            state = JSON.parse(rawCursor);
          } catch {
            state = null;
          }
        }
        if (!state || typeof state !== "object") {
          const localLatest = (await store.getLatestCreatedAt?.(spec.origin)) || 0;
          state = { high: localLatest, low: 0, done: false, backfillCursor: null };
        }

        let forwardEvents = [];

        if (state.high > 0) {
          const gte = Math.max(0, state.high - FORWARD_SKEW_WINDOW_S);
          let count = null;
          try {
            count = await queryCountOnce(relay, { ...spec.body, created_at: { gte } });
          } catch {
            count = null;
          }

          if (count === 0) {
            forwardEvents = [];
          } else {
            const page = await queryPage(relay, { ...spec.body, created_at: { gte } }, null);
            forwardEvents = page.events || [];
          }
        } else {
          // Fresh relay or fresh account: probe if any events exist
          let count = null;
          try {
            count = await queryCountOnce(relay, spec.body);
          } catch {
            count = null;
          }

          if (count === 0) {
            state.done = true;
            forwardEvents = [];
          } else {
            const page = await queryPage(relay, spec.body, null);
            forwardEvents = page.events || [];
            if (!page.nextCursor || forwardEvents.length < ENGINE_PULL_PAGE) {
              state.done = true;
            }
          }
        }

        if (forwardEvents.length > 0) {
          for (const ev of forwardEvents) {
            if (ev?.id && !seen.has(ev.id)) seen.set(ev.id, ev);
            const ts = Number(ev.created_at) || 0;
            if (ts > state.high) state.high = ts;
            if (!state.low || (ts && ts < state.low)) state.low = ts;
          }
        }

        // Backward backfill
        const backfillLt = state.low > 0 ? state.low : state.high;
        if (!state.done && backfillLt > 0) {
          let olderCount = null;
          try {
            olderCount = await queryCountOnce(relay, {
              ...spec.body,
              created_at: { lt: backfillLt },
            });
          } catch {
            olderCount = null;
          }

          if (olderCount === 0) {
            state.done = true;
            state.backfillCursor = null;
          } else {
            const deep = await fetchPages(
              relay,
              { ...spec.body, created_at: { lt: backfillLt } },
              state.backfillCursor,
              ENGINE_PULL_DEEP_PAGES,
            );
            for (const ev of deep.events) {
              if (ev?.id && !seen.has(ev.id)) seen.set(ev.id, ev);
              const ts = Number(ev.created_at) || 0;
              if (ts && (!state.low || ts < state.low)) state.low = ts;
            }
            if (deep.done) {
              state.done = true;
              state.backfillCursor = null;
            } else {
              state.backfillCursor = deep.nextCursor;
              summary.backfillMore = true;
            }
          }
        }

        cursorUpdates.push({ key, cursor: JSON.stringify(state) });
      } catch (err) {
        summary.errors.push(`pull ${spec.name} ${relay}: ${err?.message || err}`);
      }
    }
  }

  const storedEvents = [];
  if (seen.size) {
    const ids = [...seen.keys()];
    const have = await store.hasEventIds(ids).catch(() => new Set());
    const missing = [...seen.values()].filter((ev) => !have.has(ev.id));
    let storeFailed = false;
    for (const event of missing) {
      try {
        const stored = await store.putInboundEvent(event, pubkeyHex);
        if (stored) {
          summary.pulledEvents++;
          summary.pulledIds.push(event.id);
          storedEvents.push(event);
        }
      } catch (err) {
        storeFailed = true;
        summary.errors.push(`store ${String(event.id).slice(0, 12)}: ${err?.message || err}`);
      }
    }
    if (!storeFailed) {
      for (const update of cursorUpdates) {
        try {
          await store.putPullCursor?.(update.key, update.cursor);
        } catch {
          // Cursor persistence is best effort; the next cycle re-reads pages.
        }
      }
    }
  } else {
    for (const update of cursorUpdates) {
      try {
        await store.putPullCursor?.(update.key, update.cursor);
      } catch {
        // Ignore.
      }
    }
  }

  // Keep inbound blobs: verified fetch + local cache, then converge every
  // relay to the same bytes. Capped per cycle so a large video cannot stall
  // the sync loop; the read path retries lazily.
  const inboundHashes = new Set();
  for (const event of storedEvents) {
    for (const hash of blobHashesOf(event)) inboundHashes.add(hash);
  }
  let fetched = 0;
  for (const hash of inboundHashes) {
    if (fetched >= ENGINE_PULL_BLOB_LIMIT) break;
    try {
      const bytes = await store.getBlobBytes(hash);
      if (!bytes) {
        summary.errors.push(`pull blob ${hash.slice(0, 12)}: unavailable`);
        continue;
      }
      summary.pulledBlobs++;
      fetched++;
      // Converge every relay in parallel; PUTs are idempotent by content hash.
      const results = await Promise.allSettled(
        relayList.map((relay) => putBlobToRelay(relay, hash, bytes)),
      );
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) summary.pushedBlobs++;
        else if (result.status === "rejected") {
          log(
            `inbound blob ${hash.slice(0, 12)} failed: ${result.reason?.message || result.reason}`,
          );
        }
      }
    } catch (err) {
      summary.errors.push(`pull blob ${hash.slice(0, 12)}: ${err?.message || err}`);
    }
  }

  try {
    summary.outbox = await store.getOutboxStatus?.({
      failedAfter: ENGINE_FAILED_AFTER_ATTEMPTS,
    });
    if (summary.outbox?.failedIds?.length) {
      summary.failedIds = [...new Set([...summary.failedIds, ...summary.outbox.failedIds])];
    }
  } catch (err) {
    summary.errors.push(`outbox status: ${err?.message || err}`);
  }

  summary.acknowledgedIds = [...new Set(summary.acknowledgedIds)];
  return summary;
}
