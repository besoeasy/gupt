import test from "node:test";
import assert from "node:assert/strict";

import {
  RECEIPT_COLLECTION,
  RECEIPT_MIN_TTL_SEC,
  RECEIPT_TTL_SEC,
  receiptExpiresAtSec,
  receiptWindowOpen,
} from "../src/lib/receipts.js";
import { isGroupCopyEvent } from "../src/lib/groupIdentity.js";
import { groupReadReceiptState } from "../src/lib/chatListUtils.js";

const DAY = 24 * 60 * 60;
const NOW_SEC = 1_800_000_000;
const NOW_MS = NOW_SEC * 1000;
const SELF = "11".repeat(32);
const PEER = "22".repeat(32);
const THIRD = "33".repeat(32);

function groupEnvelope({ labels = [SELF, PEER], copies = labels.length, v = 2 } = {}) {
  return {
    collection: RECEIPT_COLLECTION,
    labels,
    data: { v, copies: Array.from({ length: copies }, () => ({ nonce: "aa", ciphertext: "bb" })) },
  };
}

test("a receipt lives 30 days, capped by the room timer", () => {
  assert.equal(receiptExpiresAtSec(NOW_SEC), NOW_SEC + RECEIPT_TTL_SEC);
  assert.equal(receiptExpiresAtSec(NOW_SEC, 0), NOW_SEC + RECEIPT_TTL_SEC);
  assert.equal(receiptExpiresAtSec(NOW_SEC, 60 * 60), NOW_SEC + 60 * 60);
  assert.equal(receiptExpiresAtSec(NOW_SEC, 366 * DAY), NOW_SEC + RECEIPT_TTL_SEC);
});

test("the relay floor keeps a 1-minute conversation above 60 seconds", () => {
  assert.equal(receiptExpiresAtSec(NOW_SEC, 60), NOW_SEC + RECEIPT_MIN_TTL_SEC);
  assert.equal(receiptExpiresAtSec(NOW_SEC, 1), NOW_SEC + RECEIPT_MIN_TTL_SEC);
  assert.ok(receiptExpiresAtSec(NOW_SEC, 60) - NOW_SEC > 60);
});

test("the receipt window closes exactly at 30 days", () => {
  assert.equal(receiptWindowOpen(NOW_MS, NOW_MS), true);
  assert.equal(receiptWindowOpen(NOW_MS - RECEIPT_TTL_SEC * 1000, NOW_MS), true);
  assert.equal(receiptWindowOpen(NOW_MS - RECEIPT_TTL_SEC * 1000 - 1, NOW_MS), false);
});

test("only a v2 envelope with aligned copies is a group receipt", () => {
  assert.equal(isGroupCopyEvent(groupEnvelope()), true);
  assert.equal(isGroupCopyEvent(groupEnvelope({ labels: [SELF, PEER, THIRD], copies: 3 })), true);
});

test("a DM receipt and a malformed envelope are not group shaped", () => {
  assert.equal(
    isGroupCopyEvent({
      collection: RECEIPT_COLLECTION,
      labels: [RECEIPT_COLLECTION, PEER],
      data: { v: 1, nonce: "aa", ciphertext: "bb" },
    }),
    false,
  );
  assert.equal(isGroupCopyEvent(groupEnvelope({ copies: 1 })), false);
  assert.equal(isGroupCopyEvent(groupEnvelope({ v: 1 })), false);
  assert.equal(isGroupCopyEvent(groupEnvelope({ labels: [SELF, PEER, THIRD], copies: 2 })), false);
});

test("an old message with no live receipt reports no record, not unread", () => {
  const state = groupReadReceiptState(
    { mine: true, sender: SELF, ts: NOW_MS - 40 * DAY * 1000 },
    new Map(),
    [SELF, PEER],
    SELF,
    () => "Peer",
    true,
    NOW_MS,
  );
  assert.deepEqual(state.readByNames, []);
  assert.deepEqual(state.unreadByNames, []);
  assert.deepEqual(state.unknownByNames, ["Peer"]);
  assert.equal(state.hasUnknown, true);
});

test("inside the window a missing receipt still means unread", () => {
  const state = groupReadReceiptState(
    { mine: true, sender: SELF, ts: NOW_MS - 60 * 60 * 1000 },
    new Map(),
    [SELF, PEER],
    SELF,
    () => "Peer",
    true,
    NOW_MS,
  );
  assert.deepEqual(state.unreadByNames, ["Peer"]);
  assert.deepEqual(state.unknownByNames, []);
  assert.equal(state.hasUnknown, false);
});

test("a live watermark proves a read even for an old message", () => {
  const state = groupReadReceiptState(
    { mine: true, sender: SELF, ts: NOW_MS - 40 * DAY * 1000 },
    new Map([[PEER, NOW_MS]]),
    [SELF, PEER],
    SELF,
    () => "Peer",
    true,
    NOW_MS,
  );
  assert.deepEqual(state.readByNames, ["Peer"]);
  assert.equal(state.readByAll, true);
  assert.deepEqual(state.unknownByNames, []);
});
