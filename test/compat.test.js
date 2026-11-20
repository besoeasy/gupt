import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

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

const COMPAT_TAG_RE = /COMPAT:\s*remove after\s*(\d{4}-\d{2}-\d{2})/g;
const SCAN_EXTS = new Set([".js", ".vue", ".ts"]);

async function collectSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(full)));
    else if (SCAN_EXTS.has(extname(entry.name))) files.push(full);
  }
  return files;
}

test("every COMPAT migration carries a live expiry date", async () => {
  const srcDir = fileURLToPath(new URL("../src", import.meta.url));
  const files = await collectSourceFiles(srcDir);
  const today = new Date().toISOString().slice(0, 10);
  const latest = new Date(Date.now() + COMPAT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const tags = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    COMPAT_TAG_RE.lastIndex = 0;
    let match;
    while ((match = COMPAT_TAG_RE.exec(content)) !== null) {
      tags.push({ file, date: match[1] });
    }
  }

  assert.ok(tags.length > 0, "expected at least one COMPAT migration tag in src/");
  for (const { file, date } of tags) {
    assert.ok(
      date >= today,
      `${file}: COMPAT tag expired on ${date} — delete the old branch and its tag instead of extending it.`,
    );
    assert.ok(
      date <= latest,
      `${file}: COMPAT tag ${date} is more than ${COMPAT_WINDOW_DAYS} days out — ` +
        `a shim may live at most one support window.`,
    );
  }
});
