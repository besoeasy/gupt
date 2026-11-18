import test from "node:test";
import assert from "node:assert/strict";

import { finalizeEvent, getPublicKey } from "../src/lib/crypto.js";
import { shouldReplicateEvent } from "../src/lib/rabta/pool.js";
import { callEventRowId, hasOwnCallRow } from "../src/lib/webrtc/utils.js";

const KEY = "33".repeat(32);
const PUBKEY = getPublicKey(KEY);
const DAY = 24 * 60 * 60;
const NOW = 1_800_000_000;

function signal({ createdAt = NOW, expiresAt } = {}) {
  return finalizeEvent(
    {
      collection: "gupt/calls/signal",
      kind: 20004,
      created_at: createdAt,
      ...(expiresAt ? { expires_at: expiresAt } : {}),
      data: { v: 1, nonce: "aa", ciphertext: "bb" },
    },
    KEY,
  );
}

test("call signals never outlive 24 hours", () => {
  const defaulted = signal();
  assert.equal(defaulted.expires_at, NOW + DAY);

  const clamped = signal({ expiresAt: NOW + 300 * DAY });
  assert.equal(clamped.expires_at, NOW + DAY);
});

test("ordinary events keep their longer retention", () => {
  const dm = finalizeEvent(
    {
      collection: "gupt/chat/dm",
      kind: 4,
      created_at: NOW,
      labels: [PUBKEY],
      data: { v: 1, nonce: "aa", ciphertext: "bb" },
    },
    KEY,
  );
  assert.equal(dm.expires_at, NOW + 30 * DAY);
});

test("a replayed offer cannot add a second local call row", () => {
  assert.equal(callEventRowId("call-1", "missed"), "call-call-1-missed");
  assert.equal(callEventRowId("call-1", "missed"), callEventRowId("call-1", "missed"));
  assert.notEqual(callEventRowId("call-1", "missed"), callEventRowId("call-1", "no-answer"));

  const rows = [
    { id: "call-call-1-missed", callId: "call-1", mine: true },
    { id: "peer-row", callId: "call-2", mine: false },
  ];
  assert.equal(hasOwnCallRow(rows, "call-1"), true);
  // The peer's copy of a different call is not our record.
  assert.equal(hasOwnCallRow(rows, "call-2"), false);
  assert.equal(hasOwnCallRow(rows, "call-3"), false);
  assert.equal(hasOwnCallRow([], "call-1"), false);
  assert.equal(hasOwnCallRow(null, "call-1"), false);
  assert.equal(hasOwnCallRow(rows, ""), false);
});

test("mesh replication accepts a five-minute-old offer and drops anything older", () => {
  const event = (age) => ({
    id: `offer-${age}`,
    collection: "gupt/calls/signal",
    owner: `ed25519:${PUBKEY}`,
    created_at: NOW - age,
  });

  assert.equal(shouldReplicateEvent(event(299), { selfPubkey: PUBKEY, nowSec: NOW }), true);
  assert.equal(shouldReplicateEvent(event(300), { selfPubkey: PUBKEY, nowSec: NOW }), true);
  assert.equal(shouldReplicateEvent(event(301), { selfPubkey: PUBKEY, nowSec: NOW }), false);
});

test("an expired signal is never replicated, however fresh it looks", () => {
  const expired = {
    id: "expired",
    collection: "gupt/calls/signal",
    owner: `ed25519:${PUBKEY}`,
    created_at: NOW - 10,
    expires_at: NOW,
  };
  assert.equal(shouldReplicateEvent(expired, { selfPubkey: PUBKEY, nowSec: NOW }), false);
});
