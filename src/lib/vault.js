import { finalizeEvent } from "nostr-tools/pure";
import { hexToBytes } from "@noble/hashes/utils.js";
import { aesEncrypt, aesDecrypt, normalizeNostrPubkey } from "./crypto.js";
import { api, publishEventToRelays, queryNostrEvents } from "./api.js";

const VAULT_KIND = 1;
const PROMO_MESSAGE =
  "This user is securely storing encrypted data using Gupt Vault. Protect your privacy at https://github.com/besoeasy/gupt";

// ---------------------------------------------------------------------------
// Cache helpers
// Stores only slim encrypted event objects — no plaintext ever touches storage.
// Key:   vault_cache_<pubkeyHex>
// Shape: { cachedAt: <ms>, events: [{ id, encryptedPayload, created_at }] }
// TTL:   5 minutes — after that the cache is "stale" and a background relay
//        fetch is triggered while stale data is shown instantly (SWR pattern).
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCacheKey(pubkeyHex) {
  return `vault_cache_${pubkeyHex}`;
}

function readVaultCache(pubkeyHex) {
  try {
    const raw = localStorage.getItem(getCacheKey(pubkeyHex));
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (!Array.isArray(cache.events)) return null;
    const age = Date.now() - (cache.cachedAt || 0);
    return { events: cache.events, fresh: age < CACHE_TTL_MS };
  } catch {
    return null;
  }
}

function writeVaultCache(pubkeyHex, slimEvents) {
  try {
    localStorage.setItem(
      getCacheKey(pubkeyHex),
      JSON.stringify({ cachedAt: Date.now(), events: slimEvents }),
    );
  } catch {
    // Storage full or unavailable — silently skip, relay is always the fallback.
  }
}

/**
 * Wipe the cache for this identity.
 * Called after any mutation (save / delete) so the next vault open always
 * re-fetches from the relay instead of showing stale data.
 */
export function invalidateVaultCache(pubkeyHex) {
  try {
    localStorage.removeItem(getCacheKey(pubkeyHex));
  } catch {}
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------
export async function encryptVaultPayload(privkeyHex, payloadObj) {
  const keyBytes = hexToBytes(privkeyHex);
  const plaintext = JSON.stringify(payloadObj);
  return await aesEncrypt(keyBytes, plaintext);
}

export async function decryptVaultPayload(privkeyHex, ciphertext) {
  const keyBytes = hexToBytes(privkeyHex);
  const plaintext = await aesDecrypt(keyBytes, ciphertext);
  return JSON.parse(plaintext);
}

// ---------------------------------------------------------------------------
// Internal: decrypt a list of slim cache objects or full relay events
// ---------------------------------------------------------------------------
async function decryptEvents(privkeyHex, events) {
  const items = [];
  for (const event of events) {
    // Support both full relay events (.tags array) and slim cache objects (.encryptedPayload).
    const encryptedPayload =
      event.encryptedPayload ?? event.tags?.find((t) => t[0] === "gupt_vault")?.[1];
    if (!encryptedPayload) continue;
    try {
      const item = await decryptVaultPayload(privkeyHex, encryptedPayload);
      item.eventId = event.id;
      items.push(item);
    } catch (err) {
      console.warn("Failed to decrypt a vault item", err);
    }
  }
  return items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read vault items from the local encrypted cache — instant, no network.
 *
 * Returns null when no cache exists yet.
 * Returns { items, fresh } where fresh=false means the cache is older than
 * CACHE_TTL_MS; the caller should trigger a silent background relay refresh.
 */
export async function getVaultCachedItems(privkeyHex, pubkeyHex) {
  const cache = readVaultCache(pubkeyHex);
  if (!cache) return null;
  const items = await decryptEvents(privkeyHex, cache.events);
  return { items, fresh: cache.fresh };
}

/**
 * Fetch vault items from relays (network), update the local encrypted cache,
 * and return the freshly decrypted items. The relay is always source of truth.
 */
export async function fetchVaultItems(privkeyHex, pubkeyHex) {
  const pubkey = normalizeNostrPubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid pubkey");

  const events = await queryNostrEvents(
    { kinds: [VAULT_KIND], authors: [pubkey], "#t": ["gupt_vault"] },
    5000,
  );

  // Persist only the encrypted payload + metadata — plaintext never hits storage.
  const slimEvents = events.flatMap((event) => {
    const vaultTag = event.tags?.find((t) => t[0] === "gupt_vault");
    if (!vaultTag?.[1]) return [];
    return [{ id: event.id, encryptedPayload: vaultTag[1], created_at: event.created_at }];
  });
  writeVaultCache(pubkeyHex, slimEvents);

  return await decryptEvents(privkeyHex, events);
}

export async function saveVaultItem(privkeyHex, pubkeyHex, itemData, expirySeconds = 0) {
  const dTag = itemData.id || crypto.randomUUID();
  const payloadToStore = { ...itemData, id: dTag, updatedAt: Date.now() };

  const encryptedPayload = await encryptVaultPayload(privkeyHex, payloadToStore);

  const tags = [
    ["t", "gupt_vault"],
    ["gupt_vault", encryptedPayload],
  ];

  if (expirySeconds > 0) {
    const expiryTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;
    tags.push(["expiration", String(expiryTimestamp)]);
  }

  const event = finalizeEvent(
    {
      kind: VAULT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: PROMO_MESSAGE,
    },
    hexToBytes(privkeyHex),
  );

  const publishResponse = await publishEventToRelays([], event);
  const anyOk = Object.values(publishResponse).some((r) => r.ok);
  if (!anyOk) throw new Error("Failed to publish vault item to relays.");

  // Invalidate so next vault open fetches fresh from relay.
  invalidateVaultCache(pubkeyHex);

  return payloadToStore;
}

export async function deleteVaultItem(privkeyHex, pubkeyHex, eventId) {
  const event = finalizeEvent(
    {
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", eventId]],
      content: "Deleted vault item",
    },
    hexToBytes(privkeyHex),
  );

  await publishEventToRelays([], event);

  // Invalidate immediately — no ghost entries on next open.
  invalidateVaultCache(pubkeyHex);
}
