import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDirectMessageEvent,
  decryptDirectMessage,
  decryptDm,
  encryptDm,
  getPublicKey,
  isExpiredEvent,
  verifyEventSignature,
} from "../src/wire.js";

const ALICE_SECRET = "1".padStart(64, "0");
const BOB_SECRET = "2".padStart(64, "0");
const ALICE_PUBKEY = getPublicKey(ALICE_SECRET);
const BOB_PUBKEY = getPublicKey(BOB_SECRET);

test("builds signed kind-4 events compatible with GUPT payloads", () => {
  const now = Date.UTC(2026, 7, 23);
  const payload = { type: "text", text: "hello", ts: now };
  const event = buildDirectMessageEvent({
    secretHex: ALICE_SECRET,
    recipientPubkey: BOB_PUBKEY,
    payload,
    relayHint: "wss://relay.example",
    now,
  });

  assert.equal(event.kind, 4);
  assert.equal(event.pubkey, ALICE_PUBKEY);
  assert.deepEqual(event.tags[0], ["p", BOB_PUBKEY, "wss://relay.example"]);
  assert.deepEqual(event.tags[1], ["t", "gupt-dm"]);
  assert.equal(verifyEventSignature(event), true);
  assert.deepEqual(decryptDirectMessage(event, BOB_SECRET, BOB_PUBKEY), payload);
  assert.equal(isExpiredEvent(event, now), false);
  assert.equal(isExpiredEvent(event, now + 101 * 24 * 60 * 60 * 1000), true);
});

test("rejects a signed event after its content is modified", () => {
  const event = buildDirectMessageEvent({
    secretHex: ALICE_SECRET,
    recipientPubkey: BOB_PUBKEY,
    payload: { type: "text", text: "original", ts: Date.now() },
  });
  event.content += "tampered";
  assert.equal(verifyEventSignature(event), false);
});

test("AES-GCM wire format is deterministic with a supplied nonce", () => {
  const nonce = Uint8Array.from({ length: 12 }, (_, index) => index);
  const ciphertext = encryptDm(ALICE_SECRET, BOB_PUBKEY, "golden message", { nonce });

  assert.match(ciphertext, /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.equal(decryptDm(BOB_SECRET, ALICE_PUBKEY, ciphertext), "golden message");
});
