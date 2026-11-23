// Durable outbox retry policy. Kept in one place because the replication
// engine and the UI both need the same backoff curve.
//
// There is no attempt ceiling: an event retries until its own expiry (or the
// configured retention when it has none), because a relay that comes back
// later must still receive it. The foreground send stops waiting after
// SEND_VISIBLE_TIMEOUT_MS and shows the last relay error while this keeps
// running in the background.
export const OUTBOX_RETRY_BASE_MS = 30_000;
export const OUTBOX_RETRY_MAX_MS = 10 * 60_000;

export function outboxRetryDelayMs(attempts) {
  const count = Math.max(0, Math.floor(Number(attempts) || 0));
  return Math.min(OUTBOX_RETRY_MAX_MS, OUTBOX_RETRY_BASE_MS * 2 ** Math.min(count, 5));
}
