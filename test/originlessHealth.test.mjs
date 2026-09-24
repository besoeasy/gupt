import test from "node:test";
import assert from "node:assert/strict";

import {
  ORIGINLESS_BG_MAX_ATTEMPTS,
  backoffDelayMs,
  clearOriginlessHealth,
  isOriginlessBanned,
  isTransientUploadError,
  rankOriginlessServers,
  recordOriginlessFailure,
  recordOriginlessSuccess,
  shouldRetryUploadError,
} from "../src/lib/originlessHealth.js";

test("ranks healthy servers before banned ones", () => {
  clearOriginlessHealth();
  const now = Date.now();
  recordOriginlessSuccess("https://fast.example", 100);
  recordOriginlessFailure("https://bad.example", now);
  const ranked = rankOriginlessServers(["https://bad.example", "https://fast.example"], now);
  assert.deepEqual(ranked, ["https://fast.example", "https://bad.example"]);
  clearOriginlessHealth();
});

test("ban expires after the penalty window", () => {
  clearOriginlessHealth();
  const now = Date.now();
  recordOriginlessFailure("https://flaky.example", now);
  assert.deepEqual(rankOriginlessServers(["https://flaky.example", "https://ok.example"], now), [
    "https://ok.example",
    "https://flaky.example",
  ]);
  assert.equal(isOriginlessBanned("https://flaky.example", now), true);
  assert.equal(isOriginlessBanned("https://flaky.example", now + 6 * 60 * 1000), false);
  clearOriginlessHealth();
});

test("success clears failures and prefers lower latency", () => {
  clearOriginlessHealth();
  const now = Date.now();
  recordOriginlessFailure("https://a.example", now);
  recordOriginlessFailure("https://a.example", now);
  recordOriginlessSuccess("https://a.example", 50);
  recordOriginlessSuccess("https://b.example", 900);
  assert.deepEqual(rankOriginlessServers(["https://b.example", "https://a.example"], now), [
    "https://a.example",
    "https://b.example",
  ]);
  clearOriginlessHealth();
});

test("classifies permanent errors as non-transient", () => {
  const stall = new Error("Upload stalled: no progress for 5 seconds");
  stall.name = "StallError";
  assert.equal(isTransientUploadError(stall), true);
  assert.equal(isTransientUploadError(new Error("Upload failed (500): boom")), true);
  assert.equal(isTransientUploadError(new Error("Upload failed (404): nope")), false);
  assert.equal(isTransientUploadError(new Error("Response missing CID or URL")), false);
  assert.equal(isTransientUploadError(new Error("CID mismatch across Originless servers")), false);
  const abort = new DOMException("Upload aborted", "AbortError");
  assert.equal(isTransientUploadError(abort), false);
});

test("retry budget honors attempts and backoff schedule", () => {
  const stall = new Error("Upload stalled");
  stall.name = "StallError";
  assert.equal(shouldRetryUploadError(stall, 1), true);
  assert.equal(shouldRetryUploadError(stall, ORIGINLESS_BG_MAX_ATTEMPTS), false);
  assert.deepEqual([backoffDelayMs(0), backoffDelayMs(1), backoffDelayMs(2)], [2000, 8000, 20000]);
});
