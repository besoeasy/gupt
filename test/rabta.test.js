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
  checkRelayHealth,
  checkRelayHasEvent,
} from "../src/lib/rabta/index.js";
import {
  generateKeypair,
  finalizeEvent,
  encryptDm,
  decryptDm,
  getPublicKey,
} from "../src/lib/crypto.js";

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

test("RABTA1 blob container handles short plaintext (<25 bytes) with padding", () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = new TextEncoder().encode("hi");

  const sealed = sealBlob(plaintext, secret);
  assert.ok(
    sealed.length >= 64,
    "container must meet minimum 64 byte wire format even for tiny payload",
  );

  const opened = openBlob(sealed, secret);
  assert.equal(new TextDecoder().decode(opened.subarray(0, plaintext.length)), "hi");
});

test("generateKeypair returns 64-char hex strings and matches getPublicKey", () => {
  const { privkey, pubkey } = generateKeypair();
  assert.equal(privkey.length, 64);
  assert.equal(pubkey.length, 64);
  assert.equal(getPublicKey(privkey), pubkey);
});

test("finalizeEvent wraps template into valid Rabta envelope and signs", () => {
  const { privkey, pubkey } = generateKeypair();
  const event = finalizeEvent(
    {
      kind: 1,
      tags: [
        ["t", "gupt_note"],
        ["p", pubkey],
      ],
      content: "Encrypted note payload",
    },
    privkey,
  );

  assert.equal(event.collection, "gupt/vault/notes");
  assert.equal(event.owner, `ed25519:${pubkey}`);
  assert.ok(event.labels.includes("gupt_note"));
  assert.ok(event.labels.includes(pubkey));
  assert.equal(verifyEvent(event), true);
});

test("gupt/calls/signal and gupt/chat/typing enforce 1 day (86400s) expiry", () => {
  const { privkey, pubkey } = generateKeypair();

  const callEvent = finalizeEvent(
    {
      kind: 20004,
      tags: [["p", pubkey]],
      content: "{}",
    },
    privkey,
  );
  assert.equal(callEvent.collection, "gupt/calls/signal");
  assert.equal(callEvent.expires_at - callEvent.created_at, 86400);

  const typingEvent = finalizeEvent(
    {
      kind: 21004,
      tags: [["p", pubkey]],
      content: "{}",
    },
    privkey,
  );
  assert.equal(typingEvent.collection, "gupt/chat/typing");
  assert.equal(typingEvent.expires_at - typingEvent.created_at, 86400);
});

test("encryptDm and decryptDm roundtrip between two Ed25519 peers via X25519 ECDH", async () => {
  const alice = generateKeypair();
  const bob = generateKeypair();

  const secretMessage = "Hello Bob, this is a secret Rabta message!";
  const encrypted = await encryptDm(alice.privkey, bob.pubkey, secretMessage);
  assert.ok(encrypted.startsWith("v1:"));

  const decrypted = await decryptDm(bob.privkey, alice.pubkey, encrypted);
  assert.equal(decrypted, secretMessage);
});

test("Rabta default relays are reachable and report healthy node status", async () => {
  const t3nkHealth = await checkRelayHealth("https://rabta.t3nk.com");
  assert.equal(t3nkHealth.ok, true, "rabta.t3nk.com should be reachable and healthy");
  assert.equal(t3nkHealth.status, "ok");
  assert.ok(t3nkHealth.nodeId);

  const spaceHealth = await checkRelayHealth("https://1.rabta.space");
  assert.equal(spaceHealth.ok, true, "1.rabta.space should be reachable and healthy");
  assert.equal(spaceHealth.status, "ok");
  assert.ok(spaceHealth.nodeId);
});

test("checkRelayHasEvent accurately detects existing vs missing events via HEAD", async () => {
  const missing = await checkRelayHasEvent(
    "https://rabta.t3nk.com",
    "0000000000000000000000000000000000000000000000000000000000000000",
  );
  assert.equal(missing, false, "all-zero hash should return false (404)");

  const existing = await checkRelayHasEvent(
    "https://rabta.t3nk.com",
    "f8555556a0e94044bd7a28cb1a86d579a3f9241cbf45fe72ec404d19861dc447",
  );
  assert.equal(existing, true, "known event on relay should return true (200)");
});
