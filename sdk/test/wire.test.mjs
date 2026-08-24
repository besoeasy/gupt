import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildDirectMessageEvent,
  buildPublicBotEvent,
  decryptDirectMessage,
  decryptDm,
  encryptDm,
  getPublicKey,
  isExpiredEvent,
  normalizePublicBotProfile,
  verifyEventSignature,
  BOT_TAG,
  PUBLIC_BOT_CONTENT,
} from "../src/wire.js";

const ALICE_SECRET = "1".padStart(64, "0");
const BOB_SECRET = "2".padStart(64, "0");
const ALICE_PUBKEY = getPublicKey(ALICE_SECRET);
const BOB_PUBKEY = getPublicKey(BOB_SECRET);
const GOLDEN = JSON.parse(
  readFileSync(new URL("../../test/fixtures/dm-golden.json", import.meta.url), "utf8"),
);

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
  const nonce = Buffer.from(GOLDEN.nonceHex, "hex");
  const ciphertext = encryptDm(GOLDEN.senderSecretHex, GOLDEN.recipientPubkey, GOLDEN.plaintext, {
    nonce,
  });

  assert.equal(ciphertext, GOLDEN.ciphertext);
  assert.equal(
    decryptDm(GOLDEN.recipientSecretHex, GOLDEN.senderPubkey, GOLDEN.ciphertext),
    GOLDEN.plaintext,
  );
});

test("builds a public kind-1 gupt-bot listing", () => {
  const now = Date.UTC(2026, 7, 23);
  const event = buildPublicBotEvent({
    secretHex: ALICE_SECRET,
    name: "Echo",
    about: "Repeats your message back.",
    relays: ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.damus.io"],
    now,
  });

  assert.equal(event.kind, 1);
  assert.equal(event.pubkey, ALICE_PUBKEY);
  assert.equal(event.content, PUBLIC_BOT_CONTENT);
  assert.deepEqual(event.tags[0], ["t", BOT_TAG]);
  assert.deepEqual(event.tags[1], [
    "gupt-bot",
    JSON.stringify({ name: "Echo", about: "Repeats your message back." }),
  ]);
  assert.deepEqual(event.tags[3], ["r", "wss://relay.damus.io"]);
  assert.deepEqual(event.tags[4], ["r", "wss://nos.lol"]);
  assert.equal(verifyEventSignature(event), true);
  assert.equal(event.content.includes("v1:"), false);
  assert.equal(isExpiredEvent(event, now), false);
  assert.equal(isExpiredEvent(event, now + 101 * 24 * 60 * 60 * 1000), true);
});

test("includes optional owner pubkey and website on a public bot listing", () => {
  const owner = BOB_PUBKEY;
  const event = buildPublicBotEvent({
    secretHex: ALICE_SECRET,
    name: "Echo",
    about: "Repeats your message back.",
    owner,
    website: "https://example.com/echo",
  });
  assert.deepEqual(JSON.parse(event.tags[1][1]), {
    name: "Echo",
    about: "Repeats your message back.",
    owner,
    website: "https://example.com/echo",
  });
});

test("rejects invalid publicBot profiles", () => {
  assert.equal(normalizePublicBotProfile(null), null);
  assert.equal(normalizePublicBotProfile(false), null);
  assert.throws(() => normalizePublicBotProfile(true), /must be \{ name, about \}/);
  assert.throws(() => normalizePublicBotProfile({ about: "x" }), /name is required/);
  assert.throws(() => normalizePublicBotProfile({ name: "Echo" }), /about is required/);
  assert.throws(
    () =>
      normalizePublicBotProfile({
        name: "Echo",
        about: "ok",
        owner: "not-a-key",
      }),
    /pubkey/,
  );
  assert.throws(
    () =>
      normalizePublicBotProfile({
        name: "Echo",
        about: "ok",
        website: "javascript:alert(1)",
      }),
    /website/,
  );
  assert.deepEqual(
    normalizePublicBotProfile({
      name: "Echo",
      about: "ok",
      owner: "",
      website: "",
    }),
    { name: "Echo", about: "ok" },
  );
});
