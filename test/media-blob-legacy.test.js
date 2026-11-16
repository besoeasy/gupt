import test from "node:test";
import assert from "node:assert/strict";
import { gcm } from "@noble/ciphers/aes.js";
import { openParts, sealParts, openBlob } from "../src/lib/rabta/index.js";
import { resolveMediaSources } from "../src/lib/mediaDecrypt.js";
import { isMediaMessage } from "../src/lib/chatUtils.js";
import { feedFileToMediaMessage } from "../src/lib/feed.js";

test("openParts supports legacy AES-GCM encrypted chunks when nonceBytes is provided", () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode("Hello legacy attachment blob!");

  // Encrypt with raw AES-GCM (legacy format without RABTA1 magic header)
  const legacyEncryptedChunk = gcm(secret, nonce).encrypt(plaintext);

  // Decrypt using openParts with nonceBytes passed
  const decrypted = openParts([legacyEncryptedChunk], secret, plaintext.length, nonce);
  assert.deepEqual(Array.from(decrypted), Array.from(plaintext));
  assert.equal(new TextDecoder().decode(decrypted), "Hello legacy attachment blob!");
});

test("openParts automatically detects and decrypts RABTA1 containers without needing nonceBytes", () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = new TextEncoder().encode("Hello RABTA1 multi-part attachment!");

  // Seal parts generates RABTA1 headers
  const sealed = sealParts(plaintext, secret, 2);
  const decrypted = openParts(sealed, secret, plaintext.length);
  assert.deepEqual(Array.from(decrypted), Array.from(plaintext));
});

test("resolveMediaSources recognizes legacy media message types", () => {
  const types = ["image", "video", "audio", "file", "media", "voice"];
  for (const type of types) {
    const sources = resolveMediaSources({
      type,
      media: {
        hash: "a".repeat(64),
      },
    });
    assert.equal(sources.length, 1, `Expected 1 source for type=${type}`);
    assert.equal(sources[0].hash, "a".repeat(64));
  }
});

test("resolveMediaSources resolves hash from media.locations, media.sha256, and fallback URLs", () => {
  // Test media.locations with sha256
  const locSource = resolveMediaSources({
    type: "file",
    media: {
      locations: [{ sha256: "b".repeat(64), url: "https://example.com/file.bin" }],
    },
  });
  assert.equal(locSource.length, 1);
  assert.equal(locSource[0].hash, "b".repeat(64));
  assert.equal(locSource[0].url, "https://example.com/file.bin");

  // Test media.sha256
  const shaSource = resolveMediaSources({
    type: "image",
    media: {
      sha256: "c".repeat(64),
    },
  });
  assert.equal(shaSource.length, 1);
  assert.equal(shaSource[0].hash, "c".repeat(64));

  // Test unknown non-media type returns empty
  const nonMedia = resolveMediaSources({
    type: "text",
    content: "hello",
  });
  assert.deepEqual(nonMedia, []);
});

test("isMediaMessage identifies both current and legacy media message formats", () => {
  assert.equal(isMediaMessage({ type: "media" }), true);
  assert.equal(isMediaMessage({ type: "image" }), true);
  assert.equal(isMediaMessage({ type: "video" }), true);
  assert.equal(isMediaMessage({ type: "audio" }), true);
  assert.equal(isMediaMessage({ type: "file" }), true);
  assert.equal(isMediaMessage({ type: "custom", media: { hash: "123" } }), true);

  // Excluded types even if media exists
  assert.equal(isMediaMessage({ type: "voice", media: {} }), false);
  assert.equal(isMediaMessage({ type: "location", media: {} }), false);
  assert.equal(isMediaMessage({ type: "call", media: {} }), false);
  assert.equal(isMediaMessage({ type: "text" }), false);
  assert.equal(isMediaMessage(null), false);
});

test("feedFileToMediaMessage supplies fallback id when hash is absent", () => {
  const msgWithoutHash = feedFileToMediaMessage({ name: "document.pdf", size: 1024 }, 0);
  assert.equal(msgWithoutHash.id, "file:document.pdf");
  assert.equal(msgWithoutHash.type, "media");

  const msgWithHash = feedFileToMediaMessage({ sha256: "d".repeat(64), name: "photo.jpg" }, 1);
  assert.equal(msgWithHash.id, `media:${"d".repeat(64)}`);
});
