export const LIVE_DM_LOOKBACK_MS = 120_000;

/**
 * `since` for the live DM subscription. Overlaps lookbackMs so a reconnect
 * still sees events that arrived while the socket was down.
 * When lastEventMs is unset, look back from now.
 */
export function liveDmSinceMs(lastEventMs, now = Date.now(), lookbackMs = LIVE_DM_LOOKBACK_MS) {
  const ts = Number(lastEventMs);
  const marked = Number.isFinite(ts) && ts > 0 ? ts : now;
  return Math.max(0, Math.min(marked, now) - lookbackMs);
}
