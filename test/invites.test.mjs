/**
 * Unit tests for the invite module's pure logic.
 *
 * Self-contained — no imports from the app source, because invites.js chains
 * to idb.js and the relay pool which use Vite's @/ alias (not resolvable in
 * Node). The constants and predicates tested here are copied from the source
 * to verify correctness of the algorithm, not the wiring.
 */

import test from "node:test";
import assert from "node:assert/strict";

const INVITE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const INVITE_TOKEN_LENGTH = 12;
const TOKEN_RE = /^[A-Za-z0-9]{8,24}$/;
const REVOKE_TAG = "gupt_invite_revoked";

function generateInviteToken(length = INVITE_TOKEN_LENGTH) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let token = "";
  for (const b of bytes) token += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
  return token;
}

function formatInviteExpiry(expiresAtSec) {
  if (!expiresAtSec) return "never";
  const ms = expiresAtSec * 1000;
  const diff = ms - Date.now();
  if (diff <= 0) return "expired";

  const hours = Math.round(diff / 1000 / 3600);
  if (hours > 24) {
    return `${Math.round(hours / 24)} days`;
  }
  return `${Math.max(1, hours)} hours`;
}

function selectNewestInvite(events, nowSec) {
  return (
    (events || [])
      .filter((e) => !e.tags?.some((t) => t[0] === "expiration" && Number(t[1]) < nowSec))
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0] ?? null
  );
}

function isRevoked(event) {
  return event?.tags?.some((t) => t[0] === REVOKE_TAG) ?? false;
}

function makeEvent(createdAt, expiresAt, revoked = false) {
  const tags = [];
  if (expiresAt != null) tags.push(["expiration", String(expiresAt)]);
  if (revoked) tags.push([REVOKE_TAG, ""]);
  return { id: `e-${createdAt}`, created_at: createdAt, tags };
}

test("invite tokens are 12 alphanumeric characters", () => {
  for (let i = 0; i < 50; i++) {
    const token = generateInviteToken();
    assert.equal(token.length, 12);
    assert.match(token, TOKEN_RE);
  }
});

test("formatInviteExpiry renders the three states", () => {
  assert.equal(formatInviteExpiry(null), "never");
  assert.equal(formatInviteExpiry(0), "never");
  assert.equal(formatInviteExpiry(Math.floor(Date.now() / 1000) - 10), "expired");

  const inTwoDays = Math.floor(Date.now() / 1000) + 48 * 3600;
  assert.equal(formatInviteExpiry(inTwoDays), "2 days");
  const inFiveHours = Math.floor(Date.now() / 1000) + 5 * 3600;
  assert.equal(formatInviteExpiry(inFiveHours), "5 hours");
});

test("selectNewestInvite skips expired events", () => {
  const now = 1000;
  const expired = makeEvent(100, 500);
  const live = makeEvent(900, 2000);
  assert.equal(selectNewestInvite([expired, live], now), live);
  assert.equal(selectNewestInvite([expired], now), null);
});

test("selectNewestInvite picks the newest live event regardless of order", () => {
  const now = 1000;
  const oldLive = makeEvent(800, 2000);
  const newLive = makeEvent(950, 2000);
  assert.equal(selectNewestInvite([oldLive, newLive], now), newLive);
  assert.equal(selectNewestInvite([newLive, oldLive], now), newLive);
});

test("selectNewestInvite treats missing expiration as live", () => {
  const now = 1000;
  const event = selectNewestInvite([makeEvent(900)], now);
  assert.equal(event.id, "e-900");
  assert.equal(event.created_at, 900);
  assert.deepEqual(event.tags, []);
});

test("a revocation tombstone published after the invite makes it unusable", () => {
  const now = 1000;
  const invite = makeEvent(500, 2000);
  const tombstone = makeEvent(900, 2000, true);
  const newest = selectNewestInvite([invite, tombstone], now);
  assert.equal(newest, tombstone);
  assert.equal(isRevoked(newest), true);
});

test("a revocation tombstone published before the invite is ignored", () => {
  const now = 1000;
  const oldTombstone = makeEvent(400, 2000, true);
  const newerInvite = makeEvent(800, 2000);
  const newest = selectNewestInvite([oldTombstone, newerInvite], now);
  assert.equal(newest, newerInvite);
  assert.equal(isRevoked(newest), false);
});
