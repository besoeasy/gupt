import test from "node:test";
import assert from "node:assert/strict";

const { isMessageExpired, messageExpiresAt, rowsToExpireAt, splitExpiredMessages } =
  await import("../src/lib/messageExpiry.js");

const NOW = 1_700_000_000_000;

test("a row is expired only once its own deadline has passed", () => {
  assert.equal(messageExpiresAt({ expiresAt: NOW }), NOW);
  assert.equal(isMessageExpired({ expiresAt: NOW - 1 }, NOW), true);
  assert.equal(isMessageExpired({ expiresAt: NOW }, NOW), true);
  assert.equal(isMessageExpired({ expiresAt: NOW + 1 }, NOW), false);
});

test("rows without a deadline never expire", () => {
  assert.equal(messageExpiresAt({}), 0);
  assert.equal(messageExpiresAt({ expiresAt: 0 }), 0);
  assert.equal(messageExpiresAt({ expiresAt: "nope" }), 0);
  assert.equal(messageExpiresAt({ expiresAt: -5 }), 0);
  assert.equal(messageExpiresAt(null), 0);
  assert.equal(isMessageExpired({}, NOW), false);
  assert.equal(isMessageExpired({ expiresAt: 0 }, NOW), false);
});

test("splitting keeps survivors in order and collects every expired row", () => {
  const rows = [
    { id: "a", expiresAt: NOW - 20_000 },
    { id: "b" },
    { id: "c", expiresAt: NOW + 60_000 },
    { id: "d", expiresAt: NOW - 1 },
  ];
  const { expired, kept } = splitExpiredMessages(rows, NOW);
  assert.deepEqual(
    expired.map((row) => row.id),
    ["a", "d"],
  );
  assert.deepEqual(
    kept.map((row) => row.id),
    ["b", "c"],
  );
});

test("splitting tolerates an empty or missing list", () => {
  assert.deepEqual(splitExpiredMessages([], NOW), { expired: [], kept: [] });
  assert.deepEqual(splitExpiredMessages(null, NOW), { expired: [], kept: [] });
  assert.deepEqual(splitExpiredMessages(undefined, NOW), { expired: [], kept: [] });
});

test("the split uses the clock it is given", () => {
  const rows = [{ id: "a", expiresAt: NOW + 5_000 }];
  assert.equal(splitExpiredMessages(rows, NOW).expired.length, 0);
  assert.equal(splitExpiredMessages(rows, NOW + 5_000).expired.length, 1);
});

test("a named row is dropped once the deadline it counted down has passed", () => {
  const rows = [
    { id: "stamped", expiresAt: NOW - 1 },
    { id: "derived" },
    { id: "future", expiresAt: NOW + 60_000 },
  ];
  const expired = rowsToExpireAt(rows, {
    messageId: "derived",
    deadlineMs: NOW,
    nowMs: NOW,
  });
  assert.deepEqual(
    expired.map((row) => row.id),
    ["stamped", "derived"],
  );
});

test("a named row is kept while its deadline is still ahead", () => {
  const rows = [{ id: "derived" }];
  assert.equal(
    rowsToExpireAt(rows, { messageId: "derived", deadlineMs: NOW + 1, nowMs: NOW }).length,
    0,
  );
  // Without a deadline there is nothing to verify, so nothing is dropped.
  assert.equal(rowsToExpireAt(rows, { messageId: "derived", nowMs: NOW }).length, 0);
  assert.equal(rowsToExpireAt(rows, { messageId: "", deadlineMs: NOW, nowMs: NOW }).length, 0);
  assert.equal(
    rowsToExpireAt(rows, { messageId: "missing", deadlineMs: NOW, nowMs: NOW }).length,
    0,
  );
});
