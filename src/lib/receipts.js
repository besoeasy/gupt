// Read receipts live in their own collection so their lifetime is independent
// of the conversation's message retention.
//
// One collection holds both envelope shapes; `data.v` is the discriminator:
//   1 — one encrypted copy for one peer (DM receipt)
//   2 — one encrypted copy per group member, aligned with the signed labels
//
// A group receipt is always a watermark (`lastReadTs`), never one event per
// message. Because a watermark expires too, an old message with no receipt is
// "no record", not "has not read" — see receiptWindowOpen().

export const RECEIPT_COLLECTION = "gupt/chat/receipts";
export const RECEIPT_TYPE = "read";
export const RECEIPT_TTL_SEC = 30 * 24 * 60 * 60;
export const RECEIPT_TTL_MS = RECEIPT_TTL_SEC * 1000;
// Relays reject a TTL of 60 seconds or less; keep one second of headroom.
export const RECEIPT_MIN_TTL_SEC = 61;

/**
 * Deadline for a receipt event. A DM receipt also follows its room's timer, so
 * a 1-hour conversation does not leave 30-day receipts behind. A group receipt
 * is always just the cap.
 */
export function receiptExpiresAtSec(nowSec, roomTtlSec = 0) {
  const now = Math.floor(Number(nowSec) || 0);
  const room = Number(roomTtlSec) || 0;
  const cap = room > 0 ? Math.min(RECEIPT_TTL_SEC, room) : RECEIPT_TTL_SEC;
  return now + Math.max(RECEIPT_MIN_TTL_SEC, Math.floor(cap));
}

/**
 * Whether receipt evidence for a message is still inside the window. Once it
 * closes, a member without a watermark has no record — not an unread message.
 */
export function receiptWindowOpen(msgTs, nowMs = Date.now()) {
  return Number(msgTs || 0) >= Number(nowMs) - RECEIPT_TTL_MS;
}
