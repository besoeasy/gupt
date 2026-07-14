import { finalizeEvent } from "./crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { encryptDm, decryptDm, normalizeNostrPubkey } from "./crypto.js";
import { publishEventToRelays, queryNostrEvents } from "./api.js";

const VAULT_KIND = 4;

// ---------------------------------------------------------------------------
// Cache helpers
// Stores only slim encrypted event objects — no plaintext ever touches storage.
// Key:   vault_cache_<pubkeyHex>
// Shape: { cachedAt: <ms>, events: [{ id, content, created_at }] }
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

export function invalidateVaultCache(pubkeyHex) {
  try {
    localStorage.removeItem(getCacheKey(pubkeyHex));
  } catch {}
}

// ---------------------------------------------------------------------------
// Internal: decrypt a list of slim cache objects or full relay events
// ---------------------------------------------------------------------------
async function decryptEvents(privkeyHex, pubkeyHex, events) {
  const items = [];
  for (const event of events) {
    if (!event.content) continue;
    try {
      const plaintext = await decryptDm(privkeyHex, pubkeyHex, event.content);
      const item = JSON.parse(plaintext);
      item.eventId = event.id;
      // Attach expiry from Nostr tag if present
      const expiryTag = event.tags?.find((t) => t[0] === "expiration");
      if (expiryTag) {
        item.expiresAt = Number(expiryTag[1]) * 1000;
        if (item.expiresAt < Date.now()) continue; // Omit expired
      }
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

export async function getVaultCachedItems(privkeyHex, pubkeyHex) {
  const cache = readVaultCache(pubkeyHex);
  if (!cache) return null;
  const items = await decryptEvents(privkeyHex, pubkeyHex, cache.events);
  return { items, fresh: cache.fresh };
}

export async function fetchVaultItems(privkeyHex, pubkeyHex) {
  const pubkey = normalizeNostrPubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid pubkey");

  const events = await queryNostrEvents(
    { kinds: [VAULT_KIND], authors: [pubkey], "#p": [pubkey], "#t": ["gupt_vault"] },
    5000,
  );

  const slimEvents = events.map((event) => ({
    id: event.id,
    content: event.content,
    created_at: event.created_at,
    tags: event.tags,
  }));

  writeVaultCache(pubkeyHex, slimEvents);

  return await decryptEvents(privkeyHex, pubkeyHex, events);
}

export async function saveVaultItem(privkeyHex, pubkeyHex, itemData, expirySeconds = 0) {
  const dTag = itemData.id || crypto.randomUUID();
  const payloadToStore = { ...itemData, id: dTag, updatedAt: Date.now() };

  const encryptedPayload = await encryptDm(privkeyHex, pubkeyHex, JSON.stringify(payloadToStore));

  const tags = [
    ["p", pubkeyHex],
    ["t", "gupt_vault"],
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
      content: encryptedPayload,
    },
    hexToBytes(privkeyHex),
  );

  const publishResponse = await publishEventToRelays([], event);
  const anyOk = Object.values(publishResponse).some((r) => r.ok);
  if (!anyOk) throw new Error("Failed to publish vault item to relays.");

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
  invalidateVaultCache(pubkeyHex);
}
