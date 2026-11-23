// Adaptive per-relay budgets. There is no fixed response window anywhere in
// the app: a relay that proved itself slow earns a bigger budget, an unknown
// relay gets the base, and each retry round doubles it up to the ceiling.
// Slowness is never a verdict on its own; the persisted scores rank a slow
// relay down and the next request gives it the larger budget.
export const RELAY_ATTEMPT_BASE_MS = 2000;
export const RELAY_ATTEMPT_MAX_MS = 8000;

/**
 * One relay attempt gets more time as its observed latency grows, then doubles
 * per round. A flat first try is wrong in both directions: it gives the best
 * relay the least time and it punishes a node that is merely slow.
 */
export function relayAttemptTimeoutMs(latencyMs = 0, round = 0) {
  const observed = Math.max(0, Number(latencyMs) || 0);
  const adaptive = Math.max(
    RELAY_ATTEMPT_BASE_MS,
    Math.min(RELAY_ATTEMPT_MAX_MS, observed > 0 ? observed * 3 : 0),
  );
  return Math.min(
    RELAY_ATTEMPT_MAX_MS,
    adaptive * 2 ** Math.max(0, Math.floor(Number(round) || 0)),
  );
}

/** Cap an explicit caller timeout at the adaptive ceiling. */
export function capRelayTimeoutMs(timeoutMs) {
  const value = Number(timeoutMs);
  const base = Number.isFinite(value) && value > 0 ? value : RELAY_ATTEMPT_BASE_MS;
  return Math.min(Math.max(1000, base), RELAY_ATTEMPT_MAX_MS);
}
