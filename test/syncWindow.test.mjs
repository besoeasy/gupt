import test from "node:test";
import assert from "node:assert/strict";
import { liveDmSinceMs, LIVE_DM_LOOKBACK_MS } from "../src/lib/syncWindow.js";

test("LIVE_DM_LOOKBACK_MS is two minutes", () => {
  assert.equal(LIVE_DM_LOOKBACK_MS, 120_000);
});

test("liveDmSinceMs looks back from now when no event has been seen", () => {
  const now = 1_700_000_000_000;
  assert.equal(liveDmSinceMs(0, now), now - LIVE_DM_LOOKBACK_MS);
  assert.equal(liveDmSinceMs(null, now), now - LIVE_DM_LOOKBACK_MS);
});

test("liveDmSinceMs looks back from the last event when it is in the past", () => {
  const now = 1_700_000_000_000;
  const last = now - 10_000;
  assert.equal(liveDmSinceMs(last, now), last - LIVE_DM_LOOKBACK_MS);
});

test("liveDmSinceMs does not go negative", () => {
  assert.equal(liveDmSinceMs(1_000, 2_000, 50_000), 0);
});
