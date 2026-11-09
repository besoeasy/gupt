import assert from "node:assert/strict";
import test from "node:test";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  canonical,
  digestEvent,
  signEvent,
  verifyEvent,
  ed25519PrivToX25519,
  ed25519PubToX25519,
  getSharedSecret,
  sealBlob,
  openBlob,
} from "../src/lib/rabta/index.js";

test("canonical JSON sorts keys and uses compact separators", () => {
  const obj = { z: 1, a: { b: [1, 2], a: "x" } };
  assert.equal(canonical(obj), '{"a":{"a":"x","b":[1,2]},"z":1}');
});

test("digestEvent matches Rabta protocol test vector", () => {
  const envelope = {
    blobs: [],
    collection: "docs/example",
    created_at: 1793283000,
    data: { ciphertext: "base64-or-any-client-format", nonce: "..." },
    expires_at: 1824732600,
    labels: ["demo", "docs"],
    owner: "ed25519:ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
  };
  const { digestHex } = digestEvent(envelope);
  assert.equal(digestHex, "6084fc0692f37f8d952b1012921f2d70d9960f5da20436742529c022647811e5");
});

test("signEvent produces valid signature verifiable by verifyEvent", () => {
  const { secretKey, publicKey } = ed25519.keygen();
  const owner = "ed25519:" + bytesToHex(publicKey);
  const event = signEvent(
    {
      collection: "chat/room-1",
      data: { hello: "world" },
      owner,
    },
    secretKey,
  );

  assert.equal(event.id.length, 64);
  assert.equal(event.sig.length, 128);
  assert.equal(verifyEvent(event), true);

  // Tampered data fails
  const tampered = { ...event, data: { hello: "tampered" } };
  assert.equal(verifyEvent(tampered), false);
});

test("Ed25519 to X25519 ECDH shared secret derivation succeeds between peers", () => {
  const alice = ed25519.keygen();
  const bob = ed25519.keygen();

  const aliceOwner = "ed25519:" + bytesToHex(alice.publicKey);
  const bobOwner = "ed25519:" + bytesToHex(bob.publicKey);

  const sharedA = getSharedSecret(alice.secretKey, bobOwner);
  const sharedB = getSharedSecret(bob.secretKey, aliceOwner);

  assert.deepEqual(sharedA, sharedB);
});

test("RABTA1 blob container seal and open roundtrips correctly with >= 64 bytes", () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = new TextEncoder().encode("Gupt encrypted attachment payload");

  const sealed = sealBlob(plaintext, secret);
  assert.ok(sealed.length >= 64, "container must meet minimum 64 byte wire format");

  const opened = openBlob(sealed, secret, plaintext.length);
  assert.deepEqual(opened, plaintext);
});
