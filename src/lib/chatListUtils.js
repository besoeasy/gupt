const CHAT_ROW_TYPES = new Set(["text", "voice", "media", "media-legacy", "like", "react", "edit", "call-event"]);

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

export function withDateSeparators(messages) {
  const result = [];
  let lastLabel = "";
  for (const msg of messages) {
    const ts = tsOf(msg);
    if (ts) {
      const label = formatDateLabel(ts);
      if (label !== lastLabel) {
        result.push({ __dateSeparator: true, label, id: `sep-${label}-${ts}` });
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

export function estimateMessageRowSize(item) {
  if (item?.__dateSeparator) return 44;
  if (item?.type === "call-event") return 40;
  if (item?.type === "media" || item?.type === "media-legacy") return 220;
  if (item?.type === "voice") return 72;
  const textLen = String(item?.text || "").length;
  if (textLen > 180) return 120;
  if (textLen > 80) return 88;
  return 64;
}
