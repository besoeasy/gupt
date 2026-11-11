import test from "node:test";
import assert from "node:assert/strict";
import { queryCountOnce } from "../src/lib/engine/core.js";

test("live Rabta node responds to queryCountOnce", async () => {
  const count = await queryCountOnce(
    "https://rabta.t3nk.com",
    {
      collection_glob: "gupt/*",
    },
    { timeoutMs: 5000 },
  );

  assert.equal(typeof count, "number");
  assert.ok(count >= 0);
});
