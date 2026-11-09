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
          error: data.error,
        };
      } catch (err) {
        results[relay] = {
          ok: false,
          status: 0,
          error: err?.message || "Network error",
        };
      }
    }),
  );

  return results;
}

/**
 * Check if a specific Rabta relay already has an event by ID (HEAD request).
 * Returns true if status is 200, false if 404, or null on network error.
 */
export async function checkRelayHasEvent(relay, eventId, { timeoutMs = 3000 } = {}) {
  try {
    const base = relay.replace(/\/+$/, "");
    const res = await fetch(`${base}/api/v1/events/${eventId}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 200) return true;
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
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
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

/**
 * Query live events across configured relays, merging and deduplicating by ID.
 */
export async function queryEvents(
  { collection, labels, owner, limit = 50, cursor = null } = {},
  relays,
) {
  const targets = getRelayEndpoints(relays);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const queryPayload = { limit: safeLimit };
  if (collection) queryPayload.collection = collection;
  if (labels && labels.length) queryPayload.labels = labels;
  if (owner) queryPayload.owner = owner;
  if (cursor) queryPayload.cursor = cursor;

  const eventMap = new Map();
  let nextCursor = null;

  await Promise.allSettled(
    targets.map(async (relay) => {
      try {
        const res = await fetch(`${relay}/api/v1/events/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(queryPayload),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.events)) {
          for (const ev of data.events) {
            if (ev?.id && !eventMap.has(ev.id)) {
              eventMap.set(ev.id, ev);
            }
          }
        }
        if (data.next_cursor && !nextCursor) {
          nextCursor = data.next_cursor;
        }
      } catch {}
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
  };
}

/**
 * Fetch a single event by ID, trying relays in order until found.
 */
export async function fetchEvent(id, relays) {
  const targets = getRelayEndpoints(relays);
  for (const relay of targets) {
    try {
      const res = await fetch(`${relay}/api/v1/events/${id}`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
  }
  return null;
}

/**
 * Upload a raw or prepared RABTA1 blob container to relays.
 */
export async function uploadBlob(containerBytes, relays, { onProgress } = {}) {
  const targets = getRelayEndpoints(relays);
  let lastError = null;

  onProgress?.({ phase: "uploading", percent: 10 });

  for (const relay of targets) {
    try {
      const res = await fetch(`${relay}/api/v1/blobs`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([containerBytes], { type: "application/octet-stream" }),
      });

      if (res.ok) {
        const data = await res.json();
        onProgress?.({ phase: "done", percent: 100 });
        const hash = data.hash || data.cid;
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
        lastError = new Error(errJson.error || `Upload failed with status ${res.status}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to upload blob to any Rabta relay.");
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
 * Check the health and status of a Rabta node.
 */
export async function checkRelayHealth(relayUrl, { timeoutMs = 8000 } = {}) {
  const base = relayUrl.replace(/\/+$/, "");
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(timeoutMs) });
    const latency = Date.now() - started;
    if (res.ok) {
      const data = await res.json();
      return { ok: true, latency, status: data.status, nodeId: data.node_id, data };
    }
    return { ok: false, latency, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, latency: Date.now() - started, error: err?.message || "Offline" };
  }
}
