import test from "node:test";
import assert from "node:assert/strict";

import {
  BLOB_MAX_PARTS,
  BLOB_SPLIT_THRESHOLD,
  RABTA_MAGIC,
  openBlob,
  openParts,
  sealParts,
  sealBlob,
  splitPlaintext,
} from "../src/lib/rabta/index.js";
import { decidePartCount, partBudgetForFiles } from "../src/lib/upload.js";

const MB = 1024 * 1024;
const bytesOf = (length, seed = 7) => {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * seed + 11) % 256;
  return out;
};

test("splitPlaintext makes ceil(size/parts) equal parts with a short tail", () => {
  const bytes = bytesOf(10_000);
  const parts = splitPlaintext(bytes, 8);
  assert.equal(parts.length, 8);
  const per = Math.ceil(10_000 / 8);
  for (let i = 0; i < 7; i++) {
    assert.equal(parts[i].length, per);
    assert.deepEqual(Array.from(parts[i]), Array.from(bytes.subarray(i * per, (i + 1) * per)));
  }
  assert.equal(parts[7].length, 10_000 - 7 * per);
});

test("splitPlaintext keeps empty and single-part inputs whole", () => {
  assert.deepEqual(splitPlaintext(new Uint8Array(0), 8).length, 1);
  const bytes = bytesOf(100);
  const single = splitPlaintext(bytes, 1);
  assert.equal(single.length, 1);
  assert.deepEqual(Array.from(single[0]), Array.from(bytes));
});

test("sealParts + openParts round-trips a single part", () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const plain = bytesOf(1024);
  const parts = sealParts(plain, key, 1);
  assert.equal(parts.length, 1);
  const opened = openParts(parts, key, plain.length);
  assert.deepEqual(Array.from(opened), Array.from(plain));
});

test("sealParts + openParts round-trips 8 parts across the threshold", () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const size = BLOB_SPLIT_THRESHOLD + 512 * 1024; // 2.5MB
  const plain = bytesOf(size, 13);
  const parts = sealParts(plain, key, BLOB_MAX_PARTS);
  assert.equal(parts.length, BLOB_MAX_PARTS);
  for (const part of parts) {
    assert.equal(new TextDecoder().decode(part.subarray(0, 6)), RABTA_MAGIC);
  }
  const opened = openParts(parts, key, plain.length);
  assert.equal(opened.length, plain.length);
  assert.deepEqual(Array.from(opened), Array.from(plain));
});

test("each part opens on its own under the same media key", () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const plain = bytesOf(1000);
  const parts = sealParts(plain, key, 8);
  let rebuilt = new Uint8Array(0);
  for (const part of parts) {
    const chunk = openBlob(part, key);
    const next = new Uint8Array(rebuilt.length + chunk.length);
    next.set(rebuilt, 0);
    next.set(chunk, rebuilt.length);
    rebuilt = next;
  }
  assert.deepEqual(Array.from(rebuilt), Array.from(plain));
});

test("parts below the 25-byte pad floor are clamped to one part", () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const plain = bytesOf(3);
  const parts = sealParts(plain, key, BLOB_MAX_PARTS);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].byteLength, 7 + 16 + 25 + 16);
  assert.deepEqual(Array.from(openParts(parts, key, plain.length)), Array.from(plain));

  const tiny = new Uint8Array(0);
  const emptyParts = sealParts(tiny, key, BLOB_MAX_PARTS);
  assert.equal(emptyParts.length, 1);
  assert.deepEqual(Array.from(openParts(emptyParts, key, 0)), Array.from(tiny));
});

test("a byte over the threshold still splits into 8 parts", () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const plain = bytesOf(BLOB_SPLIT_THRESHOLD + 1);
  const parts = sealParts(plain, key, BLOB_MAX_PARTS);
  assert.equal(parts.length, BLOB_MAX_PARTS);
  assert.deepEqual(Array.from(openParts(parts, key, plain.length)), Array.from(plain));
});

test("sealParts uses a fresh salt per part and per call", () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const plain = bytesOf(512);
  const [partA, partB] = sealParts(plain, key, 2);
  const [partC, partD] = sealParts(plain, key, 2);
  assert.notDeepEqual(Array.from(partA.subarray(7, 23)), Array.from(partB.subarray(7, 23)));
  assert.notDeepEqual(Array.from(partA.subarray(7, 23)), Array.from(partC.subarray(7, 23)));
  assert.notDeepEqual(Array.from(partD.subarray(7, 23)), Array.from(partC.subarray(7, 23)));
});

test("decidePartCount follows the 2MB threshold", () => {
  assert.equal(decidePartCount(0), 1);
  assert.equal(decidePartCount(1024), 1);
  assert.equal(decidePartCount(2 * MB), 1);
  assert.equal(decidePartCount(2 * MB + 1), 8);
  assert.equal(decidePartCount(50 * MB), 8);
});

test("decidePartCount respects a tighter budget", () => {
  assert.equal(decidePartCount(10 * MB, 4), 4);
  assert.equal(decidePartCount(10 * MB, 1), 1);
  assert.equal(decidePartCount(10 * MB, 0.5), 1);
});

test("partBudgetForFiles splits the 8-blob cap across files", () => {
  const MB100 = 100 * MB;
  assert.equal(partBudgetForFiles([MB100]), 8);
  assert.equal(partBudgetForFiles([MB100, MB100]), 4);
  assert.equal(partBudgetForFiles([MB100, MB100, MB100, MB100]), 2);
  // small files cost one blob each, big files share the rest
  assert.equal(partBudgetForFiles([100, 100, 100, MB100]), 5);
  assert.equal(partBudgetForFiles([100, 100, 100]), 1);
  assert.equal(partBudgetForFiles([]), 1);
});

test("part hashes are content-addressed and verifiable", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const parts = sealParts(bytesOf(3000), key, 8);
  const { sha256HexOfBytes } = await import("../src/lib/engine/core.js");
  for (const part of parts) {
    assert.match(await sha256HexOfBytes(part), /^[a-f0-9]{64}$/);
  }
});
