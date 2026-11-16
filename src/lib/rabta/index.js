import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { gcm } from "@noble/ciphers/aes.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { readConfiguredRelays, DEFAULT_RELAYS } from "../../config/servers.js";

export const RABTA_MAGIC = "RABTA1";
export const RABTA_VERSION = 1;
export const RABTA_MIN_BLOB_SIZE = 64;
export const RABTA_DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days default

// Attachments larger than this are split into BLOB_MAX_PARTS equal parts, so
// every blob stays small enough for nodes with tight blob size limits.
export const BLOB_SPLIT_THRESHOLD = 2 * 1024 * 1024;
export const BLOB_MAX_PARTS = 8;

/** Rabta event ids are 64-character lowercase hex strings. */
export const RABTA_EVENT_ID_RE = /^[a-f0-9]{64}$/i;

/**
 * Deterministically serialize a value to canonical JSON.
 * - Objects: keys sorted lexicographically, compact separators without spaces.
 * - Arrays: retain order.
 * - Primitives: standard JSON serialization.
 */
export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(",")}}`;
}

/**
 * Normalize and compute the 32-byte SHA-256 digest of an event envelope.
 */
export function digestEvent({
  blobs = [],
  collection,
  created_at,
  data,
  expires_at,
  labels = [],
  owner,
}) {
  const norm = {
    blobs: Array.isArray(blobs) ? blobs.map((b) => String(b).trim().toLowerCase()) : [],
    collection: String(collection || "")
      .trim()
      .toLowerCase(),
    created_at: Math.floor(Number(created_at) || Math.floor(Date.now() / 1000)),
    data: data && typeof data === "object" ? data : {},
    expires_at: Math.floor(
      Number(expires_at) || Math.floor(Date.now() / 1000) + RABTA_DEFAULT_TTL_SECONDS,
    ),
    labels: Array.isArray(labels) ? labels.map((l) => String(l).trim()) : [],
    owner: String(owner || "")
      .trim()
      .toLowerCase(),
  };

  const jsonStr = canonical(norm);
  const digestBytes = sha256(new TextEncoder().encode(jsonStr));
  return {
    digestBytes,
    digestHex: bytesToHex(digestBytes),
    norm,
  };
}

/**
 * Signs an envelope with an Ed25519 private key (Uint8Array or 64-char hex string).
 */
export function signEvent(envelope, secretKey) {
  const secretBytes = typeof secretKey === "string" ? hexToBytes(secretKey) : secretKey;
  const { digestBytes, digestHex, norm } = digestEvent(envelope);
  const sigBytes = ed25519.sign(digestBytes, secretBytes);
  return {
    ...norm,
    id: digestHex,
    sig: bytesToHex(sigBytes),
  };
}

/**
 * Verifies an event's id and Ed25519 signature.
 */
export function verifyEvent(event) {
  try {
    if (!event || !event.id || !event.sig || !event.owner) return false;
    const { digestHex } = digestEvent(event);
    if (digestHex !== event.id) return false;

    const ownerHex = event.owner.replace(/^ed25519:/i, "");
    return ed25519.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(ownerHex));
  } catch {
    return false;
  }
}

/**
 * Convert an Ed25519 private key to an X25519 private key scalar.
 */
export function ed25519PrivToX25519(edPriv) {
  const bytes = typeof edPriv === "string" ? hexToBytes(edPriv) : edPriv;
  const h = sha512(bytes);
  const x = new Uint8Array(h.subarray(0, 32));
  x[0] &= 248;
  x[31] &= 127;
  x[31] |= 64;
  return x;
}

/**
 * Convert an Ed25519 public key to an X25519 public key coordinate.
 * u = (1 + y) / (1 - y) mod p
 */
export function ed25519PubToX25519(edPub) {
  const hex = typeof edPub === "string" ? edPub.replace(/^ed25519:/i, "") : bytesToHex(edPub);
  const p = ed25519.Point.fromHex(hex);
  const y = p.y;
  const Fp = ed25519.Point.Fp;
  const one = 1n;
  const u = Fp.mul(Fp.add(one, y), Fp.inv(Fp.sub(one, y)));
  return Fp.toBytes(u);
}

/**
 * Compute an X25519 Diffie-Hellman shared secret from an Ed25519 private key and peer's Ed25519 public key.
 */
export function getSharedSecret(myEdPriv, peerEdPub) {
  const xPriv = ed25519PrivToX25519(myEdPriv);
  const xPub = ed25519PubToX25519(peerEdPub);
  const shared = x25519.getSharedSecret(xPriv, xPub);
  return sha256(shared);
}

/**
 * Pad a small plaintext buffer so that the resulting RABTA1 container reaches at least 64 bytes.
 */
function padPlaintext(buf) {
  if (buf.length >= 25) return buf;
  const padded = new Uint8Array(25);
  padded.set(buf, 0);
  return padded;
}

/**
 * Encrypt a plaintext into a RABTA1 container format.
 * Wire format: "RABTA1" | ver(1)=1 | salt(16) | ciphertext(min 25B) | tag(16)
 */
export function sealBlob(plaintextBytes, secretBytes) {
  const plain = padPlaintext(plaintextBytes);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const km = hkdf(sha256, secretBytes, salt, new TextEncoder().encode("rabta/blob/v1"), 44);
  const key = km.subarray(0, 32);
  const nonce = km.subarray(32, 44);
  const encrypted = gcm(key, nonce).encrypt(plain);

  const magic = new TextEncoder().encode(RABTA_MAGIC);
  const ver = new Uint8Array([RABTA_VERSION]);
  const out = new Uint8Array(magic.length + 1 + salt.length + encrypted.length);
  out.set(magic, 0);
  out.set(ver, magic.length);
  out.set(salt, magic.length + 1);
  out.set(encrypted, magic.length + 1 + salt.length);
  return out;
}

/**
 * Decrypt a RABTA1 container.
 */
export function openBlob(containerBytes, secretBytes, originalLength) {
  if (containerBytes.length < RABTA_MIN_BLOB_SIZE) {
    throw new Error("Blob container too short");
  }
  const magic = new TextDecoder().decode(containerBytes.subarray(0, 6));
  const ver = containerBytes[6];
  if (magic !== RABTA_MAGIC || ver !== RABTA_VERSION) {
    throw new Error("Not a valid RABTA1 container");
  }
  const salt = containerBytes.subarray(7, 23);
  const encrypted = containerBytes.subarray(23);
  const km = hkdf(sha256, secretBytes, salt, new TextEncoder().encode("rabta/blob/v1"), 44);
  const key = km.subarray(0, 32);
  const nonce = km.subarray(32, 44);
  const decrypted = gcm(key, nonce).decrypt(encrypted);
  if (typeof originalLength === "number" && originalLength < decrypted.length) {
    return decrypted.subarray(0, originalLength);
  }
  return decrypted;
}

/**
 * Split plaintext into up to `partCount` byte ranges: ceil(size/partCount) per
 * part, the last one carries the remainder. An empty file yields one part.
 */
export function splitPlaintext(bytes, partCount) {
  const parts = Math.max(1, Math.floor(Number(partCount) || 1));
  if (parts <= 1 || bytes.length === 0) return [bytes];
  const per = Math.ceil(bytes.length / parts);
  const out = [];
  for (let start = 0; start < bytes.length; start += per) {
    out.push(bytes.subarray(start, Math.min(start + per, bytes.length)));
  }
  return out;
}

/**
 * Seal plaintext into one or more RABTA1 containers under the same secret.
 * Every container carries its own random salt, so HKDF derives a distinct
 * per-part key; receivers openBlob() each part with the same secret bytes.
 * The part count is clamped so no part drops below the 25-byte pad floor —
 * per-part padding would corrupt concatenation otherwise.
 */
export function sealParts(plaintextBytes, secretBytes, partCount = 1) {
  const maxParts = Math.max(1, Math.floor(plaintextBytes.length / 25));
  return splitPlaintext(plaintextBytes, Math.min(partCount, maxParts)).map((part) =>
    sealBlob(part, secretBytes),
  );
}

/**
 * Decrypt a single container or legacy part chunk.
 */
export function openSinglePart(part, secretBytes, nonceBytes) {
  if (
    part.length >= 7 &&
    part[0] === 82 &&
    part[1] === 65 &&
    part[2] === 66 &&
    part[3] === 84 &&
    part[4] === 65 &&
    part[5] === 49
  ) {
    return openBlob(part, secretBytes);
  }
  if (nonceBytes) {
    return gcm(secretBytes, nonceBytes).decrypt(part);
  }
  return openBlob(part, secretBytes);
}

/**
 * Decrypt a sealed part set back into the plaintext: open each container in
 * order and concatenate, then trim to the original size (the final part may
 * carry padding). Supports both RABTA1 containers and legacy AES-GCM encrypted chunks.
 */
export function openParts(partBytesList, secretBytes, originalLength, nonceBytes) {
  const chunks = partBytesList.map((part) => openSinglePart(part, secretBytes, nonceBytes));
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const plain = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    plain.set(chunk, offset);
    offset += chunk.length;
  }
  if (typeof originalLength === "number" && originalLength >= 0 && originalLength < plain.length) {
    return plain.subarray(0, originalLength);
  }
  return plain;
}

/**
 * Create a ReadableStream of decrypted chunks from an iterable, array, or async iterable
 * of encrypted container parts. Trims any padding on the final chunk if originalLength is given.
 * Enables streaming decryption for large files without loading entire plaintext into contiguous memory.
 */
export function createDecryptedPartsStream(
  partBytesIterable,
  secretBytes,
  originalLength,
  nonceBytes,
) {
  let emittedBytes = 0;
  const iterator = (async function* () {
    for await (const part of partBytesIterable) {
      const chunk = openSinglePart(part, secretBytes, nonceBytes);
      if (typeof originalLength === "number" && originalLength >= 0) {
        const remaining = originalLength - emittedBytes;
        if (remaining <= 0) break;
        if (chunk.length > remaining) {
          const trimmed = chunk.subarray(0, remaining);
          emittedBytes += trimmed.length;
          yield trimmed;
          break;
        }
      }
      emittedBytes += chunk.length;
      yield chunk;
    }
  })();

  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// ─── Network / API Client ───────────────────────────────────────────────────

function getRelayEndpoints(relays) {
  const list = Array.isArray(relays) && relays.length ? relays : readConfiguredRelays();
  const effective = list.length ? list : [...DEFAULT_RELAYS];
  return effective.map((r) => r.replace(/\/+$/, ""));
}

/**
 * Publish an event to all configured Rabta relays in parallel.
 */
export async function publishEvent(event, relays) {
  const targets = getRelayEndpoints(relays);
  const body = JSON.stringify(event);

  const results = {};
  await Promise.allSettled(
    targets.map(async (relay) => {
      const startedAt = Date.now();
      try {
        const res = await fetch(`${relay}/api/v1/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const data = await res.json().catch(() => ({}));
        results[relay] = {
          ok: res.ok,
          status: res.status,
          id: data.id || event.id,
          latencyMs: Date.now() - startedAt,
          error: data.error,
        };
      } catch (err) {
        results[relay] = {
          ok: false,
          status: 0,
          latencyMs: Date.now() - startedAt,
          error: err?.message || "Network error",
        };
      }
    }),
  );

  return results;
}

/**
 * Check if a specific Rabta relay already has an event by ID.
 * Sends If-None-Match so a live copy answers 304 without transferring the body.
 * Returns true if status is 200/304, false if 404, or null on network error.
 */
export async function checkRelayHasEvent(relay, eventId, { timeoutMs = 3000 } = {}) {
  try {
    const base = relay.replace(/\/+$/, "");
    const res = await fetch(`${base}/api/v1/events/${eventId}`, {
      headers: { "If-None-Match": `"${String(eventId).toLowerCase()}"` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 200 || res.status === 304) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Publish an event to a single Rabta relay.
 */
export async function publishEventToRelay(relay, event, { timeoutMs = 5000 } = {}) {
  const base = relay.replace(/\/+$/, "");
  const startedAt = Date.now();
  try {
    const res = await fetch(`${base}/api/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      status: res.status,
      id: data.id || event.id,
      duplicate: data.status === "duplicate",
      latencyMs: Date.now() - startedAt,
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      error: err?.message || "Network error",
    };
  }
}

/**
 * Replicate an event across all target relays, uploading only to relays
 * that do not already have the event (verified via HEAD request).
 *
 * @param {object} event - Canonical Rabta event object
 * @param {string[]} relays - List of Rabta relay URLs
 * @returns {Promise<{ uploaded: string[], skipped: string[], failed: string[] }>}
 */
export async function replicateEventToRelays(event, relays) {
  if (!event?.id || !Array.isArray(relays) || !relays.length) {
    return { uploaded: [], skipped: [], failed: [] };
  }

  const uploaded = [];
  const skipped = [];
  const failed = [];

  await Promise.all(
    relays.map(async (relay) => {
      try {
        const hasEvent = await checkRelayHasEvent(relay, event.id);
        if (hasEvent === true) {
          skipped.push(relay);
          return;
        }

        const res = await publishEventToRelay(relay, event);
        if (res.ok) {
          uploaded.push(relay);
        } else {
          failed.push(relay);
        }
      } catch {
        failed.push(relay);
      }
    }),
  );

  return { uploaded, skipped, failed };
}

// ETag cache for GET /api/v1/events listings: url -> { etag, data }. The
// relay answers conditional polls with 304 and an empty body; the cached page
// is reused in that case instead of being re-transferred.
const listEtagCache = new Map();
const LIST_ETAG_CACHE_MAX = 64;

function rememberListEtag(url, etag, data) {
  if (listEtagCache.size >= LIST_ETAG_CACHE_MAX) {
    listEtagCache.delete(listEtagCache.keys().next().value);
  }
  listEtagCache.set(url, { etag, data });
}

function mergeListPage(data, eventMap) {
  if (Array.isArray(data.events)) {
    for (const ev of data.events) {
      if (ev?.id && !eventMap.has(ev.id)) {
        eventMap.set(ev.id, ev);
      }
    }
  }
}

/**
 * Build URL query params for the GET /api/v1/events listing API. The relay
 * rejects unknown or invalid params, so only set what is actually present.
 * Labels are deduped (the relay rejects duplicates) and AND-combined.
 */
export function buildEventListParams({
  collection,
  collectionGlob,
  labels,
  owner,
  limit = 50,
  cursor = null,
  since = null,
  until = null,
} = {}) {
  const params = new URLSearchParams();
  if (collection) params.set("collection", String(collection));
  else if (collectionGlob) params.set("collection_glob", String(collectionGlob));
  if (Array.isArray(labels) && labels.length) {
    const clean = [...new Set(labels.map((l) => String(l || "").trim()).filter(Boolean))];
    if (clean.length) params.set("labels", clean.join(","));
  }
  if (owner) {
    const s = String(owner).trim().toLowerCase();
    params.set("owner", s.startsWith("ed25519:") ? s : `ed25519:${s}`);
  }
  if (limit != null) {
    params.set("limit", String(Math.min(Math.max(1, Math.floor(Number(limit) || 20)), 100)));
  }
  if (cursor) params.set("cursor", String(cursor));
  if (since != null && Number.isFinite(Number(since))) {
    params.set("since", String(Math.floor(Number(since))));
  }
  if (until != null && Number.isFinite(Number(until))) {
    params.set("until", String(Math.floor(Number(until))));
  }
  return params;
}

/**
 * Query live events across configured relays, merging and deduplicating by ID.
 */
export async function queryEvents(
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
  timeoutMs = 5000,
) {
  const targets = getRelayEndpoints(relays);
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
  const relayResults = [];
  let nextCursor = null;
  let freshResponses = 0;

  await Promise.allSettled(
    targets.map(async (relay) => {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const url = `${relay}/api/v1/events?${params}`;
      const cached = listEtagCache.get(url);
      try {
        const res = await fetch(url, {
          headers: cached?.etag ? { "If-None-Match": cached.etag } : undefined,
          signal: controller.signal,
        });
        // 304 Not Modified: nothing changed since the last identical poll.
        if (res.status === 304 && cached) {
          mergeListPage(cached.data, eventMap);
          if (cached.data.next_cursor && !nextCursor) {
            nextCursor = cached.data.next_cursor;
          }
          relayResults.push({
            relay,
            ok: true,
            notModified: true,
            latencyMs: Date.now() - startedAt,
          });
          return;
        }
        if (!res.ok) {
          listEtagCache.delete(url);
          relayResults.push({
            relay,
            ok: false,
            latencyMs: Date.now() - startedAt,
            error: `HTTP ${res.status}`,
          });
          return;
        }
        freshResponses++;
        const data = await res.json();
        mergeListPage(data, eventMap);
        if (data.next_cursor && !nextCursor) {
          nextCursor = data.next_cursor;
        }
        const etag = res.headers.get("ETag");
        if (etag) rememberListEtag(url, etag, data);
        relayResults.push({ relay, ok: true, notModified: false, latencyMs: Date.now() - startedAt });
      } catch (err) {
        relayResults.push({
          relay,
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: err?.message || "Network error",
        });
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const events = Array.from(eventMap.values()).sort((a, b) => {
    if (b.created_at !== a.created_at) return b.created_at - a.created_at;
    return b.id.localeCompare(a.id);
  });

  return {
    count: events.length,
    events,
    next_cursor: nextCursor,
    relayResults,
    // True when every relay that answered returned 304 Not Modified.
    notModified: freshResponses === 0 && relayResults.some((r) => r.ok),
  };
}

/**
 * Count live events across relays without transferring envelopes.
 * Relays hold overlapping sets, so the merged count is the largest per-relay
 * count rather than a sum.
 */
export async function countEvents(
  { collection, collectionGlob, labels, owner, since = null, until = null } = {},
  relays,
  timeoutMs = 5000,
) {
  const targets = getRelayEndpoints(relays);
  const params = buildEventListParams({
    collection,
    collectionGlob,
    labels,
    owner,
    limit: null,
    since,
    until,
  });

  const relayResults = [];
  let count = 0;

  await Promise.allSettled(
    targets.map(async (relay) => {
      const startedAt = Date.now();
      try {
        const res = await fetch(`${relay}/api/v1/events/count?${params}`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          relayResults.push({
            relay,
            ok: false,
            latencyMs: Date.now() - startedAt,
            error: `HTTP ${res.status}`,
          });
          return;
        }
        const data = await res.json();
        const value = Math.max(0, Number(data?.count) || 0);
        count = Math.max(count, value);
        relayResults.push({ relay, ok: true, count: value, latencyMs: Date.now() - startedAt });
      } catch (err) {
        relayResults.push({
          relay,
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: err?.message || "Network error",
        });
      }
    }),
  );

  return { count, relayResults };
}

// Point-read body cache: event id -> stored envelope. The relay's ETag for a
// single event is its bare id, so an If-None-Match poll can answer 304 and the
// cached body is reused instead of re-transferring it.
const eventBodyCache = new Map();
const EVENT_BODY_CACHE_MAX = 128;

function rememberEventBody(event) {
  if (!event?.id) return;
  if (eventBodyCache.size >= EVENT_BODY_CACHE_MAX) {
    eventBodyCache.delete(eventBodyCache.keys().next().value);
  }
  eventBodyCache.set(String(event.id).toLowerCase(), event);
}

/**
 * Fetch a single event by ID, trying relays in order until found. Returns the
 * per-relay outcomes so callers can feed real read health into relay scoring.
 * Revalidates a previously fetched body with If-None-Match; a 304 reuses it.
 */
export async function fetchEventDetailed(id, relays, timeoutMs = 5000) {
  const targets = getRelayEndpoints(relays);
  const outcomes = [];
  const key = String(id || "").toLowerCase();
  const cached = eventBodyCache.get(key) || null;
  for (const relay of targets) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${relay}/api/v1/events/${id}`, {
        headers: cached ? { "If-None-Match": `"${key}"` } : undefined,
        signal: controller.signal,
      });
      if (res.status === 304 && cached) {
        outcomes.push({ relay, ok: true, notModified: true, latencyMs: Date.now() - startedAt });
        return { event: cached, outcomes };
      }
      if (res.ok) {
        outcomes.push({ relay, ok: true, latencyMs: Date.now() - startedAt });
        const event = await res.json();
        rememberEventBody(event);
        return { event, outcomes };
      }
      // A 404 still proves the relay answered; it just does not hold this event.
      outcomes.push({
        relay,
        ok: res.status === 404,
        latencyMs: Date.now() - startedAt,
        error: res.status === 404 ? undefined : `HTTP ${res.status}`,
      });
    } catch (err) {
      outcomes.push({
        relay,
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: err?.message || "Network error",
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return { event: null, outcomes };
}

/**
 * Fetch a single event by ID, trying relays in order until found.
 */
export async function fetchEvent(id, relays, timeoutMs = 5000) {
  const { event } = await fetchEventDetailed(id, relays, timeoutMs);
  return event;
}

/**
 * Upload a raw or prepared RABTA1 blob container to all available relays in parallel.
 */
export async function uploadBlob(containerBytes, relays, { onProgress } = {}) {
  const targets = getRelayEndpoints(relays);
  if (!targets.length) throw new Error("No Rabta relays configured");

  onProgress?.({ phase: "uploading", percent: 10 });

  const blob = new Blob([containerBytes], { type: "application/octet-stream" });
  const successes = [];
  const errors = [];

  const settled = await Promise.allSettled(
    targets.map(async (relay) => {
      const res = await fetch(`${relay}/api/v1/blobs`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob,
      });

      if (res.ok) {
        const data = await res.json();
        const hash = data.hash;
        const directUrl = data.url?.startsWith("http")
          ? data.url
          : `${relay.replace(/\/+$/, "")}${data.url?.startsWith("/") ? "" : "/"}${data.url || `api/v1/blobs/${hash}`}`;
        return {
          hash,
          url: directUrl,
          size: data.size,
          expires_at: data.expires_at,
          relay,
        };
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Upload failed with status ${res.status}`);
      }
    }),
  );

  for (const r of settled) {
    if (r.status === "fulfilled") {
      successes.push(r.value);
    } else {
      errors.push(r.reason);
    }
  }

  if (!successes.length) {
    throw errors[0] || new Error("Failed to upload blob to any Rabta relay.");
  }

  onProgress?.({ phase: "done", percent: 100 });
  return successes[0];
}

/**
 * Download a blob by SHA-256 hash from configured relays with failover.
 */
export async function downloadBlob(hash, relays) {
  const targets = getRelayEndpoints(relays);
  let lastError = null;

  for (const relay of targets) {
    try {
      const res = await fetch(`${relay}/api/v1/blobs/${hash}`);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        return new Uint8Array(buf);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Blob ${hash} not found on any relay.`);
}

/**
 * Check a Rabta node's health and read its capacity telemetry.
 * Fast path: GET /api/v1/health checks process and SQLite liveness (zero join overhead).
 * Detailed path: GET /api/v1/node returns battery tier, storage budget, and peers.
 */
export async function checkRelayHealth(relayUrl, { timeoutMs = 8000, detailed = false } = {}) {
  const base = relayUrl.replace(/\/+$/, "");
  const started = Date.now();
  const endpoint = detailed ? `${base}/api/v1/node` : `${base}/api/v1/health`;
  try {
    let res = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
    // If /health returned 404 (e.g. non-Rabta relay or legacy endpoint), fallback to /node
    if (!detailed && res.status === 404) {
      res = await fetch(`${base}/api/v1/node`, { signal: AbortSignal.timeout(timeoutMs) });
    }
    const latency = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        reachable: true,
        status: res.status,
        latency,
        error: `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    return {
      ok: true,
      reachable: true,
      status: res.status,
      latency,
      nodeId: data?.node_id || res.headers.get("x-rabta-node-id") || null,
      liveEvents:
        data?.live_events !== undefined
          ? Number(data.live_events)
          : data?.events?.live !== undefined
            ? Number(data.events.live)
            : undefined,
      liveBlobs:
        data?.live_blobs !== undefined
          ? Number(data.live_blobs)
          : data?.blobs?.live !== undefined
            ? Number(data.blobs.live)
            : undefined,
      mode: data?.peers?.battery?.mode || null,
      syncPeers: Array.isArray(data?.sync) ? data.sync.length : 0,
      storageUsedBytes: Math.max(0, Number(data?.storage?.used_bytes) || 0),
      storageBudgetBytes: Math.max(0, Number(data?.storage?.budget_bytes) || 0),
      limits: data?.limits || null,
      data,
    };
  } catch (err) {
    return {
      ok: false,
      reachable: false,
      status: 0,
      latency: Date.now() - started,
      error: err?.message || "Offline",
    };
  }
}

/**
 * Fetch full node telemetry (GET /api/v1/node) for settings/stats.
 */
export async function fetchRelayTelemetry(relayUrl, options = {}) {
  return checkRelayHealth(relayUrl, { ...options, detailed: true });
}
