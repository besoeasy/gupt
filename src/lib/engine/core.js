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
/** App collections owned by the local account, replicated by the engine. */
export const ENGINE_APP_COLLECTIONS = [
  { origin: "notes", collection: "gupt/vault/notes" },
  { origin: "bookmarks", collection: "gupt/vault/bookmarks" },
  { origin: "passwords", collection: "gupt/vault/passwords" },
  { origin: "feed", collection: "gupt/feed" },
];
export const ENGINE_ORIGINS = [
  "dm",
  "group",
  "profile",
  ...ENGINE_APP_COLLECTIONS.map((c) => c.origin),
];
export const ENGINE_RETRY_BASE_MS = 1000;
export const ENGINE_REQUEST_RETRIES = 4;
/** Partial replication (one relay down): retry this event later, not now. */
export const ENGINE_PARTIAL_RETRY_MS = 5 * 60 * 1000;
/** No relay ack at all: rotate the outbox instead of starving newer events. */
export const ENGINE_STUCK_RETRY_MS = 60 * 1000;
/**
 * Fully replicated. A far-future timestamp keeps the row out of the outbox
 * forever while staying inside the existing lastReplicatedAt index.
 */
export const ENGINE_DONE_AT = Number.MAX_SAFE_INTEGER;

const HEX_RE = /^[0-9a-f]{64}$/;

export async function sha256HexOfBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function nextRetryMs(attempt) {
  return ENGINE_RETRY_BASE_MS * 2 ** Math.max(0, attempt) + Math.random() * 400;
}

async function fetchWithTimeout(
  url,
  { method = "GET", headers = null, body = null, timeoutMs = 20000 } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      headers: headers || undefined,
      body: body || undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** fetch with exponential backoff; 404 resolves with notFound instead of throwing. */
export async function relayRequest(url, opts = {}, log = () => {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < ENGINE_REQUEST_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, opts);
      if (res.ok) return { res };
      if (res.status === 404) return { res, notFound: true };
      // Deterministic client errors are not worth retrying.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < ENGINE_REQUEST_RETRIES - 1) {
      const delay = nextRetryMs(attempt);
      log(`retry ${attempt + 1} ${url} in ${Math.round(delay)}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
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
  const { res } = await relayRequest(`${relay}/api/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    timeoutMs: 30000,
  });
  return res.ok;
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
export async function getBlobVerified(relay, hash) {
  const { res, notFound } = await relayRequest(`${relay}/api/v1/blobs/${hash}`, {
    timeoutMs: 60000,
  });
  if (notFound) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  const actual = await sha256HexOfBytes(buf);
  if (actual !== String(hash).toLowerCase()) {
    const err = new Error(`blob ${String(hash).slice(0, 12)}… corrupted at ${relay}`);
    err.name = "CorruptBlobError";
    throw err;
  }
  return buf;
}

export async function putBlobToRelay(relay, hash, bytes) {
  const actual = await sha256HexOfBytes(bytes);
  if (actual !== String(hash).toLowerCase()) {
    const err = new Error(`refusing to PUT corrupted blob to ${relay}`);
    err.name = "CorruptBlobError";
    throw err;
  }
  const { res } = await relayRequest(`${relay}/api/v1/blobs`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream", "Content-Length": bytes.byteLength },
    body: bytes,
    timeoutMs: 120000,
  });
  return res.ok;
}

async function queryPage(relay, queryBody, cursor) {
  const body = { ...queryBody, limit: ENGINE_PULL_PAGE };
  if (cursor) body.cursor = cursor;
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

function blobHashesOf(event) {
  const list = Array.isArray(event?.blobs) ? event.blobs : [];
  return [...new Set(list.map((h) => String(h || "").toLowerCase()).filter((h) => HEX_RE.test(h)))];
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
    outboxRemaining: 0,
    backfillMore: false,
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

  for (const row of pending) {
    const event = row?.event;
    if (!event?.id) continue;

    let eventAcked = false;
    let eventsComplete = true;
    for (const relay of relayList) {
      try {
        if (await relayHasEvent(relay, event.id)) {
          eventAcked = true;
          continue;
        }
        if (await postEventToRelay(relay, event)) {
          summary.pushedEvents++;
          eventAcked = true;
        } else {
          eventsComplete = false;
        }
      } catch (err) {
        eventsComplete = false;
        log(`push event ${event.id.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
      }
    }

    // Acknowledge as soon as a relay has the event: blob uploads can be slow
    // and must not delay the UI's "sent" state.
    if (eventAcked) {
      try {
        await onAck?.(event.id);
      } catch {
        // An ack callback failure must not abort the cycle.
      }
    }

    let blobsComplete = true;
    for (const hash of blobHashesOf(event)) {
      let bytes = null;
      try {
        bytes = await blobSource.getBlobBytes(hash);
      } catch (err) {
        summary.errors.push(`blob read ${hash.slice(0, 12)}: ${err?.message || err}`);
      }
      for (const relay of relayList) {
        try {
          if (await relayHasBlob(relay, hash)) continue;
          if (!bytes) {
            blobsComplete = false;
            continue;
          }
          if (await putBlobToRelay(relay, hash, bytes)) {
            summary.pushedBlobs++;
          } else {
            blobsComplete = false;
          }
        } catch (err) {
          blobsComplete = false;
          log(`push blob ${hash.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
        }
      }
    }

    try {
      if (eventAcked && eventsComplete && blobsComplete) {
        await store.markEventsSynced([event.id], ENGINE_DONE_AT);
      } else if (eventAcked) {
        // One relay has it: acknowledge the UI, retry the rest later.
        await store.markEventsSynced([event.id], Date.now() + ENGINE_PARTIAL_RETRY_MS);
      } else if (relayList.length) {
        // Nothing accepted it (offline/read-only): rotate, don't block the queue.
        await store.markEventsSynced([event.id], Date.now() + ENGINE_STUCK_RETRY_MS);
      }
    } catch (err) {
      summary.errors.push(`mark synced ${event.id.slice(0, 12)}: ${err?.message || err}`);
    }
    if (eventAcked) summary.acknowledgedIds.push(event.id);
  }

  try {
    summary.outboxRemaining = (await store.listUnsyncedEvents(1)).length;
  } catch {
    // Best effort only.
  }

  // ── IN ───────────────────────────────────────────────────────────────────
  const seen = new Map();
  const cursorUpdates = [];
  const specs = [
    { name: "owner", body: { owner: `ed25519:${pubkeyHex}`, collection: ENGINE_CHAT_COLLECTION } },
    { name: "labels", body: { labels: [pubkeyHex], collection: ENGINE_CHAT_COLLECTION } },
    ...ENGINE_APP_COLLECTIONS.map(({ origin, collection }) => ({
      name: origin,
      body: { owner: `ed25519:${pubkeyHex}`, collection },
    })),
  ];

  for (const relay of relayList) {
    for (const spec of specs) {
      const key = `engine:pull:${pubkeyHex}:${relay}:${spec.name}`;
      const doneKey = `${key}:done`;
      try {
        const backfillDone = Boolean(await store.getPullCursor?.(doneKey));
        // Always read the newest page so fresh events land even mid-backfill.
        const head = await fetchPages(relay, spec.body, null, 1);
        head.events.forEach((ev) => ev?.id && !seen.has(ev.id) && seen.set(ev.id, ev));

        if (backfillDone) {
          cursorUpdates.push({ key, cursor: null });
          continue;
        }

        const stored = (await store.getPullCursor?.(key)) || null;
        if (stored) {
          const deep = await fetchPages(relay, spec.body, stored, ENGINE_PULL_DEEP_PAGES);
          deep.events.forEach((ev) => ev?.id && !seen.has(ev.id) && seen.set(ev.id, ev));
          if (deep.done) {
            cursorUpdates.push({ key, cursor: null });
            cursorUpdates.push({ key: doneKey, cursor: "1" });
          } else {
            cursorUpdates.push({ key, cursor: deep.nextCursor });
            summary.backfillMore = true;
          }
        } else if (head.nextCursor) {
          cursorUpdates.push({ key, cursor: head.nextCursor });
          summary.backfillMore = true;
        } else {
          cursorUpdates.push({ key, cursor: null });
          cursorUpdates.push({ key: doneKey, cursor: "1" });
        }
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
      for (const relay of relayList) {
        try {
          if (await relayHasBlob(relay, hash)) continue;
          if (await putBlobToRelay(relay, hash, bytes)) summary.pushedBlobs++;
        } catch (err) {
          log(`inbound blob ${hash.slice(0, 12)} -> ${relay} failed: ${err?.message || err}`);
        }
      }
    } catch (err) {
      summary.errors.push(`pull blob ${hash.slice(0, 12)}: ${err?.message || err}`);
    }
  }

  summary.acknowledgedIds = [...new Set(summary.acknowledgedIds)];
  return summary;
}
