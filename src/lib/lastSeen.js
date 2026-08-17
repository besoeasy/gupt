import { WsPool } from "./relay/pool.js";
import { DEFAULT_RELAYS, normalizeRelayUrl } from "@/config/servers";

const ACTIVITY_KINDS = [0, 1, 4];

const LAST_SEEN_TIMEOUT_MS = 4_000;

// Reusable persistent pool to avoid opening/closing WebSocket handshakes on every query
const lastSeenPool = new WsPool();

/**
 * Fetch the latest activity timestamp for a pubkey directly from relays.
 * Does not cache or store the result.
 *
 * @param {string} pubkeyHex
 * @param {string[]} [relays]
 * @returns {Promise<number|null>} Unix timestamp in seconds, or null
 */
export async function fetchLastSeenTimestamp(pubkeyHex, relays) {
  const pk = String(pubkeyHex || "").trim();
  if (!pk) return null;

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
        limit: 1,
      },
      { maxWait: LAST_SEEN_TIMEOUT_MS },
    );

    if (!events.length) {
      return null;
    }

    // Pick the event with the highest created_at
    const latest = events.reduce((best, e) => (e.created_at > best.created_at ? e : best));
    return latest.created_at || null;
  } catch {
    return null;
  }
}

/**
 * Invalidate helper (no-op now since results are not cached).
 *
 * @param {string} _pubkeyHex
 */
export function invalidateLastSeen(_pubkeyHex) {}

/** Close pool connections if needed. */
export function clearLastSeenCache() {
  try {
    lastSeenPool.close([...lastSeenPool.sockets.keys()]);
  } catch (e) {
    console.warn("Failed to close lastSeenPool connections:", e);
  }
}

export const LAST_SEEN_EMPTY_LABEL = "No recent activity";

/**
 * Format a Unix-second timestamp as a human-readable "time ago" string.
 *
 * Examples: "just now", "2 min ago", "3 h ago", "5 days ago", "2 mo ago"
 *
 * @param {number|null} unixSec  – Unix timestamp in seconds, or null
 * @returns {string}
 */
export function formatTimeAgo(unixSec) {
  if (unixSec == null) return LAST_SEEN_EMPTY_LABEL;
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
