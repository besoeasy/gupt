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

const HEX_RE = /^[0-9a-f]{64}$/i;
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
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
      }
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
      lastErr.status = res.status;
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err?.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
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
    if (err?.status === 409) return true; // Already exists / duplicate
    throw err;
  }
}

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
    // Fall back to GET
  }
  const { notFound } = await relayRequest(`${relay}/api/v1/blobs/${hash}`, {
    timeoutMs: 15000,
  });
  return !notFound;
}

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
  rememberBlobRelay(relay, key);
  return buf;
}

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

function sanitizeRabtaQuery(body, { isCount = false, limit = null, cursor = null } = {}) {
  const q = {};
  if (body?.collection) q.collection = String(body.collection);
  else if (body?.collection_glob) q.collection_glob = String(body.collection_glob);

  if (Array.isArray(body?.labels) && body.labels.length) {
    q.labels = [...new Set(body.labels.map((l) => String(l || "").trim()))].filter(Boolean);
  }
  if (body?.owner) {
    const s = String(body.owner).trim().toLowerCase();
    q.owner = s.startsWith("ed25519:") ? s : `ed25519:${s}`;
  }
  for (const field of ["created_at", "expires_at"]) {
    const src = body?.[field];
    if (src && typeof src === "object") {
      const range = {};
      if (typeof src.gte === "number") range.gte = Math.floor(src.gte);
      if (typeof src.lt === "number") range.lt = Math.floor(src.lt);
      if (Object.keys(range).length) q[field] = range;
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

async function queryPage(relay, queryBody, cursor = null, limit = ENGINE_PULL_PAGE) {
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

// ─────────────────────────────────────────────────────────────────────────────
// The 2 Umbrella Ingress Channels
// ─────────────────────────────────────────────────────────────────────────────

export function getUmbrellaSpecs(pubkeyHex) {
  const self = String(pubkeyHex || "").toLowerCase().replace(/^ed25519:/, "");
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

const SKEW_GRACE_S = 15; // Overlap window absorbing network latency & clock skew

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
    errors: [],
    relayOk: [],
  };
  const self = String(pubkeyHex || "").toLowerCase().replace(/^ed25519:/, "");
  const relayList = (Array.isArray(relays) ? relays : []).filter(Boolean);
  if (!self || !relayList.length) return summary;

  const seenIds = new Set();
  const specs = getUmbrellaSpecs(self);

  for (const relay of relayList) {
    let relayReachable = true;

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
          const page = await queryPage(relay, queryBody, cursor, ENGINE_PULL_PAGE);

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
              summary.pulledEvents++;
              summary.pulledIds.push(ev.id);
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
        relayReachable = false;
        const msg = `pull ${spec.name} from ${relay} failed: ${err?.message || err}`;
        summary.errors.push(msg);
        log(msg);
      }
    }

    summary.relayOk.push([relay, relayReachable]);
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
  startSec = 0,
  endSec = Math.floor(Date.now() / 1000) + 60,
  log = () => {},
  maxProbes = 16,
}) {
  const self = String(pubkeyHex || "").toLowerCase().replace(/^ed25519:/, "");
  let probesUsed = 0;
  const pulledIds = [];

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

    // Leaf condition: window is small or has <= 50 events. Fetch directly!
    const span = e - s;
    if (span <= 3600 || relayCount <= ENGINE_PULL_PAGE) {
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
          if (stored) pulledIds.push(ev.id);
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

  await bisect(startSec, endSec);
  return { pulledIds, probesUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Egress: Atomic Outbox Push & Blob Mirroring
// ─────────────────────────────────────────────────────────────────────────────

export async function pushOutboxBatch({
  store,
  blobs,
  relays,
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
  };

  const relayList = (Array.isArray(relays) ? relays : []).filter(Boolean);
  if (!relayList.length) return summary;

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

    // Broadcast event and blobs to all relays in parallel
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
      summary.relayOk.set(
        outcome.relay,
        (summary.relayOk.get(outcome.relay) ?? true) && outcome.ok,
      );
    }

    try {
      if (eventAcked && eventsComplete && blobsComplete) {
        clearPartialRetry(event.id);
        await store.markEventsSynced([event.id], ENGINE_DONE_AT);
      } else if (eventAcked) {
        // At least one relay accepted: schedule fast escalating partial retry
        await store.markEventsSynced([event.id], Date.now() + nextPartialRetryDelayMs(event.id));
      } else if (relayList.length) {
        // Nothing accepted: back off stuck retry
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
  log = () => {},
  onAck = null,
  fullReconcile = false,
}) {
  const relayList = (Array.isArray(relays) ? relays : []).filter(Boolean);
  const self = String(pubkeyHex || "").toLowerCase().replace(/^ed25519:/, "");

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

  if (!self || !relayList.length) return summary;

  // 1. OUT: Drain Outbox
  const outboxRes = await pushOutboxBatch({
    store,
    blobs,
    relays: relayList,
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

  // Merge relay health
  const relayHealthMap = new Map(outboxRes.relayOk);
  for (const [r, ok] of streamRes.relayOk) {
    relayHealthMap.set(r, (relayHealthMap.get(r) ?? true) && ok);
  }

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
        } catch (err) {
          summary.errors.push(`reconcile ${spec.name} on ${relay}: ${err?.message || err}`);
        }
      }
    }
  }

  summary.relayOk = [...relayHealthMap.entries()];
  return summary;
}

/**
 * Fast chat / head probe for backwards compatibility if called directly.
 */
export async function pollChatHeads({
  store,
  pubkeyHex,
  relays,
  log = () => {},
}) {
  const res = await pullMonotonicStream({
    store,
    pubkeyHex,
    relays,
    log,
    maxPagesPerChannel: 1,
  });
  return {
    pulledIds: res.pulledIds,
    errors: res.errors,
    relayOk: res.relayOk,
  };
}
