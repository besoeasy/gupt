import test from "node:test";
import assert from "node:assert/strict";

// Minimal localStorage so the cache module can be imported in Node.
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

const { normalizeRoomMeta, normalizeStoredGroup } = await import("../src/lib/idb.js");
const { messagePreview, latestPreviewRow } = await import("../src/lib/chatListUtils.js");

const ROOM_ID = "799a88560f478c104fbfaabbccddeeff";
// Cache TTL is measured from the last message, so tests must use recent stamps.
const BASE = Date.now() - 60_000;

test("normalizeRoomMeta keeps the preview when a peer-only patch arrives", () => {
  const stored = normalizeRoomMeta(ROOM_ID, {
    peerPubkey: "peer",
    type: "dm",
    lastMessageTs: BASE + 1_000,
    lastMessageText: "hello there",
    lastMessageMine: false,
    unreadCount: 2,
    lastSeenTs: BASE - 100,
  });
  const next = normalizeRoomMeta(ROOM_ID, { peerPubkey: "peer" }, stored);

  assert.equal(next.lastMessageText, "hello there");
  assert.equal(next.lastMessageMine, false);
  assert.equal(next.lastMessageTs, BASE + 1_000);
  assert.equal(next.type, "dm");
  assert.equal(next.unreadCount, 2);
  assert.equal(next.lastSeenTs, BASE - 100);
});

test("normalizeRoomMeta accumulates unreadDelta and honors resetUnread", () => {
  const first = normalizeRoomMeta(ROOM_ID, { unreadDelta: 1 });
  assert.equal(first.unreadCount, 1);

  const second = normalizeRoomMeta(ROOM_ID, { unreadDelta: 1 }, first);
  assert.equal(second.unreadCount, 2);

  const reset = normalizeRoomMeta(ROOM_ID, { resetUnread: true }, second);
  assert.equal(reset.unreadCount, 0);
});

test("normalizeRoomMeta does not blank the preview with an empty patch", () => {
  const stored = normalizeRoomMeta(ROOM_ID, {
    lastMessageTs: BASE + 2_000,
    lastMessageText: "keep me",
    lastMessageMine: true,
  });
  const next = normalizeRoomMeta(
    ROOM_ID,
    { lastMessageTs: BASE + 2_000, lastMessageText: "" },
    stored,
  );

  assert.equal(next.lastMessageText, "keep me");
  assert.equal(next.lastMessageMine, true);
});

test("normalizeRoomMeta takes a newer preview and keeps the newer timestamp", () => {
  const stored = normalizeRoomMeta(ROOM_ID, {
    lastMessageTs: BASE + 2_000,
    lastMessageText: "old",
  });
  const next = normalizeRoomMeta(
    ROOM_ID,
    { lastMessageTs: BASE + 3_000, lastMessageText: "new", lastMessageMine: true },
    stored,
  );

  assert.equal(next.lastMessageText, "new");
  assert.equal(next.lastMessageMine, true);
  assert.equal(next.lastMessageTs, BASE + 3_000);
});

test("normalizeStoredGroup keeps unread state across partial patches", () => {
  const stored = normalizeStoredGroup({
    groupId: "g1",
    name: "Trip",
    lastMessageTs: BASE + 5_000,
    unreadDelta: 2,
  });
  assert.equal(stored.unreadCount, 2);
  assert.equal(stored.name, "Trip");

  const next = normalizeStoredGroup({ groupId: "g1", name: "Trip" }, stored);
  assert.equal(next.unreadCount, 2);
  assert.equal(next.lastMessageTs, BASE + 5_000);

  const reset = normalizeStoredGroup({ groupId: "g1", resetUnread: true }, next);
  assert.equal(reset.unreadCount, 0);
});

test("messagePreview renders real content, never an id", () => {
  assert.equal(messagePreview({ type: "text", text: "hi there" }), "hi there");
  assert.equal(messagePreview({ type: "voice" }), "🎤 Voice note");
  assert.equal(messagePreview({ type: "location", label: "Home" }), "📍 Home");
  assert.equal(messagePreview({ type: "media", media: { mime: "image/png" } }), "📷 Photo");
  assert.equal(
    messagePreview({ type: "media", media: { mime: "application/pdf" }, text: "doc.pdf" }),
    "📎 doc.pdf",
  );
  assert.equal(messagePreview({ type: "read" }), "");
  assert.equal(messagePreview({ type: "react" }), "");
  assert.equal(messagePreview(null), "");
});

test("latestPreviewRow skips receipts and picks the newest real message", () => {
  const rows = [
    { id: "1", type: "text", text: "first", ts: 10 },
    { id: "2", type: "read", ts: 20 },
    { id: "3", type: "text", text: "second", ts: 30 },
    { id: "4", type: "edit", ts: 40 },
  ];
  assert.equal(latestPreviewRow(rows).id, "3");
  assert.equal(latestPreviewRow([{ id: "1", type: "read", ts: 10 }]), null);
  assert.equal(latestPreviewRow([]), null);
});

test("latestPreviewRow ignores ephemeral call signalling", () => {
  const rows = [
    { id: "1", type: "text", text: "hey", ts: 10 },
    { id: "2", type: "call-event", text: "Missed call", ts: 20, isEphemeral: true },
  ];
  assert.equal(latestPreviewRow(rows).id, "1");
});
