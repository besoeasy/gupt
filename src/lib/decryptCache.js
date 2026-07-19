/**
 * Decrypt-on-read cache for rawEvents.
 *
 * Two levels of caching:
 *   1. Per-peer shared secret: ECDH is ~1-5ms, AES-GCM is ~0.1-1ms.
 *      Cache the derived key so we only pay ECDH once per (privkey, pubkey) pair.
 *   2. Per-event-id payload: re-renders shouldn't re-decrypt.
 *      LRU with cap; evicts oldest on overflow.
 */
import { getDmSharedSecret, aesDecrypt } from "./crypto.js";

const PAYLOAD_CACHE_CAP = 2000;

// Key: `${privkeyHex}:${peerPubkey}` → Uint8Array (shared secret)
const secretCache = new Map();

// Key: eventId → decrypted payload object
const payloadCache = new Map();

function secretCacheKey(privkeyHex, peerPubkey) {
  return `${privkeyHex}:${peerPubkey}`;
}

function getSharedSecret(privkeyHex, peerPubkey) {
  const key = secretCacheKey(privkeyHex, peerPubkey);
  let secret = secretCache.get(key);
  if (!secret) {
    secret = getDmSharedSecret(privkeyHex, peerPubkey);
    secretCache.set(key, secret);
  }
  return secret;
}

/**
 * Decrypt a single rawEvents row into the chat-row shape that messenger.js
 * and chat views expect.
 *
 * @param {string} privkeyHex — identity privkey (DMs) or group privkey (groups)
 * @param {string} selfPubkey — user's own pubkey, for the `mine` flag
 * @param {object} row — rawEvents row: { id, pubkey, kind, origin, peerPubkey, type, createdAt, event }
 * @returns {Promise<object>} chat row: { ...payload, id, sender, mine, type, ts, created_at, peerPubkey, relayHint }
 */
export async function decryptRow(privkeyHex, selfPubkey, row) {
  const cached = payloadCache.get(row.id);
  if (cached) {
    return {
      ...cached,
      id: row.id,
      sender: row.event.pubkey,
      mine: row.event.pubkey === selfPubkey,
      created_at: row.createdAt,
      peerPubkey: row.peerPubkey || null,
    };
  }

  const peerPubkey = row.peerPubkey || row.event.pubkey;
  const secret = getSharedSecret(privkeyHex, peerPubkey);
  const plaintext = await aesDecrypt(secret, row.event.content);
  const payload = JSON.parse(plaintext);

  const pTag = row.event.tags?.find((t) => t[0] === "p");
  const relayHint = pTag?.[2] || null;

  const result = {
    ...payload,
    id: row.id,
    sender: row.event.pubkey,
    mine: row.event.pubkey === selfPubkey,
    type: row.type || payload.type,
    text: payload.text ?? "",
    ts: payload.ts ?? row.createdAt,
    media: payload.media ?? null,
    created_at: row.createdAt,
    peerPubkey: row.peerPubkey || null,
    relayHint,
  };

  if (payloadCache.size >= PAYLOAD_CACHE_CAP) {
    const firstKey = payloadCache.keys().next().value;
    payloadCache.delete(firstKey);
  }
  payloadCache.set(row.id, payload);

  return result;
}

/**
 * Decrypt multiple rawEvents rows in parallel.
 */
export async function decryptRows(privkeyHex, selfPubkey, rows) {
  return Promise.all(rows.map((row) => decryptRow(privkeyHex, selfPubkey, row)));
}

/**
 * Clear both caches. Call on identity change / logout so secrets don't leak
 * across accounts.
 */
export function clearDecryptCache() {
  secretCache.clear();
  payloadCache.clear();
}
