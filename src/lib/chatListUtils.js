const CHAT_ROW_TYPES = new Set([
  "text",
  "voice",
  "media",
  "like",
  "react",
  "edit",
  "call-event",
  "call-request",
]);

export function tsOf(row) {
  return Number(row?.ts || row?.created_at || 0);
}

export function isCountableChatRow(row) {
  return CHAT_ROW_TYPES.has(row?.type);
}

export function formatDateLabel(dateMs) {
  const d = new Date(dateMs);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const _sepCache = new Map();

export function withDateSeparators(messages) {
  const result = [];
  let lastLabel = "";
  for (const msg of messages) {
    const ts = tsOf(msg);
    if (ts) {
      const label = formatDateLabel(ts);
      if (label !== lastLabel) {
        const id = `sep-${label}-${ts}`;
        let sep = _sepCache.get(id);
        if (!sep) {
          sep = { __dateSeparator: true, label, id };
          _sepCache.set(id, sep);
        }
        result.push(sep);
        lastLabel = label;
      }
    }
    result.push(msg);
  }
  return result;
}

export function countUnreadMessages(messages, seenTs, fallback = 0) {
  if (!Array.isArray(messages) || !messages.length) return fallback;
  const count = messages.filter(
    (row) => !row.mine && isCountableChatRow(row) && tsOf(row) > seenTs,
  ).length;
  return count > 0 ? count : fallback;
}

const RECEIPT_CHAT_TYPES = new Set(["text", "voice", "media", "call-event", "call-request"]);

export function latestVisibleChatTs(messages) {
  let max = 0;
  for (const row of messages || []) {
    if (!RECEIPT_CHAT_TYPES.has(row?.type)) continue;
    const ts = tsOf(row);
    if (ts > max) max = ts;
  }
  return max;
}

export function collectMemberReadWatermarks(rows, selfPubkey) {
  const map = new Map();
  const self = String(selfPubkey || "");
  for (const row of rows || []) {
    if (row?.type !== "read") continue;
    const sender = String(row.sender || "");
    if (!sender || (self && sender === self)) continue;
    const ts = Number(row.lastReadTs || row.ts || row.created_at || 0);
    if (!ts) continue;
    if (ts > (map.get(sender) || 0)) map.set(sender, ts);
  }
  return map;
}

export function collectMemberSeenAt(rows, selfPubkey) {
  const map = new Map();
  const self = String(selfPubkey || "");
  for (const row of rows || []) {
    if (row?.type !== "read") continue;
    const sender = String(row.sender || "");
    if (!sender || (self && sender === self)) continue;
    const seenAt = Number(row.ts || row.created_at || 0);
    if (!seenAt) continue;
    if (seenAt > (map.get(sender) || 0)) map.set(sender, seenAt);
  }
  return map;
}

export function groupReadReceiptState(
  msg,
  memberReadTs,
  members,
  selfPubkey,
  nameOf,
  selfHasRead = false,
) {
  if (!msg) return null;
  const msgTs = tsOf(msg);
  const self = String(selfPubkey || "");
  const sender = String(msg.sender || (msg.mine ? self : ""));
  const readers = (members || []).filter((pk) => pk && pk !== sender);
  if (!readers.length) return null;

  const readBy = readers.filter((pk) => {
    if (self && pk === self) return Boolean(selfHasRead);
    return (memberReadTs?.get(pk) || 0) >= msgTs;
  });
  const unreadBy = readers.filter((pk) => !readBy.includes(pk));
  const label = (pk) => {
    if (pk === self) return "You";
    return typeof nameOf === "function" ? nameOf(pk) : pk;
  };
  const readByAll = readBy.length >= readers.length;
  return {
    readBy,
    readByNames: readBy.map(label),
    unreadByNames: unreadBy.map(label),
    readByAll,
    readByPeer: Boolean(msg.mine && readByAll),
  };
}

export function formatSeenByTitle(readByNames, readByAll) {
  const names = Array.isArray(readByNames) ? readByNames.filter(Boolean) : [];
  if (!names.length) return "";
  if (readByAll) return names.length === 1 ? `Seen by ${names[0]}` : "Seen by everyone";
  if (names.length <= 3) return `Seen by ${names.join(", ")}`;
  return `Seen by ${names.length} people`;
}

export function estimateMessageRowSize(item) {
  if (item?.__dateSeparator) return 36;
  if (item?.type === "call-event") return 36;
  if (item?.type === "call-request") return 100;
  if (item?.type === "media") return 210;
  if (item?.type === "voice") return 68;
  const textLen = String(item?.text || "").length;
  if (textLen > 180) return 110;
  if (textLen > 80) return 80;
  return 52;
}
