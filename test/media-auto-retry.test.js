import test from "node:test";
import assert from "node:assert/strict";

const {
  MEDIA_AUTO_RETRY_MAX,
  MEDIA_AUTO_RETRY_MS,
  shouldAutoRetry,
} = await import("../src/lib/mediaAutoRetry.js");

test("failed attachments retry only while visible and online", () => {
  const base = { visible: true, failed: true, inFlight: false, online: true, attempts: 0 };
  assert.equal(shouldAutoRetry(base), true);
  assert.equal(shouldAutoRetry({ ...base, visible: false }), false);
  assert.equal(shouldAutoRetry({ ...base, failed: false }), false);
  assert.equal(shouldAutoRetry({ ...base, inFlight: true }), false);
  assert.equal(shouldAutoRetry({ ...base, online: false }), false);
});

test("auto retry stops after a bounded number of attempts", () => {
  const base = { visible: true, failed: true, inFlight: false, online: true };
  assert.equal(shouldAutoRetry({ ...base, attempts: MEDIA_AUTO_RETRY_MAX - 1 }), true);
  assert.equal(shouldAutoRetry({ ...base, attempts: MEDIA_AUTO_RETRY_MAX }), false);
  assert.equal(shouldAutoRetry({ ...base, attempts: MEDIA_AUTO_RETRY_MAX + 5 }), false);
  assert.equal(shouldAutoRetry({ ...base, attempts: 1, maxAttempts: 2 }), true);
  assert.equal(shouldAutoRetry({ ...base, attempts: 2, maxAttempts: 2 }), false);
});

test("retry interval is eight seconds", () => {
  assert.equal(MEDIA_AUTO_RETRY_MS, 8_000);
  assert.equal(MEDIA_AUTO_RETRY_MAX, 6);
});
