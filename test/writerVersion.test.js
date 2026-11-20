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

test("read-repair: a headerless outbox box is rewritten in the current shape", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const { OUTBOX_STORAGE_KEY, queueOutboxEvent, outboxQueueSize } =
    await import("../src/lib/idb.js");

  // A box written by a build that predates the header.
  store.set(
    OUTBOX_STORAGE_KEY,
    JSON.stringify({ owner: "aa", entries: [{ id: "old", pubkey: "aa", event: { id: "old" } }] }),
  );
  outboxQueueSize();

  const repaired = JSON.parse(store.get(OUTBOX_STORAGE_KEY));
  assert.equal(repaired.v, 1);
  assert.equal(repaired.w, WRITER_VERSION);
  assert.equal(repaired.entries[0].id, "old", "repair must not drop queued events");

  queueOutboxEvent({ id: "e1", pubkey: "aa", event: { id: "e1" } });
  assert.equal(JSON.parse(store.get(OUTBOX_STORAGE_KEY)).w, WRITER_VERSION);
});
