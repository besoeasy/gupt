import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  RETENTION_DAYS,
  STREAM_EXPIRY_SECONDS,
  STREAM_DELETE_EXPIRY_SECONDS,
  readConfiguredRetentionDays,
  readConfiguredRetentionMs,
  getExpiryTimestampSec,
} from "../src/config/retention.js";

const DAY_SEC = 24 * 60 * 60;

test("default retention is 366 days", () => {
  assert.equal(RETENTION_DAYS, 366);
  assert.equal(readConfiguredRetentionDays(), 366);
  assert.equal(readConfiguredRetentionMs(), 366 * DAY_SEC * 1000);
  assert.equal(STREAM_EXPIRY_SECONDS, 366 * DAY_SEC);
  assert.equal(STREAM_DELETE_EXPIRY_SECONDS, 10 * 365 * DAY_SEC);
});

test("getExpiryTimestampSec points one retention window into the future", () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const expiry = getExpiryTimestampSec();
  assert.ok(expiry >= nowSec + 366 * DAY_SEC - 5);
  assert.ok(expiry <= nowSec + 366 * DAY_SEC + 5);
});

test("the relay sync worker uses the shared retention window", async () => {
  const content = await readFile(
    new URL("../src/workers/rabta-sync.worker.js", import.meta.url),
    "utf8",
  );
  assert.match(content, /import\s*\{\s*RETENTION_DAYS\s*\}\s*from\s*"\.\.\/config\/retention\.js"/);
  assert.doesNotMatch(content, /const\s+RETENTION_DAYS\s*=/);
});
