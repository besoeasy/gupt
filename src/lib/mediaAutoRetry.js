/**
 * Automatic retry policy for attachments that failed to decrypt or download.
 *
 * A failed attachment used to sit there with a manual Retry button, which is
 * easy to miss when the chat is already open. While the attachment is on
 * screen, retry it quietly on a fixed interval instead; stop once it works,
 * once it scrolls away, or after a bounded number of attempts so a dead
 * attachment cannot hammer the relays forever.
 */

export const MEDIA_AUTO_RETRY_MS = 8_000;
export const MEDIA_AUTO_RETRY_MAX = 6;

export function shouldAutoRetry({
  visible,
  failed,
  inFlight,
  online = true,
  attempts = 0,
  maxAttempts = MEDIA_AUTO_RETRY_MAX,
} = {}) {
  if (!visible || !failed || inFlight) return false;
  if (!online) return false;
  return Number(attempts) < maxAttempts;
}
