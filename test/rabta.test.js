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
  replicateEventToRelays,
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
  assert.equal(encrypted.v, 1);
  assert.ok(encrypted.nonce);
  assert.ok(encrypted.ciphertext);

  const decrypted = await decryptDm(bob.privkey, alice.pubkey, encrypted);
  assert.equal(decrypted, secretMessage);
});

test("private DM event referencing an uploaded blob embeds hash in envelope.blobs and signs correctly", async () => {
  const alice = generateKeypair();
  const bob = generateKeypair();
  const fakeBlobHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  const payload = {
    type: "media",
    text: "Check out this confidential file",
    media: {
      name: "confidential.pdf",
      mime: "application/pdf",
      size: 1048576,
      hash: fakeBlobHash,
      key: "base64key...",
      nonce: "base64nonce...",
    },
  };

  const encrypted = await encryptDm(alice.privkey, bob.pubkey, JSON.stringify(payload));
  const envelope = finalizeEvent(
    {
      collection: "gupt/chat/dm",
      blobs: [fakeBlobHash],
      labels: ["gupt_chat_dm", bob.pubkey],
      data: {
        v: 1,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
      },
    },
    alice.privkey,
  );

  assert.equal(envelope.collection, "gupt/chat/dm");
  assert.deepEqual(envelope.blobs, [fakeBlobHash]);
  assert.equal(envelope.data.v, 1);
  assert.ok(envelope.data.nonce);
  assert.ok(envelope.data.ciphertext);
  assert.equal(envelope.data.kind, undefined);
  assert.equal(envelope.data.tags, undefined);
  assert.equal(
    verifyEvent(envelope),
    true,
    "envelope with blobs should have valid Ed25519 signature",
  );

  // Decrypt recipient side directly from envelope.data
  const decrypted = await decryptDm(bob.privkey, alice.pubkey, envelope.data);
  const parsed = JSON.parse(decrypted);
  assert.equal(parsed.media.hash, fakeBlobHash);
  assert.equal(parsed.text, "Check out this confidential file");
});

test("Option 1: DM event stores E2EE payload directly in envelope.data { v: 1, nonce, ciphertext } without Nostr wrappers", async () => {
  const alice = generateKeypair();
  const bob = generateKeypair();
  const blobHash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

  const messagePayload = {
    type: "media",
    text: "Confidential document",
    media: {
      name: "contract.pdf",
      mime: "application/pdf",
      size: 54321,
      hash: blobHash,
      key: "aes-key-base64",
      nonce: "aes-nonce-base64",
    },
    ts: 1731200000000,
  };

  const encrypted = await encryptDm(alice.privkey, bob.pubkey, JSON.stringify(messagePayload));

  const event = finalizeEvent(
    {
      collection: "gupt/chat/dm",
      blobs: [blobHash],
      labels: ["gupt-dm", bob.pubkey],
      data: {
        v: 1,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 86400,
    },
    alice.privkey,
  );

  assert.equal(event.collection, "gupt/chat/dm");
  assert.deepEqual(event.blobs, [blobHash]);
  assert.deepEqual(event.labels, ["gupt-dm", bob.pubkey]);
  assert.equal(event.data.v, 1);
  assert.equal(event.data.nonce, encrypted.nonce);
  assert.equal(event.data.ciphertext, encrypted.ciphertext);

  // No Nostr wrappers inside data
  assert.equal(event.data.kind, undefined);
  assert.equal(event.data.tags, undefined);
  assert.equal(event.data.content, undefined);

  // Valid Rabta signature over canonical object
  assert.equal(verifyEvent(event), true);

  // Bob decrypts directly from event.data
  const decrypted = await decryptDm(bob.privkey, alice.pubkey, event.data);
  const parsed = JSON.parse(decrypted);
  assert.equal(parsed.type, "media");
  assert.equal(parsed.text, "Confidential document");
  assert.equal(parsed.media.name, "contract.pdf");
  assert.equal(parsed.media.hash, blobHash);
  assert.equal(parsed.media.key, "aes-key-base64");
});

test("gupt/profiles stores metadata fields directly in data envelope without picture", () => {
  const alice = generateKeypair();
  const profileData = {
    name: "Alice",
    about: "Rabta user",
    website: "https://example.com",
    status: "online",
  };

  const event = finalizeEvent(
    {
      collection: "gupt/profiles",
      data: profileData,
    },
    alice.privkey,
  );

  assert.equal(event.collection, "gupt/profiles");
  assert.deepEqual(event.data, profileData);
  assert.equal(event.data.picture, undefined);
  assert.equal(verifyEvent(event), true);
});

test("gupt/vault/notes stores E2EE payload directly in data envelope", async () => {
  const alice = generateKeypair();
  const notePayload = { id: "note-1", title: "Secret Note", body: "Top secret content" };
  const encrypted = await encryptDm(alice.privkey, alice.pubkey, JSON.stringify(notePayload));

  const event = finalizeEvent(
    {
      collection: "gupt/vault/notes",
      labels: ["gupt_note", alice.pubkey],
      data: {
        v: 1,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
      },
    },
    alice.privkey,
  );

  assert.equal(event.collection, "gupt/vault/notes");
  assert.equal(event.data.v, 1);
  assert.equal(verifyEvent(event), true);

  const decrypted = await decryptDm(alice.privkey, alice.pubkey, event.data);
  assert.deepEqual(JSON.parse(decrypted), notePayload);
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

test("replicateEventToRelays skips upload when target relays already have the event", async () => {
  const result = await replicateEventToRelays(
    { id: "f8555556a0e94044bd7a28cb1a86d579a3f9241cbf45fe72ec404d19861dc447" },
    ["https://rabta.t3nk.com", "https://1.rabta.space"],
  );
  assert.equal(result.uploaded.length, 0, "should not upload when relays already have event");
  assert.equal(
    result.skipped.length,
    2,
    "both relays should be skipped because they have the event",
  );
});
