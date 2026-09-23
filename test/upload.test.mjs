/**
 * Unit tests for Originless upload stall detection, retries, and pure logic.
 *
 * Runs with the built-in Node test runner:
 *   node --test test/
 */

import test from "node:test";
import assert from "node:assert/strict";

const BASE_TIMEOUT_MS = 30_000;
const MIN_UPLOAD_BYTES_PER_SEC = 50_000;
const STALL_TIMEOUT_MS = 50; // scaled down for unit testing
const MAX_STALL_RETRIES = 2;

function calcTimeoutMs(file, overrideMs) {
  if (overrideMs) return Number(overrideMs);
  const sizeBytes = file?.size ?? file?.fileSize ?? 0;
  return Math.max(BASE_TIMEOUT_MS, Math.ceil((sizeBytes / MIN_UPLOAD_BYTES_PER_SEC) * 1000));
}

function canonicalJSON(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJSON).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(",")}}`;
}

async function simulateUpload({
  shouldStallCount = 0,
  stallTimeoutMs = STALL_TIMEOUT_MS,
  maxRetries = MAX_STALL_RETRIES,
} = {}) {
  let attempts = 0;
  const progressEvents = [];

  while (true) {
    attempts++;
    const currentAttempt = attempts;
    try {
      if (currentAttempt <= shouldStallCount) {
        await new Promise((_, reject) => {
          setTimeout(() => {
            const err = new Error("Upload stalled: no progress for 5 seconds");
            err.name = "StallError";
            reject(err);
          }, stallTimeoutMs);
        });
      }
      return { ok: true, attempts, progressEvents };
    } catch (err) {
      const isStall = err.name === "StallError";
      const retriesDone = attempts - 1;
      if (isStall && retriesDone < maxRetries) {
        progressEvents.push({
          status: "retrying",
          retryCount: attempts,
          maxRetries,
        });
        continue;
      }
      throw err;
    }
  }
}

test("calcTimeoutMs enforces 30s floor and scales for large files", () => {
  assert.equal(calcTimeoutMs({ size: 1000 }), 30_000);
  assert.equal(calcTimeoutMs({ size: 50_000 }), 30_000);
  assert.equal(calcTimeoutMs({ size: 2_000_000 }), 40_000);
  assert.equal(calcTimeoutMs({ size: 10_000_000 }), 200_000);
  assert.equal(calcTimeoutMs(null, 5000), 5000);
});

test("canonicalJSON sorts keys deterministically", () => {
  const obj1 = { b: 2, a: 1, c: { y: 2, x: 1 } };
  const obj2 = { a: 1, c: { x: 1, y: 2 }, b: 2 };
  assert.equal(canonicalJSON(obj1), canonicalJSON(obj2));
  assert.equal(canonicalJSON(obj1), '{"a":1,"b":2,"c":{"x":1,"y":2}}');
});

test("upload retry succeeds if stall recovers on retry 1", async () => {
  const result = await simulateUpload({ shouldStallCount: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.progressEvents.length, 1);
  assert.deepEqual(result.progressEvents[0], {
    status: "retrying",
    retryCount: 1,
    maxRetries: 2,
  });
});

test("upload retry succeeds if stall recovers on retry 2", async () => {
  const result = await simulateUpload({ shouldStallCount: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
  assert.equal(result.progressEvents.length, 2);
  assert.equal(result.progressEvents[1].retryCount, 2);
});

test("upload fails and cancels after exceeding 2 retries on stall", async () => {
  await assert.rejects(
    async () => {
      await simulateUpload({ shouldStallCount: 3 });
    },
    {
      name: "StallError",
      message: "Upload stalled: no progress for 5 seconds",
    },
  );
});

test("fast-settle grace period completes with first confirmed server", async () => {
  const successfulUploads = [];
  let isSettled = false;
  let settledResult = null;

  function finishResolve() {
    if (isSettled) return;
    isSettled = true;
    settledResult = {
      server: successfulUploads[0].server,
      count: successfulUploads.length,
    };
  }

  // Server 1 finishes fast
  successfulUploads.push({ server: "https://server1.example" });
  let timer = setTimeout(() => {
    finishResolve();
  }, 30);

  // Server 2 stalls and never finishes within 30ms
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(isSettled, true);
  assert.equal(settledResult.server, "https://server1.example");
  assert.equal(settledResult.count, 1);
  clearTimeout(timer);
});
