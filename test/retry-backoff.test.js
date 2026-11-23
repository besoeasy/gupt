import test from "node:test";
import assert from "node:assert/strict";

import { ENGINE_RETRY_BASE_MS, nextRetryMs } from "../src/lib/engine/core.js";
import {
  OUTBOX_RETRY_BASE_MS,
  OUTBOX_RETRY_MAX_MS,
  outboxRetryDelayMs,
} from "../src/config/outbox.js";

// Retry pacing is a contract, not a detail: the send lane, the pull and the
// outbox all double their wait per attempt and cap it, so a relay that is down
// is asked again later instead of in a burst. These pin the multipliers.

test("one request waits base x 2^attempt, plus jitter under 400ms", () => {
  assert.equal(ENGINE_RETRY_BASE_MS, 1000);
  for (let attempt = 0; attempt < 5; attempt++) {
    const base = ENGINE_RETRY_BASE_MS * 2 ** attempt;
    for (let sample = 0; sample < 20; sample++) {
      const delay = nextRetryMs(attempt);
      assert.ok(delay >= base, `${delay} below base ${base} at attempt ${attempt}`);
      assert.ok(delay < base + 400, `${delay} above base+jitter ${base + 400}`);
    }
  }
  // A negative or non-numeric round never produces a negative wait.
  assert.ok(nextRetryMs(-1) >= ENGINE_RETRY_BASE_MS);
});

test("the outbox doubles 30s per attempt and stops at ten minutes", () => {
  assert.equal(OUTBOX_RETRY_BASE_MS, 30_000);
  assert.equal(OUTBOX_RETRY_MAX_MS, 10 * 60_000);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((n) => outboxRetryDelayMs(n)),
    [30_000, 60_000, 120_000, 240_000, 480_000],
  );
  assert.equal(outboxRetryDelayMs(5), 10 * 60_000);
  assert.equal(outboxRetryDelayMs(50), OUTBOX_RETRY_MAX_MS, "no unbounded growth");
  assert.equal(outboxRetryDelayMs(0), outboxRetryDelayMs(-3), "bad counts fall back to base");
});
