import { WsPool } from "./relay/pool.js";
import { DEFAULT_RELAYS, normalizeRelayUrl } from "@/config/servers";

const ACTIVITY_KINDS = [0, 1, 4];

const LAST_SEEN_TIMEOUT_MS = 4_000;

const _cache = new Map();

const CACHE_TTL_MS = 5 * 60 * 1_000;

// Reusable persistent pool to avoid opening/closing WebSocket handshakes on every tick
const lastSeenPool = new WsPool();

export async function fetchLastSeenTimestamp(pubkeyHex, relays) {
  const pk = String(pubkeyHex || "").trim();
  if (!pk) return null;

  // Serve from cache if still fresh.
  const cached = _cache.get(pk);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.ts;
  }

  // Prevent memory leak by pruning expired cache entries
  if (_cache.size > 200) {
    for (const [key, val] of _cache.entries()) {
      if (now - val.fetchedAt >= CACHE_TTL_MS) {
        _cache.delete(key);
      }
    }
  }

  const normalizedRelays = (relays?.length ? relays : [...DEFAULT_RELAYS])
    .map((r) => normalizeRelayUrl(r))
    .filter(Boolean);

  if (!normalizedRelays.length) return null;

  try {
    const events = await lastSeenPool.querySync(
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
  try {
    lastSeenPool.close([...lastSeenPool.sockets.keys()]);
  } catch (e) {
    console.warn("Failed to close lastSeenPool connections:", e);
  }
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
