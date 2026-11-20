import test from "node:test";
import assert from "node:assert/strict";

import {
  WRITER_VERSION,
  compareVersions,
  stampWriter,
  readWriterVersion,
  isWrittenBefore,
} from "../src/lib/writerVersion.js";
import { finalizeEvent } from "../src/lib/crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";

test("CalVer compares numerically per part, not as strings", () => {
  assert.equal(compareVersions("2026.105.2", "2026.930.1"), -1);
  assert.equal(compareVersions("2026.930.1", "2026.1001.1"), -1);
  assert.equal(compareVersions("2026.1120.9", "2026.1120.10"), -1);
  assert.equal(compareVersions("2026.1120.1", "2026.1120.1"), 0);
  assert.equal(compareVersions("2026.1120.4", "2026.1120.1"), 1);
});

test("stampWriter tags without mutating, missing stamp reads as old", () => {
  const obj = { v: 1, nonce: "n", ciphertext: "c" };
  const stamped = stampWriter(obj);
  assert.equal(stamped.w, WRITER_VERSION);
  assert.ok(!("w" in obj), "must not mutate the input");
  assert.equal(readWriterVersion(stamped), WRITER_VERSION);
  assert.equal(readWriterVersion({ v: 1 }), null);
  assert.equal(readWriterVersion({ data: stamped }), WRITER_VERSION);
  assert.ok(isWrittenBefore({}, "2026.101.1"), "pre-stamp items count as old");
  assert.ok(isWrittenBefore({ w: "2026.101.1" }, "2026.1120.1"));
  assert.ok(!isWrittenBefore({ w: "2026.1120.1" }, "2026.1120.1"), "equal is not before");
  assert.ok(!isWrittenBefore({ w: "2026.1120.10" }, "2026.1120.9"));
  assert.ok(!isWrittenBefore(stamped, stamped.w), "equal is not before");
});

test("finalizeEvent stamps data but leaves the v1 envelope readable", () => {
  const privkey = hexToBytes("11".repeat(32));
  const signed = finalizeEvent(
    {
      collection: "gupt/chat/dm",
      labels: ["peer"],
      data: { v: 1, nonce: "n", ciphertext: "c" },
      created_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      kind: 4,
      tags: [],
    },
    privkey,
  );
  assert.equal(signed.data.w, WRITER_VERSION);
  assert.equal(signed.data.v, 1, "stamp must not disturb the protocol version");
});
