/**
 * Countdown helpers for messages that carry their own deadline.
 *
 * A chat timer makes every message disappear at a known moment. Showing that
 * moment on the message itself keeps a short timer honest: the sender can see
 * how long the other side still has it.
 */

/** Show the ring only in a message's final day, so long timers stay quiet. */
export const EXPIRY_COUNTDOWN_MAX_MS = 24 * 60 * 60 * 1000;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

/** "42s" → "12m" → "3h" → "5d", rounded up so it never reads 0 while alive. */
export function formatExpiryCountdown(remainingMs) {
  const seconds = Math.ceil(Math.max(0, Number(remainingMs) || 0) / 1000);
  if (seconds >= DAY_S) return `${Math.ceil(seconds / DAY_S)}d`;
  if (seconds >= HOUR_S) return `${Math.ceil(seconds / HOUR_S)}h`;
  if (seconds >= MINUTE_S) return `${Math.ceil(seconds / MINUTE_S)}m`;
  return `${seconds}s`;
}

/** How close a message is to disappearing: styles the ring. */
export function expiryUrgency(remainingMs) {
  const ms = Number(remainingMs) || 0;
  if (ms <= 60 * 1000) return "critical";
  if (ms <= 60 * MINUTE_MS) return "soon";
  return "calm";
}

/** Ring fill: 1 at the start of the countdown window, 0 at the deadline. */
export function expiryProgress({
  expiresAt,
  startedAt,
  now = Date.now(),
  maxWindowMs = EXPIRY_COUNTDOWN_MAX_MS,
}) {
  const end = Number(expiresAt) || 0;
  if (!end) return 0;
  const remaining = end - now;
  if (remaining <= 0) return 0;
  // The ring drains over the final day, not over a 366-day lifetime, so a long
  // timer still reads as a full ring when its countdown appears.
  const lifetime = Math.max(end - (Number(startedAt) || 0), 1);
  const windowMs = Math.max(1, Math.min(lifetime, maxWindowMs));
  return Math.min(1, remaining / windowMs);
}

export function shouldShowExpiryCountdown({
  expiresAt,
  now = Date.now(),
  maxMs = EXPIRY_COUNTDOWN_MAX_MS,
} = {}) {
  const end = Number(expiresAt) || 0;
  if (!end) return false;
  const remaining = end - now;
  return remaining > 0 && remaining <= maxMs;
}
