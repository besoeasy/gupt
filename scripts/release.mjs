#!/usr/bin/env node
/**
 * The release identity lives in `package.json` and nowhere else.
 *
 * `version` is the release date, one release per day: `2026.11.20` is the
 * release of 20 November 2026. Month and day are unpadded because semver
 * forbids leading zeroes — `semver.valid("2026.11.05")` is `null`, and
 * `npm version 2026.11.05` quietly rewrites it to `2026.11.5`.
 *
 * Everything downstream reads that one value: the git tag, the GHCR image tag,
 * the flatpak bundle name, the AppStream release entry and the writer stamp
 * baked into the build (see `src/lib/writerVersion.js`).
 *
 *   check           validate package.json and package-lock.json (the CI gate)
 *   bump            set today's UTC date as the version
 *   stamp-flatpak   insert the current release into the AppStream metainfo
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const METAINFO_PATH = join("flatpak", "com.besoeasy.gupt.metainfo.xml");

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
    errors.push(`package-lock.json packages[""].version '${lockedRoot}' does not match '${version}'`);
  }

  // Flathub builds the committed metainfo, so a release that skipped
  // `npm run release:metainfo` would ship an app listing the previous version.
  const listed = listedRelease(readFileSync(join(root, METAINFO_PATH), "utf-8"));
  if (!listed) {
    errors.push(`metainfo lists no <release> — run npm run release:metainfo`);
  } else if (listed.version !== version) {
    errors.push(`metainfo lists ${listed.version} — run npm run release:metainfo`);
  } else if (listed.date !== release.date) {
    errors.push(`metainfo dates ${version} as ${listed.date}, expected ${release.date}`);
  }
  return errors;
}

/** The first release entry in the AppStream file, or null. */
function listedRelease(xml) {
  const match = /<releases>[\s\S]*?<release version="([^"]+)"(?:\s+date="([^"]+)")?/.exec(xml);
  return match ? { version: match[1], date: match[2] } : null;
}

/**
 * Put the current release at the top of the AppStream release list, so the
 * metainfo is never a second place a version is typed by hand.
 */
export function stampMetainfo(xml, version) {
  const release = parseRelease(version);
  if (!release) throw new Error(`'${version}' is not a release date`);

  const openTag = "<releases>";
  const open = xml.indexOf(openTag);
  if (open === -1) throw new Error("metainfo has no <releases> block");

  const first = xml.indexOf("<release ", open);
  if (first !== -1) {
    const tagEnd = xml.indexOf(">", first) + 1;
    const startTag = xml.slice(first, tagEnd);
    const stampedVersion = /version="([^"]+)"/.exec(startTag)?.[1];
    if (stampedVersion === version) {
      const stampedDate = /date="([^"]+)"/.exec(startTag)?.[1];
      if (stampedDate === release.date) return xml;
      const fixed = startTag.replace(/date="[^"]*"/, `date="${release.date}"`);
      return xml.slice(0, first) + fixed + xml.slice(tagEnd);
    }
  }

  const entry = `    <release version="${version}" date="${release.date}"/>`;
  const head = xml.slice(0, open + openTag.length);
  const tail = xml.slice(open + openTag.length).replace(/^\n/, "");
  return `${head}\n${entry}\n${tail}`;
}

/** Write the current release into the AppStream file. Returns the version stamped, or null. */
function stampFlatpak(root) {
  const { version } = readJson(join(root, "package.json"));
  const file = join(root, METAINFO_PATH);
  const xml = readFileSync(file, "utf-8");
  const stamped = stampMetainfo(xml, version);
  if (stamped === xml) return null;
  writeFileSync(file, stamped);
  return version;
}

function main(argv) {
  const [command] = argv;
  const root = process.cwd();

  if (command === "check") {
    const { version } = readJson(join(root, "package.json"));
    const errors = checkVersion(root);
    if (errors.length) {
      for (const error of errors) console.error(`::error::${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`release ${version} (${parseRelease(version).date}) is valid`);
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
    stampFlatpak(root);
    console.log(
      `\nRelease is ${version}: package.json, package-lock.json and the flatpak metainfo are in step.` +
        `\nCommit them, then tag ${version}.`,
    );
    return;
  }

  if (command === "stamp-flatpak") {
    const stamped = stampFlatpak(root);
    console.log(stamped ? `metainfo now lists ${stamped}` : "metainfo is already current");
    return;
  }

  console.error("usage: node scripts/release.mjs <check|bump|stamp-flatpak>");
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
