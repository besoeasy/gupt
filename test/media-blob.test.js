import test from "node:test";
import assert from "node:assert/strict";
import {
  openParts,
  sealParts,
  openBlob,
  openSinglePart,
  createDecryptedPartsStream,
} from "../src/lib/rabta/index.js";
import {
  resolveMediaSources,
  createMediaProgress,
  createDecryptedMediaStream,
} from "../src/lib/mediaDecrypt.js";
import { isMediaMessage, formatBytes } from "../src/lib/chatUtils.js";
import { feedFileToMediaMessage } from "../src/lib/feed.js";

test("openParts automatically detects and decrypts RABTA1 containers", () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = new TextEncoder().encode("Hello RABTA1 multi-part attachment!");

  // Seal parts generates RABTA1 headers
  const sealed = sealParts(plaintext, secret, 2);
  const decrypted = openParts(sealed, secret, plaintext.length);
  assert.deepEqual(Array.from(decrypted), Array.from(plaintext));
});

test("resolveMediaSources recognizes media message types", () => {
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

test("resolveMediaSources resolves canonical schema { hash, size, mime, parts } without cid / locations", () => {
  // Test canonical media payload { hash, size, mime, parts }
  const canonicalSource = resolveMediaSources({
    type: "file",
    media: {
      hash: "b".repeat(64),
      size: 1024,
      mime: "application/octet-stream",
      parts: ["b".repeat(64)],
      url: "https://example.com/file.bin",
    },
  });
  assert.equal(canonicalSource.length, 1);
  assert.equal(canonicalSource[0].hash, "b".repeat(64));
  assert.equal(canonicalSource[0].url, "https://example.com/file.bin");
  assert.equal(canonicalSource[0].cid, undefined);
  assert.equal(canonicalSource[0].locations, undefined);

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

test("isMediaMessage identifies media message formats", () => {
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

test("openSinglePart opens single RABTA1 container", () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const text = new TextEncoder().encode("Chunk test");

  // RABTA1 container
  const [rabtaPart] = sealParts(text, secret, 1);
  const openedRabta = openSinglePart(rabtaPart, secret);
  assert.deepEqual(Array.from(openedRabta.subarray(0, text.length)), Array.from(text));
});

test("createDecryptedPartsStream and createDecryptedMediaStream stream chunks sequentially", async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = new TextEncoder().encode(
    "Testing streaming decryption across multi-part containers! ".repeat(4),
  );
  const parts = sealParts(plaintext, secret, 4);
  assert.equal(parts.length, 4);

  const stream = createDecryptedPartsStream(parts, secret, plaintext.length);
  assert.ok(stream instanceof ReadableStream);

  const reader = stream.getReader();
  const chunks = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  assert.equal(chunks.length, 4);
  assert.equal(totalLength, plaintext.length);

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  assert.deepEqual(merged, plaintext);

  // Verify createDecryptedMediaStream facade
  const facadeStream = createDecryptedMediaStream(parts, secret, plaintext.length);
  assert.ok(facadeStream instanceof ReadableStream);
});

test("createMediaProgress initializes tracking fields and formatBytes formats sizes correctly", () => {
  const progress = createMediaProgress(
    [{ id: "source-1", parts: ["hash1", "hash2", "hash3"] }],
    "hash1",
    { eventId: "ev-1", parts: ["hash1", "hash2", "hash3"] },
  );

  assert.equal(progress.loadedBytes, 0);
  assert.equal(progress.totalBytes, 0);
  assert.equal(progress.partsLoaded, 0);
  assert.equal(progress.totalParts, 3);
  assert.equal(progress.percent, 0);
  assert.equal(progress.cid, undefined);

  // formatBytes checks
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(2.5 * 1024 * 1024), "2.5 MB");
  assert.equal(formatBytes(16 * 1024 * 1024), "16 MB");
});
