#!/usr/bin/env node
/**
 * The release identity lives in `package.json` and nowhere else.
 *
 * `version` is the release date, one release per day: `2026.11.20` is the
 * release of 20 November 2026. Month and day are unpadded because semver
 * forbids leading zeroes — `semver.valid("2026.11.05")` is `null`, and
 * `npm version 2026.11.05` quietly rewrites it to `2026.11.5`.
 *
 * Everything downstream reads that one value: the git tag, the GHCR image tag
 * and the writer stamp baked into the build (see `src/lib/writerVersion.js`).
 *
 *   check           validate package.json and package-lock.json (the CI gate)
 *   bump            set today's UTC date as the version
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// YYYY.M.D — unpadded month and day, nothing else. A leading zero is what
// makes the padded form invalid semver.
const RELEASE_RE = /^(\d{4})\.([1-9]|1[0-2])\.([1-9]|[12]\d|3[01])$/;

/** `2026.11.20` → `{ year: 2026, month: 11, day: 20, date: "2026-11-20" }`, or null. */
export function parseRelease(version) {
  const match = RELEASE_RE.exec(String(version ?? "").trim());
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Date rolls 30 February over into March instead of failing, so round-trip
  // the parts to reject days the month does not have.
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;

  return { year, month, day, date: parsed.toISOString().slice(0, 10) };
}

/** Today, as a release version, in UTC. */
export function releaseOf(date = new Date()) {
  return `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf-8"));
}

/**
 * Every reason this tree cannot be released, as messages. An empty list means
 * valid: the version is a date, and both lockfile version fields agree with it.
 */
export function checkVersion(root) {
  const version = readJson(join(root, "package.json")).version;
  const release = parseRelease(version);
  if (!release) {
    return [
      `package.json version '${version}' is not a release date — expected YYYY.M.D, e.g. 2026.11.20`,
    ];
  }

  const errors = [];
  const lock = readJson(join(root, "package-lock.json"));
  if (lock.version !== version) {
    errors.push(`package-lock.json version '${lock.version}' does not match '${version}'`);
  }
  const lockedRoot = lock.packages?.[""]?.version;
  if (lockedRoot !== version) {
    errors.push(
      `package-lock.json packages[""].version '${lockedRoot}' does not match '${version}'`,
    );
  }
  return errors;
}

// A shim is dated: `// COMPAT: remove after YYYY-MM-DD — <old format + why>`.
const SHIM_RE = /COMPAT: remove after (\d{4}-\d{2}-\d{2})/g;

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.(js|vue)$/.test(entry.name)) yield path;
  }
}

/**
 * Shims whose date has passed. AGENTS.md says to delete the old branch in the
 * next release rather than extend it, so these block the release: it is the one
 * deadline nobody remembers, and the grep is easy to skip under release stress.
 */
export function expiredShims(root, today = new Date()) {
  const cutoff = today.toISOString().slice(0, 10);
  const expired = [];
  for (const file of sourceFiles(join(root, "src"))) {
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(SHIM_RE)) {
      if (match[1] > cutoff) continue;
      const line = text.slice(0, match.index).split("\n").length;
      expired.push(
        `${relative(root, file)}:${line} — shim expired ${match[1]}, delete the old read path`,
      );
    }
  }
  return expired;
}

function main(argv) {
  const [command] = argv;
  const root = process.cwd();

  if (command === "check") {
    const { version } = readJson(join(root, "package.json"));
    const errors = [...checkVersion(root), ...expiredShims(root)];
    if (errors.length) {
      for (const error of errors) console.error(`::error::${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`release ${version} (${parseRelease(version).date}) is valid, no expired shims`);
    return;
  }

  if (command === "bump") {
    const version = releaseOf();
    // `--allow-same-version` keeps a second run on release day a no-op instead
    // of an npm error; it also repairs a lockfile that drifted from package.json.
    execFileSync("npm", ["version", version, "--no-git-tag-version", "--allow-same-version"], {
      cwd: root,
      stdio: "inherit",
    });
    console.log(
      `\nRelease is ${version}: package.json and package-lock.json are in step.` +
        `\nCommit them, then tag ${version}.`,
    );
    return;
  }

  console.error("usage: node scripts/release.mjs <check|bump>");
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
