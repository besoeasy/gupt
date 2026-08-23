import assert from "node:assert/strict";
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

const ALICE_SECRET = "1".padStart(64, "0");
const BOB_SECRET = "2".padStart(64, "0");
const ALICE_PUBKEY = sdkGetPublicKey(ALICE_SECRET);
const BOB_PUBKEY = sdkGetPublicKey(BOB_SECRET);

test("app and SDK derive identical public keys", () => {
  assert.equal(appGetPublicKey(hexToBytes(ALICE_SECRET)), ALICE_PUBKEY);
  assert.equal(appGetPublicKey(hexToBytes(BOB_SECRET)), BOB_PUBKEY);
});

test("app and SDK decrypt each other's DM ciphertext", async () => {
  const sdkCiphertext = sdkEncryptDm(ALICE_SECRET, BOB_PUBKEY, "from SDK", {
    nonce: Uint8Array.from({ length: 12 }, (_, index) => index),
  });
  assert.equal(await appDecryptDm(BOB_SECRET, ALICE_PUBKEY, sdkCiphertext), "from SDK");

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
