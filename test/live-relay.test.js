import test from "node:test";
import assert from "node:assert/strict";
import { queryCountOnce } from "../src/lib/engine/core.js";

// Live-relay tests need the real network. `npm test` must stay deterministic
// offline, so they only run when asked: GUPT_LIVE=1 npm test.
const liveOnly = { skip: process.env.GUPT_LIVE === "1" ? false : "set GUPT_LIVE=1" };

test("live Rabta node responds to queryCountOnce", liveOnly, async () => {
  const count = await queryCountOnce(
    "https://rabta.gupt.app",
    {
      collection_glob: "gupt/*",
    },
    { timeoutMs: 5000 },
  );

  assert.equal(typeof count, "number");
  assert.ok(count >= 0);
});
