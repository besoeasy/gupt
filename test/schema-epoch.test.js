import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { SCHEMA_EPOCH, STORE_SPECS } from "../src/lib/idb.js";

/**
 * Fingerprint of the store layout, recorded per epoch.
 *
 * The cache database is never migrated: a layout change opens a new database
 * name (`gupt_cache_<epoch>`) and sweeps the old one. That only works when the
 * epoch actually changes with the layout — forget it and existing users keep
 * the old database with a missing store, which passes on a fresh dev profile
 * and fails in the field.
 *
 * So: change `STORE_SPECS` ⇒ bump `SCHEMA_EPOCH` here and add its fingerprint.
 * The fingerprint is order-insensitive (stores and indexes are sorted), so
 * reordering declarations alone does not require a bump.
 */
const FINGERPRINTS = {
  "2026_12": "b13216e9fb538fd4",
};

function fingerprint(specs) {
  const canonical = Object.keys(specs)
    .sort()
    .map((storeName) => {
      const spec = specs[storeName];
      const indexes = (spec.indexes || [])
        .map((idx) => {
          const name = typeof idx === "string" ? idx : idx.name;
          const keyPath = typeof idx === "string" ? idx : idx.keyPath;
          const multiEntry = Boolean(idx?.options?.multiEntry);
          return `${name}|${keyPath}|${multiEntry}`;
        })
        .sort();
      return `${storeName}|${spec.keyPath}|[${indexes.join(",")}]`;
    })
    .join(";");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

test("a STORE_SPECS change must bump SCHEMA_EPOCH", () => {
  const actual = fingerprint(STORE_SPECS);
  const recorded = FINGERPRINTS[SCHEMA_EPOCH];

  assert.ok(
    recorded,
    `SCHEMA_EPOCH "${SCHEMA_EPOCH}" has no recorded fingerprint. Add ` +
      `"${actual}" for it in test/schema-epoch.test.js.`,
  );
  assert.equal(
    actual,
    recorded,
    `STORE_SPECS changed but SCHEMA_EPOCH is still "${SCHEMA_EPOCH}". ` +
      `Bump SCHEMA_EPOCH in src/lib/idb.js (a new database name opens fresh and ` +
      `sweeps the old one) and record "${actual}" for the new epoch.`,
  );
});

test("the epoch names a database that differs from its predecessor", () => {
  assert.match(
    SCHEMA_EPOCH,
    /^\d{4}_\d{2}$/,
    "epoch is YYYY_MM; anything else and the sweep registry cannot order names",
  );
});
