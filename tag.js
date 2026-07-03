#!/usr/bin/env node
/**
 * tag.js — stamps a date-based version into package.json
 *
 * Format: YYYY.MM.DDHHMM  (UTC) — e.g. 2026.07.031247
 * Matches the release tag used by the GitHub Actions workflow.
 *
 * Usage:
 *   node tag.js          # writes version to package.json, prints it
 *   node tag.js --dry    # prints the version only (no file write)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dirname, "package.json");

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();

const version = [
  now.getUTCFullYear(),
  ".",
  now.getUTCMonth() + 1,
  ".",
  now.getUTCDate(),
  "T",
  pad(now.getUTCHours()),
  pad(now.getUTCMinutes()),
].join("");

if (!process.argv.includes("--dry")) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.error(`📦  package.json version → ${version}`);
}

// Always print to stdout so CI can capture: release_tag=$(node tag.js --dry)
process.stdout.write(version + "\n");
