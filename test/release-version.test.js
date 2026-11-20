import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  METAINFO_PATH,
  checkVersion,
  parseRelease,
  releaseOf,
  stampMetainfo,
} from "../scripts/release.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function fakeTree(version, lockVersion = version, metainfoVersion = version) {
  const root = mkdtempSync(join(tmpdir(), "gupt-release-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "gupt", version }));
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({ version: lockVersion, packages: { "": { version: lockVersion } } }),
  );
  mkdirSync(join(root, "flatpak"), { recursive: true });
  writeFileSync(
    join(root, METAINFO_PATH),
    `<component><releases>\n    <release version="${metainfoVersion}" date="${parseRelease(metainfoVersion)?.date}"/>\n  </releases></component>`,
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

test("a release that skipped the metainfo stamp is refused", () => {
  const stale = checkVersion(fakeTree("2026.11.20", "2026.11.20", "2026.11.19"));
  assert.equal(stale.length, 1);
  assert.match(stale[0], /metainfo lists 2026\.11\.19 — run npm run release:metainfo/);
});

test("the AppStream entry follows package.json instead of being retyped", () => {
  const xml = `<component>
  <releases>
    <release version="5.0.0" date="2026-09-22">
      <description><p>older</p></description>
    </release>
  </releases>
</component>
`;
  const stamped = stampMetainfo(xml, "2026.11.20");
  assert.match(stamped, /<releases>\n {4}<release version="2026\.11\.20" date="2026-11-20"\/>/);
  assert.ok(stamped.includes(`<release version="5.0.0" date="2026-09-22">`), "history is kept");
  assert.equal(stampMetainfo(stamped, "2026.11.20"), stamped, "stamping twice changes nothing");

  const corrected = stampMetainfo(
    stamped.replace('date="2026-11-20"', 'date="2026-01-01"'),
    "2026.11.20",
  );
  assert.ok(corrected.includes('date="2026-11-20"'), "a hand-typed date is corrected");

  assert.throws(() => stampMetainfo("<component></component>", "2026.11.20"), /no <releases> block/);
});
