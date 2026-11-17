import test from "node:test";
import assert from "node:assert/strict";

const {
  EXPIRY_COUNTDOWN_MAX_MS,
  expiryProgress,
  expiryUrgency,
  formatExpiryCountdown,
  shouldShowExpiryCountdown,
} = await import("../src/lib/chatCountdown.js");

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test("countdown labels step up from seconds to days", () => {
  assert.equal(formatExpiryCountdown(42 * SECOND), "42s");
  assert.equal(formatExpiryCountdown(1), "1s");
  assert.equal(formatExpiryCountdown(0), "0s");
  assert.equal(formatExpiryCountdown(-5000), "0s");
  assert.equal(formatExpiryCountdown(59.5 * SECOND), "1m");
  assert.equal(formatExpiryCountdown(90 * SECOND), "2m");
  assert.equal(formatExpiryCountdown(59 * MINUTE), "59m");
  assert.equal(formatExpiryCountdown(HOUR), "1h");
  assert.equal(formatExpiryCountdown(23.5 * HOUR), "24h");
  assert.equal(formatExpiryCountdown(DAY), "1d");
  assert.equal(formatExpiryCountdown(4.2 * DAY), "5d");
});

test("urgency highlights the final hour, then the final minute", () => {
  assert.equal(expiryUrgency(5 * HOUR), "calm");
  assert.equal(expiryUrgency(61 * MINUTE), "calm");
  assert.equal(expiryUrgency(60 * MINUTE), "soon");
  assert.equal(expiryUrgency(2 * MINUTE), "soon");
  assert.equal(expiryUrgency(60 * SECOND), "critical");
  assert.equal(expiryUrgency(0), "critical");
});

test("ring progress drains over the countdown window", () => {
  const now = 1_000_000;
  // A one-hour message half gone.
  assert.equal(
    expiryProgress({ expiresAt: now + 30 * MINUTE, startedAt: now - 30 * MINUTE, now }),
    0.5,
  );
  // A 366-day message in its final 12 hours still reads as a half-full ring.
  assert.equal(
    expiryProgress({ expiresAt: now + 12 * HOUR, startedAt: now - 366 * DAY, now }),
    0.5,
  );
  // Never above full, never below empty.
  assert.equal(
    expiryProgress({ expiresAt: now + 5 * DAY, startedAt: now, now }),
    1,
  );
  assert.equal(expiryProgress({ expiresAt: now - 1, startedAt: now - HOUR, now }), 0);
  assert.equal(expiryProgress({ expiresAt: 0, startedAt: now, now }), 0);
});

test("only own messages inside their final day get a countdown", () => {
  const now = 1_000_000;
  assert.equal(
    shouldShowExpiryCountdown({ mine: true, expiresAt: now + 5 * MINUTE, now }),
    true,
  );
  assert.equal(
    shouldShowExpiryCountdown({ mine: true, expiresAt: now + 25 * HOUR, now }),
    false,
  );
  assert.equal(
    shouldShowExpiryCountdown({ mine: false, expiresAt: now + 5 * MINUTE, now }),
    false,
  );
  assert.equal(shouldShowExpiryCountdown({ mine: true, expiresAt: 0, now }), false);
  assert.equal(
    shouldShowExpiryCountdown({ mine: true, expiresAt: now - 1, now }),
    false,
  );
  assert.equal(EXPIRY_COUNTDOWN_MAX_MS, DAY);
});
