/**
 * Message deadlines, as data rather than as UI.
 *
 * Every message carries its own `expiresAt` (ms since epoch). A conversation
 * timer only decides that deadline once, at send time, so the drop rule is the
 * same on both sides and for messages sent under an older timer.
 */

/** The deadline of a row, or 0 when it has none. */
export function messageExpiresAt(row) {
  const value = Number(row?.expiresAt || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function isMessageExpired(row, nowMs = Date.now()) {
  const deadline = messageExpiresAt(row);
  return deadline > 0 && deadline <= Number(nowMs);
}

/** Split a room's rows into the ones past their deadline and the survivors. */
export function splitExpiredMessages(rows, nowMs = Date.now()) {
  const expired = [];
  const kept = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (isMessageExpired(row, nowMs)) expired.push(row);
    else kept.push(row);
  }
  return { expired, kept };
}

/**
 * Rows to remove now. Everything with a passed deadline, plus one named row
 * whose deadline the caller counted down from: a row cached before deadlines
 * were stamped on messages has no `expiresAt` to compare, so the bubble that
 * showed its countdown supplies it. A future deadline is never dropped.
 */
export function rowsToExpireAt(rows, { messageId = "", deadlineMs = 0, nowMs = Date.now() } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const { expired } = splitExpiredMessages(list, nowMs);
  const target = String(messageId || "");
  const deadline = Number(deadlineMs) || 0;
  if (target && deadline > 0 && deadline <= Number(nowMs)) {
    const row = list.find((entry) => String(entry?.id) === target);
    if (row && !expired.includes(row)) expired.push(row);
  }
  return expired;
}
