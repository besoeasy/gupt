import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { hexToBytes } from "@noble/hashes/utils.js";

import {
  decryptDm as appDecryptDm,
  encryptDm as appEncryptDm,
  finalizeEvent as appFinalizeEvent,
  getPublicKey as appGetPublicKey,
} from "../src/lib/crypto.js";
import {
  buildDirectMessageEvent,
  decryptDm as sdkDecryptDm,
  encryptDm as sdkEncryptDm,
  getPublicKey as sdkGetPublicKey,
  verifyEventSignature,
} from "../sdk/src/wire.js";

const GOLDEN = JSON.parse(
  readFileSync(new URL("./fixtures/dm-golden.json", import.meta.url), "utf8"),
);
const ALICE_SECRET = GOLDEN.senderSecretHex;
const BOB_SECRET = GOLDEN.recipientSecretHex;
const ALICE_PUBKEY = GOLDEN.senderPubkey;
const BOB_PUBKEY = GOLDEN.recipientPubkey;

test("app and SDK derive identical public keys", () => {
  assert.equal(appGetPublicKey(hexToBytes(ALICE_SECRET)), ALICE_PUBKEY);
  assert.equal(appGetPublicKey(hexToBytes(BOB_SECRET)), BOB_PUBKEY);
});

test("app and SDK decrypt each other's DM ciphertext", async () => {
  const sdkCiphertext = sdkEncryptDm(ALICE_SECRET, BOB_PUBKEY, GOLDEN.plaintext, {
    nonce: Buffer.from(GOLDEN.nonceHex, "hex"),
  });
  assert.equal(sdkCiphertext, GOLDEN.ciphertext);
  assert.equal(await appDecryptDm(BOB_SECRET, ALICE_PUBKEY, GOLDEN.ciphertext), GOLDEN.plaintext);

  const appCiphertext = await appEncryptDm(ALICE_SECRET, BOB_PUBKEY, "from app");
  assert.equal(sdkDecryptDm(BOB_SECRET, ALICE_PUBKEY, appCiphertext), "from app");
});

test("SDK verifies app signatures and app decrypts SDK events", async () => {
  const appEvent = appFinalizeEvent(
    {
      kind: 4,
      created_at: 1_787_510_400,
      tags: [
        ["p", BOB_PUBKEY],
        ["t", "gupt-dm"],
      ],
      content: "fixture",
    },
    hexToBytes(ALICE_SECRET),
  );
  assert.equal(verifyEventSignature(appEvent), true);

  const sdkEvent = buildDirectMessageEvent({
    secretHex: ALICE_SECRET,
    recipientPubkey: BOB_PUBKEY,
    payload: { type: "text", text: "compatible", ts: 1_787_510_400_000 },
    now: 1_787_510_400_000,
  });
  const plaintext = await appDecryptDm(BOB_SECRET, ALICE_PUBKEY, sdkEvent.content);
  assert.deepEqual(JSON.parse(plaintext), {
    type: "text",
    text: "compatible",
    ts: 1_787_510_400_000,
  });
});
