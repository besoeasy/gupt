import test from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = (() => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
})();

const {
  CHAT_TIMER_DEFAULT_SEC,
  CHAT_TIMER_MIN_SEC,
  CHAT_TIMER_PRESETS,
  chatTimerLabel,
  isNewerChatTimer,
  latestChatTimer,
  normalizeChatTtlSec,
  parseChatTimerRow,
  readChatTtlSec,
  readStoredChatTimer,
  writeStoredChatTimer,
} = await import("../src/lib/chatTimer.js");
const { normalizeRoomMeta } = await import("../src/lib/idb.js");

test("chat timer presets cover 1 minute to 366 days", () => {
  assert.equal(CHAT_TIMER_MIN_SEC, 60);
  assert.equal(CHAT_TIMER_DEFAULT_SEC, 366 * 24 * 60 * 60);
  assert.deepEqual(
    CHAT_TIMER_PRESETS.map((preset) => preset.sec),
    [60, 300, 3600, 86400, 604800, 2592000, 31622400],
  );
  assert.equal(chatTimerLabel(60), "1m");
  assert.equal(chatTimerLabel(3600), "1h");
  assert.equal(chatTimerLabel(CHAT_TIMER_DEFAULT_SEC, { long: true }), "366 days");
});

test("custom values are clamped inside the relay TTL window", () => {
  assert.equal(normalizeChatTtlSec(1), 60);
  assert.equal(normalizeChatTtlSec(90), 90);
  assert.equal(normalizeChatTtlSec(CHAT_TIMER_DEFAULT_SEC * 2), CHAT_TIMER_DEFAULT_SEC);
  assert.equal(normalizeChatTtlSec(""), CHAT_TIMER_DEFAULT_SEC);
  assert.equal(normalizeChatTtlSec(0), CHAT_TIMER_DEFAULT_SEC);
});

test("latest timer wins, with the event id breaking timestamp ties", () => {
  const older = { ttlSec: 60, updatedAt: 1_000, eventId: "aa" };
  const newer = { ttlSec: 3600, updatedAt: 2_000, eventId: "bb" };
  assert.equal(isNewerChatTimer(newer, older), true);
  assert.equal(isNewerChatTimer(older, newer), false);
  assert.equal(
    isNewerChatTimer(
      { ttlSec: 60, updatedAt: 2_000, eventId: "cc" },
      { ttlSec: 3600, updatedAt: 2_000, eventId: "bb" },
    ),
    true,
  );
  assert.equal(isNewerChatTimer(older, null), true);
  assert.equal(isNewerChatTimer(null, older), false);
});

test("parseChatTimerRow rejects non-timer and invalid rows", () => {
  assert.equal(parseChatTimerRow({ type: "text", ttlSec: 60, ts: 1 }), null);
  assert.equal(parseChatTimerRow({ type: "chat-timer", ttlSec: 0, ts: 1 }), null);
  assert.equal(parseChatTimerRow({ type: "chat-timer", ttlSec: 60, ts: 0 }), null);
  assert.deepEqual(parseChatTimerRow({ type: "chat-timer", ttlSec: 30, ts: 10, id: "e" }), {
    ttlSec: 60,
    updatedAt: 10,
    eventId: "e",
  });
});

test("latestChatTimer picks the newest control event from a history", () => {
  const rows = [
    { type: "chat-timer", ttlSec: 3600, ts: 100, id: "a" },
    { type: "text", text: "hi", ts: 200 },
    { type: "chat-timer", ttlSec: 60, ts: 300, id: "c" },
  ];
  assert.deepEqual(latestChatTimer(rows), { ttlSec: 60, updatedAt: 300, eventId: "c" });
  assert.equal(latestChatTimer([{ type: "text", ts: 1 }]), null);
});

test("stored timer round-trips per room and defaults otherwise", () => {
  const roomId = "room-1";
  assert.equal(readChatTtlSec(roomId), CHAT_TIMER_DEFAULT_SEC);
  writeStoredChatTimer(roomId, { ttlSec: 300, updatedAt: 5, eventId: "x" });
  assert.deepEqual(readStoredChatTimer(roomId), { ttlSec: 300, updatedAt: 5, eventId: "x" });
  assert.equal(readChatTtlSec(roomId), 300);
  assert.equal(readChatTtlSec("room-2"), CHAT_TIMER_DEFAULT_SEC);
});

test("resetPreview clears an expired room's list row", () => {
  const now = Date.now();
  const stored = normalizeRoomMeta("r1", {
    lastMessageTs: now - 1000,
    lastMessageText: "expired",
    lastMessageMine: false,
    unreadCount: 3,
    lastSeenTs: now - 5000,
  });
  const cleared = normalizeRoomMeta(
    "r1",
    {
      lastMessageTs: 0,
      lastMessageText: "",
      lastMessageMine: false,
      unreadCount: 0,
      resetPreview: true,
    },
    stored,
  );
  assert.equal(cleared.lastMessageText, "");
  assert.equal(cleared.lastMessageTs, 0);
  assert.equal(cleared.unreadCount, 0);
  assert.ok(cleared.expiresAt > Date.now());
});
