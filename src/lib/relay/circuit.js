// Relay circuit breaker: a relay with a recent transport failure (refused,
// unreachable, aborted) is skipped until its TTL expires, so one hard-down
// node never costs a full attempt budget on every cycle. When every relay is
// down the filter falls back to the full list: trying beats giving up, and a
// success revives the relay immediately.
//
// State is an in-memory Map (per realm: main thread and worker each track
// their own observations). Relay stats in IndexedDB stay the long-term memory;
// this is only the fast "stop hitting it" switch.
//
// Rule for noteRelayOutcome():
// - success (any HTTP response, even 5xx/429) -> alive;
// - transport failure (or an empty failure with no detail) -> dead.
// Slowness is never a signal: a slow relay keeps its score-derived budget and
// is ranked down, not cut off.
export const RELAY_DEAD_TTL_MS = 300_000;

const deadUntil = new Map();

export function normalizeCircuitRelay(relay) {
  return String(relay || "")
    .trim()
    .replace(/\/+$/, "");
}

function nowMs(now) {
  return typeof now === "number" && Number.isFinite(now) ? now : Date.now();
}

export function isRelayDead(relay, now) {
  const key = normalizeCircuitRelay(relay);
  if (!key) return false;
  const until = deadUntil.get(key);
  if (!until) return false;
  if (nowMs(now) >= until) {
    deadUntil.delete(key);
    return false;
  }
  return true;
}

export function getRelayDeadUntil(relay) {
  const key = normalizeCircuitRelay(relay);
  return deadUntil.get(key) || 0;
}

export function markRelayDead(relay, ttlMs = RELAY_DEAD_TTL_MS, now) {
  const key = normalizeCircuitRelay(relay);
  if (!key) return 0;
  const ttl = Math.max(0, Number(ttlMs) || RELAY_DEAD_TTL_MS);
  const until = nowMs(now) + ttl;
  deadUntil.set(key, until);
  return until;
}

export function markRelayAlive(relay) {
  deadUntil.delete(normalizeCircuitRelay(relay));
}

/**
 * Drop dead relays from a fan-out. When every relay is dead, return the full
 * list: trying beats giving up entirely, and a success
 * revives the relay immediately.
 */
export function filterLiveRelays(relays, now) {
  const list = (Array.isArray(relays) ? relays : []).filter(Boolean);
  if (!list.length) return [];
  const live = list.filter((relay) => !isRelayDead(relay, now));
  return live.length ? live : [...list];
}

const TRANSPORT_RE =
  /timeout|abort|timed out|network|fetch failed|failed to fetch|econn|enotfound|enotreach|eai_again|socket|offline|unreachable|relay dead|dead until/i;
const HTTP_STATUS_RE = /http\s+\d{3}/i;

export function isTransportError(error) {
  if (!error) return false;
  const msg = String(error?.message || error);
  if (HTTP_STATUS_RE.test(msg)) return false;
  return TRANSPORT_RE.test(msg);
}

/**
 * Feed one relay result into the breaker. `ok` follows the caller's scoring
 * (an HTTP 500 is !ok but still proves the relay answered).
 */
export function noteRelayOutcome(relay, { ok = false, error = null } = {}, now) {
  const key = normalizeCircuitRelay(relay);
  if (!key) return false;
  if (ok) {
    markRelayAlive(key);
    return false;
  }
  if (isTransportError(error) || error == null || error === "") {
    markRelayDead(key, RELAY_DEAD_TTL_MS, now);
    return true;
  }
  // An HTTP error status is still a response: the relay is up.
  markRelayAlive(key);
  return false;
}

export function clearRelayCircuit() {
  deadUntil.clear();
}
