import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkVersion, expiredShims, parseRelease, releaseOf } from "../scripts/release.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function fakeTree(version, lockVersion = version) {
  const root = mkdtempSync(join(tmpdir(), "gupt-release-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "gupt", version }));
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({ version: lockVersion, packages: { "": { version: lockVersion } } }),
  );
  return root;
}

test("a release is a date, with no leading zeroes", () => {
  assert.deepEqual(parseRelease("2026.11.20"), {
    year: 2026,
    month: 11,
    day: 20,
    date: "2026-11-20",
  });
  assert.equal(parseRelease("2026.1.4").date, "2026-01-04");
  assert.equal(parseRelease("2027.12.31").date, "2027-12-31");
});

test("the padded form is rejected — it is not valid semver", () => {
  for (const bad of ["2026.11.05", "2026.06.20", "2026.1120", "2026.1120.1", "2026.13.1"]) {
    assert.equal(parseRelease(bad), null, `${bad} must not parse`);
  }
});

test("impossible and malformed dates are rejected", () => {
  for (const bad of ["2026.2.30", "2026.2.29", "2026.0.1", "2026.11.0", "2026.11.32"]) {
    assert.equal(parseRelease(bad), null, `${bad} must not parse`);
  }
  assert.equal(parseRelease("2026.2.29"), null, "2026 is not a leap year");
  assert.equal(parseRelease("2028.2.29").date, "2028-02-29", "2028 is");
  for (const bad of ["", null, undefined, "v2026.11.20", "2026-11-20", "release-2026"]) {
    assert.equal(parseRelease(bad), null, `${bad} must not parse`);
  }
});

test("today's release is the UTC date, unpadded", () => {
  assert.equal(releaseOf(new Date("2026-11-20T23:30:00Z")), "2026.11.20");
  assert.equal(releaseOf(new Date("2026-01-05T00:10:00Z")), "2026.1.5");
  assert.equal(releaseOf(new Date("2026-12-31T23:59:59Z")), "2026.12.31");
});

test("this tree is releasable, and the lockfile is held to it", () => {
  assert.deepEqual(checkVersion(ROOT), []);

  const drifted = fakeTree("2026.11.20", "2026.11.19");
  assert.equal(checkVersion(drifted).length, 2, "both lockfile version fields must agree");

  const badFormat = checkVersion(fakeTree("2026.11.05"));
  assert.equal(badFormat.length, 1);
  assert.match(badFormat[0], /not a release date/);
});

test("a shim past its date blocks the release, a live one does not", () => {
  // The one deadline nobody remembers: AGENTS.md says delete the old branch in
  // the next release instead of extending it, so the gate itself has to say so.
  const root = mkdtempSync(join(tmpdir(), "gupt-shims-"));
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  const shim = (date) =>
    `const a = 1;\n// COMPAT: remove after ${date} — legacy \`ttlHours\` field\nconst b = 2;\n`;
  writeFileSync(join(root, "src", "lib", "expired.js"), shim("2025-11-20"));
  writeFileSync(join(root, "src", "lib", "live.js"), shim("2099-01-01"));
  writeFileSync(join(root, "src", "lib", "undated.js"), "// COMPAT: remove after … — prose\n");

  const expired = expiredShims(root, new Date("2026-11-20T00:00:00Z"));
  assert.equal(expired.length, 1);
  assert.match(expired[0], /^src\/lib\/expired\.js:2 — shim expired 2025-11-20/);

  assert.deepEqual(expiredShims(root, new Date("2025-11-19T00:00:00Z")), [], "not yet due");
  assert.deepEqual(expiredShims(ROOT), [], "this tree ships no expired shim");
});
