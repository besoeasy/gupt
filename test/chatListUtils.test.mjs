/**
 * Unit tests for chat list helpers, including group read watermarks.
 *
 *   node --test test/chatListUtils.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isCountableChatRow,
  latestVisibleChatTs,
  collectMemberReadWatermarks,
  collectMemberSeenAt,
  groupReadReceiptState,
  formatSeenByTitle,
} from "../src/lib/chatListUtils.js";

const SELF = "aa";
const BOB = "bb";
const CAROL = "cc";
const MEMBERS = [SELF, BOB, CAROL];

test("isCountableChatRow excludes read receipts", () => {
  assert.equal(isCountableChatRow({ type: "read" }), false);
  assert.equal(isCountableChatRow({ type: "text" }), true);
});

test("latestVisibleChatTs ignores receipts, reactions, and edits", () => {
  assert.equal(
    latestVisibleChatTs([
      { type: "read", ts: 900 },
      { type: "react", ts: 800 },
      { type: "text", ts: 100 },
      { type: "media", ts: 250 },
    ]),
    250,
  );
  assert.equal(latestVisibleChatTs([]), 0);
});

test("collectMemberReadWatermarks keeps the latest lastReadTs per other member", () => {
  const map = collectMemberReadWatermarks(
    [
      { type: "read", sender: BOB, lastReadTs: 100 },
      { type: "read", sender: BOB, lastReadTs: 300 },
      { type: "read", sender: CAROL, ts: 200 },
      { type: "read", sender: SELF, lastReadTs: 999 },
      { type: "text", sender: BOB, ts: 50 },
    ],
    SELF,
  );
  assert.equal(map.get(BOB), 300);
  assert.equal(map.get(CAROL), 200);
  assert.equal(map.has(SELF), false);
});

test("collectMemberSeenAt uses receipt send time, not the watermark", () => {
  const map = collectMemberSeenAt(
    [
      { type: "read", sender: BOB, lastReadTs: 100, ts: 900 },
      { type: "read", sender: CAROL, lastReadTs: 50, ts: 400 },
      { type: "read", sender: SELF, ts: 999 },
    ],
    SELF,
  );
  assert.equal(map.get(BOB), 900);
  assert.equal(map.get(CAROL), 400);
  assert.equal(map.has(SELF), false);
});

test("groupReadReceiptState is none / some / all relative to message ts", () => {
  const watermarks = new Map([
    [BOB, 200],
    [CAROL, 50],
  ]);
  const names = { [BOB]: "Bob", [CAROL]: "Carol" };
  const nameOf = (pk) => names[pk] || pk;

  const none = groupReadReceiptState({ mine: true, ts: 400 }, watermarks, MEMBERS, SELF, nameOf);
  assert.deepEqual(none.readBy, []);
  assert.equal(none.readByAll, false);
  assert.equal(none.readByPeer, false);

  const some = groupReadReceiptState({ mine: true, ts: 150 }, watermarks, MEMBERS, SELF, nameOf);
  assert.deepEqual(some.readBy, [BOB]);
  assert.deepEqual(some.readByNames, ["Bob"]);
  assert.deepEqual(some.unreadByNames, ["Carol"]);
  assert.equal(some.readByAll, false);

  const all = groupReadReceiptState({ mine: true, ts: 40 }, watermarks, MEMBERS, SELF, nameOf);
  assert.deepEqual(all.readBy, [BOB, CAROL]);
  assert.equal(all.readByAll, true);
  assert.equal(all.readByPeer, true);
});

test("groupReadReceiptState attaches seen-by on others' messages too", () => {
  const names = { [BOB]: "Bob", [CAROL]: "Carol" };
  const nameOf = (pk) => names[pk] || pk;
  const incoming = groupReadReceiptState(
    { mine: false, ts: 10, sender: BOB },
    new Map([[CAROL, 999]]),
    MEMBERS,
    SELF,
    nameOf,
    true,
  );
  assert.deepEqual(incoming.readBy, [SELF, CAROL]);
  assert.deepEqual(incoming.readByNames, ["You", "Carol"]);
  assert.equal(incoming.readByAll, true);
  assert.equal(incoming.readByPeer, false);

  const waiting = groupReadReceiptState(
    { mine: false, ts: 10, sender: BOB },
    new Map(),
    MEMBERS,
    SELF,
    nameOf,
    true,
  );
  assert.deepEqual(waiting.readByNames, ["You"]);
  assert.deepEqual(waiting.unreadByNames, ["Carol"]);
  assert.equal(waiting.readByAll, false);
});

test("formatSeenByTitle covers none / some / all", () => {
  assert.equal(formatSeenByTitle([], false), "");
  assert.equal(formatSeenByTitle(["Bob"], false), "Seen by Bob");
  assert.equal(formatSeenByTitle(["Bob", "Carol"], false), "Seen by Bob, Carol");
  assert.equal(formatSeenByTitle(["Bob", "Carol"], true), "Seen by everyone");
  assert.equal(formatSeenByTitle(["A", "B", "C", "D"], false), "Seen by 4 people");
});
