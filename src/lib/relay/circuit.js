// Relay circuit breaker: a relay that does not answer within
// RELAY_RESPONSE_TIMEOUT_MS (3s) is considered dead for RELAY_DEAD_TTL_MS
// (300s). Every fan-out filters dead relays first, so one stalled node can
// never hold back a pull, push, query or publish aimed at the healthy ones.
//
// State is an in-memory Map (per realm: main thread and worker each track
// their own observations). Relay stats in IndexedDB stay the long-term memory;
// this is only the fast "stop hitting it" switch.
//
// Rule for noteRelayOutcome():
// - any HTTP response (even 5xx/429) proves the relay is up -> alive,
//   unless it took longer than the response window -> dead anyway;
// - transport failures (timeout, abort, network error) -> dead;
// - successes within the window -> alive.
export const RELAY_RESPONSE_TIMEOUT_MS = 3_000;
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
 * list: trying (with a 3s cap each) beats giving up entirely, and a success
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
export function noteRelayOutcome(relay, { ok = false, latencyMs = 0, error = null } = {}, now) {
  const key = normalizeCircuitRelay(relay);
  if (!key) return false;
  const latency = Math.max(0, Number(latencyMs) || 0);

  // Slow is dead: a relay that needs longer than the response window holds
  // back every pull/push cycle even when it eventually answers.
  if (latency > RELAY_RESPONSE_TIMEOUT_MS) {
    markRelayDead(key, RELAY_DEAD_TTL_MS, now);
    return true;
  }
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

/** Clamp a control-plane timeout to the response window. */
export function clampRelayTimeoutMs(timeoutMs, fallback = RELAY_RESPONSE_TIMEOUT_MS) {
  const value = Number(timeoutMs);
  const base = Number.isFinite(value) && value > 0 ? value : fallback;
  return Math.min(base, RELAY_RESPONSE_TIMEOUT_MS);
}

export function clearRelayCircuit() {
  deadUntil.clear();
}
