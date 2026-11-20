import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { RETENTION_DAYS as RETENTION_FROM_RETENTION } from "../src/config/retention.js";
import {
  RETENTION_DAYS,
  COMPAT_MIN_SLACK_DAYS,
  COMPAT_WINDOW_DAYS,
  MIN_SUPPORTED_DAYS,
} from "../src/config/compat.js";

test("the support window clears relay retention by a shippable margin", () => {
  assert.ok(
    COMPAT_WINDOW_DAYS >= RETENTION_DAYS + COMPAT_MIN_SLACK_DAYS,
    `COMPAT_WINDOW_DAYS (${COMPAT_WINDOW_DAYS}) must be at least RETENTION_DAYS ` +
      `(${RETENTION_DAYS}) + ${COMPAT_MIN_SLACK_DAYS} days — a shorter window retires a ` +
      `format while builds inside it still need the old reader.`,
  );
  assert.ok(
    COMPAT_MIN_SLACK_DAYS >= 30,
    "slack below 30 days cannot fit a dual-read release plus a deprecation notice.",
  );
  assert.equal(MIN_SUPPORTED_DAYS, RETENTION_DAYS + COMPAT_MIN_SLACK_DAYS);
});

test("compat re-exports retention instead of copying it", () => {
  // A local `const RETENTION_DAYS = 366` in compat.js would keep the old value
  // after retention.js changes; comparing the two bindings catches that.
  assert.equal(RETENTION_DAYS, RETENTION_FROM_RETENTION);
});

test("README states the live numbers", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  for (const phrase of [`${RETENTION_DAYS} days`, `${COMPAT_WINDOW_DAYS} days`]) {
    assert.ok(
      readme.includes(phrase),
      `README.md must state "${phrase}": it is derived from src/config/compat.js.`,
    );
  }
});
