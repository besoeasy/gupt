import { WsPool } from "./relay/pool.js";
import { DEFAULT_RELAYS, normalizeRelayUrl } from "@/config/servers";

/**
 * Kinds we consider "user activity" when looking for the last-seen timestamp.
 *
 * Kind 1   – short text note (most common public activity)
 * Kind 3   – contact list updates
 * Kind 4   – encrypted DMs (encrypted but the event itself is public)
 * Kind 0   – profile metadata updates
 * Kind 6   – reposts
 * Kind 7   – reactions
 * Kind 4096 – gupt group messages (custom kind used by this app)
 *
 * We intentionally exclude replaceable / addressable event kinds whose
 * `created_at` may be synthetic (e.g. 10002 relay-list, 30000 follow sets).
 */
const ACTIVITY_KINDS = [1, 3, 4, 0, 6, 7, 4096];

/** How long (ms) to wait for relay responses on a last-seen query. */
const LAST_SEEN_TIMEOUT_MS = 4_000;

/** In-memory LRU-ish cache: pubkey → { ts: unixSec, fetchedAt: Date.now() } */
const _cache = new Map();

/**
 * TTL for cached last-seen values (ms).
 * A short TTL keeps the data reasonably fresh without hammering relays on
 * every render. 5 minutes is a good balance.
 */
const CACHE_TTL_MS = 5 * 60 * 1_000;

/**
 * Fetch the Unix-second timestamp of the most recent public event for
 * `pubkeyHex` across the given `relays` (defaults to DEFAULT_RELAYS).
 *
 * Returns `null` if no events are found within the timeout.
 *
 * @param {string}   pubkeyHex  – hex-encoded Nostr public key
 * @param {string[]} [relays]   – optional relay list (defaults to DEFAULT_RELAYS)
 * @returns {Promise<number|null>}  Unix timestamp (seconds) or null
 */
export async function fetchLastSeenTimestamp(pubkeyHex, relays) {
  const pk = String(pubkeyHex || "").trim();
  if (!pk) return null;

  // Serve from cache if still fresh.
  const cached = _cache.get(pk);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.ts;
  }

  const normalizedRelays = (relays?.length ? relays : [...DEFAULT_RELAYS])
    .map((r) => normalizeRelayUrl(r))
    .filter(Boolean);

  if (!normalizedRelays.length) return null;

  // Use a fresh, lightweight pool so we don't pollute the app's shared pool.
  const pool = new WsPool();

  try {
    const events = await pool.querySync(
      normalizedRelays,
      {
        kinds: ACTIVITY_KINDS,
        authors: [pk],
        limit: 1, // We only need the most recent event
      },
      { maxWait: LAST_SEEN_TIMEOUT_MS },
    );

    if (!events.length) {
      _cache.set(pk, { ts: null, fetchedAt: Date.now() });
      return null;
    }

    // Pick the event with the highest created_at.
    const latest = events.reduce((best, e) => (e.created_at > best.created_at ? e : best));
    const ts = latest.created_at;
    _cache.set(pk, { ts, fetchedAt: Date.now() });
    return ts;
  } catch {
    return null;
  } finally {
    pool.close(normalizedRelays);
  }
}

/**
 * Invalidate the cached last-seen value for a specific pubkey.
 * Call this when you know the user just sent a message and want the
 * next `fetchLastSeenTimestamp` call to hit the relay.
 *
 * @param {string} pubkeyHex
 */
export function invalidateLastSeen(pubkeyHex) {
  _cache.delete(String(pubkeyHex || "").trim());
}

/** Clear the entire in-memory last-seen cache (e.g. after account wipe). */
export function clearLastSeenCache() {
  _cache.clear();
}

/**
 * Format a Unix-second timestamp as a human-readable "time ago" string.
 *
 * Examples: "just now", "2 min ago", "3 h ago", "5 days ago", "2 mo ago"
 *
 * This is a pure utility — it does NOT depend on Vue reactivity and can
 * be used anywhere (lib, composable, or component).
 *
 * @param {number|null} unixSec  – Unix timestamp in seconds, or null
 * @returns {string}
 */
export function formatTimeAgo(unixSec) {
  if (unixSec == null) return "unknown";
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);

  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return diffDay === 1 ? "yesterday" : `${diffDay} days ago`;

  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return diffMo === 1 ? "1 mo ago" : `${diffMo} mo ago`;

  const diffYr = Math.floor(diffMo / 12);
  return diffYr === 1 ? "1 year ago" : `${diffYr} years ago`;
}
