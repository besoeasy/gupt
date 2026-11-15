import test from "node:test";
import assert from "node:assert/strict";
import { hexToBytes } from "@noble/hashes/utils.js";
import { generateKeypair, getPublicKey } from "../src/lib/crypto.js";

test("generateKeypair creates unique, valid Ed25519 keypairs", () => {
  const kp1 = generateKeypair();
  const kp2 = generateKeypair();

  assert.equal(typeof kp1.privkeyHex, "string");
  assert.equal(typeof kp1.pubkeyHex, "string");
  assert.match(kp1.privkeyHex, /^[0-9a-f]{64}$/);
  assert.match(kp1.pubkeyHex, /^[0-9a-f]{64}$/);

  // Must be distinct
  assert.notEqual(kp1.privkeyHex, kp2.privkeyHex);
  assert.notEqual(kp1.pubkeyHex, kp2.pubkeyHex);

  // Pubkey derivation matches
  const derivedPubkey = getPublicKey(hexToBytes(kp1.privkeyHex));
  assert.equal(derivedPubkey, kp1.pubkeyHex);
});
