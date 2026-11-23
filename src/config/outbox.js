// Durable outbox retry policy. Kept in one place because both the IndexedDB
// queue (src/lib/idb.js) and the replication engine (src/lib/engine/core.js)
// must agree on when a row is merely retrying and when it is terminal.
//
// The foreground send path stops waiting long before this: a message shows
// "failed" after SEND_VISIBLE_TIMEOUT_MS, while the outbox keeps retrying in
// the background so a relay that comes back later can still upgrade it to sent.
export const OUTBOX_TERMINAL_ATTEMPTS = 100;
export const OUTBOX_RETRY_BASE_MS = 30_000;
export const OUTBOX_RETRY_MAX_MS = 10 * 60_000;

export function outboxRetryDelayMs(attempts) {
  const count = Math.max(0, Math.floor(Number(attempts) || 0));
  return Math.min(OUTBOX_RETRY_MAX_MS, OUTBOX_RETRY_BASE_MS * 2 ** Math.min(count, 5));
}
