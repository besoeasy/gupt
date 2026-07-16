import { finalizeEvent } from "./crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { encryptDm, decryptDm, normalizeNostrPubkey } from "./crypto.js";
import { publishToRelays, query, getKnownRelays, pool } from "./relay";
import { CONNECT_TIMEOUT_MS } from "./relay/constants.js";

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

  const events = await query(
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

  const publishResponse = await publishToRelays([], event);
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

  await publishToRelays([], event);
  invalidateVaultCache(pubkeyHex);
}

// ---------------------------------------------------------------------------
// Deep sync — replicate vault events across many relays for resilience
// ---------------------------------------------------------------------------
const DEEP_SYNC_ROUNDS = 7;
const DEEP_SYNC_RELAYS_PER_ROUND = 20;
const DEEP_SYNC_BATCH_SIZE = 5;
const DEEP_SYNC_BATCH_DELAY_MS = { min: 20_000, max: 60_000 };
const DEEP_SYNC_ROUND_DELAY_MS = 15_000;

const DEEP_SYNC_TS_KEY = "vault_deep_sync_ts";

export function getLastDeepSyncAt() {
  try {
    return Number(localStorage.getItem(DEEP_SYNC_TS_KEY) || 0);
  } catch {
    return 0;
  }
}

function setLastDeepSyncAt(ts) {
  try {
    localStorage.setItem(DEEP_SYNC_TS_KEY, String(ts));
  } catch {}
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Deep sync vault events across random relays.
 * Publishes each vault event to 20 random relays per round, 7 rounds total.
 * Batches of 5 relays with random 20-60s delays between batches.
 *
 * @param {string} privkeyHex
 * @param {string} pubkeyHex
 * @param {{ onProgress?: Function, signal?: AbortSignal }} options
 * @returns {Promise<{ published: number, errors: number }>}
 */
export async function deepSyncVault(privkeyHex, pubkeyHex, { onProgress, signal } = {}) {
  const pubkey = normalizeNostrPubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid pubkey");

  // 1. Fetch all vault events from relays
  const events = await query(
    { kinds: [VAULT_KIND], authors: [pubkey], "#p": [pubkey], "#t": ["gupt_vault"] },
    8000,
  );

  if (!events.length) {
    onProgress?.({ round: 0, batch: 0, totalRounds: DEEP_SYNC_ROUNDS, done: true, published: 0, errors: 0 });
    setLastDeepSyncAt(Date.now());
    return { published: 0, errors: 0 };
  }

  // 2. Get all known relays and shuffle
  const allRelays = shuffle(getKnownRelays());

  let totalPublished = 0;
  let totalErrors = 0;

  // 3. Run 7 rounds
  for (let round = 1; round <= DEEP_SYNC_ROUNDS; round++) {
    if (signal?.aborted) break;

    // Pick 20 random relays for this round (cycle through if fewer than 20 remain)
    const roundRelays = [];
    for (let i = 0; i < DEEP_SYNC_RELAYS_PER_ROUND; i++) {
      roundRelays.push(allRelays[i % allRelays.length]);
    }

    // Split into batches of 5
    const batches = [];
    for (let i = 0; i < roundRelays.length; i += DEEP_SYNC_BATCH_SIZE) {
      batches.push(roundRelays.slice(i, i + DEEP_SYNC_BATCH_SIZE));
    }

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      if (signal?.aborted) break;

      const batch = batches[batchIdx];
      onProgress?.({
        round,
        batch: batchIdx + 1,
        totalRounds: DEEP_SYNC_ROUNDS,
        totalBatches: batches.length,
        published: totalPublished,
        errors: totalErrors,
        done: false,
      });

      // Ensure connections and publish each event to this batch of relays
      for (const event of events) {
        if (signal?.aborted) break;
        try {
          // Connect to batch relays
          const connected = await Promise.allSettled(
            batch.map((url) =>
              pool.ensureRelay(url, { connectionTimeout: CONNECT_TIMEOUT_MS }).then(() => url),
            ),
          );
          const liveRelays = connected.filter((r) => r.status === "fulfilled").map((r) => r.value);

          if (liveRelays.length) {
            await pool.publish(liveRelays, event, { maxWait: 6000 });
            totalPublished += liveRelays.length;
          } else {
            totalErrors += batch.length;
          }
        } catch {
          totalErrors += batch.length;
        }
      }

      // Random delay between batches (skip after last batch of last round)
      if (batchIdx < batches.length - 1 || round < DEEP_SYNC_ROUNDS) {
        const delay = randomDelay(DEEP_SYNC_BATCH_DELAY_MS.min, DEEP_SYNC_BATCH_DELAY_MS.max);
        await sleep(delay, signal).catch(() => {});
      }
    }

    // Delay between rounds (skip after last round)
    if (round < DEEP_SYNC_ROUNDS) {
      await sleep(DEEP_SYNC_ROUND_DELAY_MS, signal).catch(() => {});
    }
  }

  setLastDeepSyncAt(Date.now());

  onProgress?.({
    round: DEEP_SYNC_ROUNDS,
    batch: 0,
    totalRounds: DEEP_SYNC_ROUNDS,
    totalBatches: 0,
    published: totalPublished,
    errors: totalErrors,
    done: true,
  });

  return { published: totalPublished, errors: totalErrors };
}
