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
  assert.equal(compareVersions("2026.1.5", "2026.9.30"), -1);
  assert.equal(compareVersions("2026.9.30", "2026.10.1"), -1);
  assert.equal(compareVersions("2026.11.9", "2026.11.10"), -1);
  assert.equal(compareVersions("2026.11.20", "2026.11.20"), 0);
  assert.equal(compareVersions("2026.11.21", "2026.11.20"), 1);
});

test("stampWriter tags without mutating, missing stamp reads as old", () => {
  const obj = { v: 1, nonce: "n", ciphertext: "c" };
  const stamped = stampWriter(obj);
  assert.equal(stamped.w, WRITER_VERSION);
  assert.ok(!("w" in obj), "must not mutate the input");
  assert.equal(readWriterVersion(stamped), WRITER_VERSION);
  assert.equal(readWriterVersion({ v: 1 }), null);
  assert.equal(readWriterVersion({ data: stamped }), WRITER_VERSION);
  assert.ok(isWrittenBefore({}, "2026.1.5"), "pre-stamp items count as old");
  assert.ok(isWrittenBefore({ w: "2026.1.5" }, "2026.11.20"));
  assert.ok(!isWrittenBefore({ w: "2026.11.20" }, "2026.11.20"), "equal is not before");
  assert.ok(!isWrittenBefore({ w: "2026.11.10" }, "2026.11.9"));
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
