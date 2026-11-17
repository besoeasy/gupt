import { RETENTION_DAYS } from "../config/retention.js";

/**
 * Per-conversation message lifetime ("message timer") for private DMs.
 *
 * The setting is shared with the other party as a `chat-timer` DM event: the
 * newest event wins, and if none exists both sides use the app default. The
 * value itself only affects events sent after it changes; a message's own
 * `expires_at` stays fixed forever.
 */

export const CHAT_TIMER_EVENT_TYPE = "chat-timer";
export const CHAT_TIMER_STORAGE_KEY = "gupt_chat_timers_v1";
export const CHAT_TIMER_MIN_SEC = 60;
export const CHAT_TIMER_DEFAULT_SEC = RETENTION_DAYS * 24 * 60 * 60;

export const CHAT_TIMER_PRESETS = [
  { label: "1 minute", short: "1m", sec: 60 },
  { label: "5 minutes", short: "5m", sec: 5 * 60 },
  { label: "1 hour", short: "1h", sec: 60 * 60 },
  { label: "24 hours", short: "24h", sec: 24 * 60 * 60 },
  { label: "7 days", short: "7d", sec: 7 * 24 * 60 * 60 },
  { label: "30 days", short: "30d", sec: 30 * 24 * 60 * 60 },
  { label: "366 days", short: "366d", sec: CHAT_TIMER_DEFAULT_SEC },
];

export function normalizeChatTtlSec(value) {
  const seconds = Math.floor(Number(value) || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return CHAT_TIMER_DEFAULT_SEC;
  return Math.min(CHAT_TIMER_DEFAULT_SEC, Math.max(CHAT_TIMER_MIN_SEC, seconds));
}

export function chatTimerPreset(sec) {
  const value = normalizeChatTtlSec(sec);
  return CHAT_TIMER_PRESETS.find((preset) => preset.sec === value) || null;
}

export function chatTimerLabel(sec, { long = false } = {}) {
  const preset = chatTimerPreset(sec);
  if (preset) return long ? preset.label : preset.short;
  return `${normalizeChatTtlSec(sec)}s`;
}

/** Order two settings: newer timestamp wins, id breaks ties deterministically. */
export function isNewerChatTimer(next, current) {
  if (!next) return false;
  if (!current) return true;
  const nextTs = Number(next.updatedAt || 0);
  const currentTs = Number(current.updatedAt || 0);
  if (nextTs !== currentTs) return nextTs > currentTs;
  return String(next.eventId || "") > String(current.eventId || "");
}

/** Pull a setting out of a decrypted chat row, or null when it is not one. */
export function parseChatTimerRow(row) {
  if (!row || row.type !== CHAT_TIMER_EVENT_TYPE) return null;
  const updatedAt = Number(row.ts || row.created_at || 0);
  const ttlSec = Number(row.ttlSec || 0);
  if (!updatedAt || !Number.isFinite(ttlSec) || ttlSec <= 0) return null;
  return {
    ttlSec: normalizeChatTtlSec(ttlSec),
    updatedAt,
    eventId: String(row.id || ""),
  };
}

/** Newest valid setting among many rows. */
export function latestChatTimer(rows) {
  let best = null;
  for (const row of rows || []) {
    const parsed = parseChatTimerRow(row);
    if (!parsed) continue;
    if (isNewerChatTimer(parsed, best)) best = parsed;
  }
  return best;
}

function readStore() {
  try {
    const raw = globalThis.localStorage?.getItem(CHAT_TIMER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    globalThis.localStorage?.setItem(CHAT_TIMER_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // A full or disabled localStorage only means the timer resets to default.
  }
}

export function readStoredChatTimer(roomId) {
  const id = String(roomId || "");
  if (!id) return null;
  const entry = readStore()[id];
  if (!entry) return null;
  const ttlSec = Number(entry.ttlSec || 0);
  if (!Number.isFinite(ttlSec) || ttlSec <= 0) return null;
  return {
    ttlSec: normalizeChatTtlSec(ttlSec),
    updatedAt: Number(entry.updatedAt || 0),
    eventId: String(entry.eventId || ""),
  };
}

export function writeStoredChatTimer(roomId, setting) {
  const id = String(roomId || "");
  if (!id || !setting) return;
  const store = readStore();
  store[id] = {
    ttlSec: normalizeChatTtlSec(setting.ttlSec),
    updatedAt: Number(setting.updatedAt || 0),
    eventId: String(setting.eventId || ""),
  };
  writeStore(store);
}

export function readChatTtlSec(roomId) {
  return readStoredChatTimer(roomId)?.ttlSec || CHAT_TIMER_DEFAULT_SEC;
}
