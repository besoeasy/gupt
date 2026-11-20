import test from "node:test";
import assert from "node:assert/strict";

import { SCHEMA_FINGERPRINT, STORE_SPECS, schemaFingerprintOf } from "../src/lib/idb.js";

/**
 * The cache database name is derived from `STORE_SPECS`, so there is nothing to
 * bump by hand: a real layout change opens a fresh database and the old one is
 * swept. These tests pin the two properties that make that safe — a changed
 * layout must change the name, and a cosmetic reorder must not.
 */
test("the fingerprint is derived from the store layout", () => {
  assert.match(SCHEMA_FINGERPRINT, /^[0-9a-f]{8}$/);
  assert.equal(schemaFingerprintOf(STORE_SPECS), SCHEMA_FINGERPRINT);
});

test("reordering stores and indexes keeps the same database", () => {
  const reversed = {};
  for (const name of Object.keys(STORE_SPECS).reverse()) {
    const spec = STORE_SPECS[name];
    reversed[name] = { ...spec, indexes: [...(spec.indexes || [])].reverse() };
  }
  assert.equal(schemaFingerprintOf(reversed), SCHEMA_FINGERPRINT);
});

test("any real layout change produces a new database name", () => {
  const withExtraStore = { ...STORE_SPECS, scratch: { keyPath: "id", indexes: [] } };
  assert.notEqual(schemaFingerprintOf(withExtraStore), SCHEMA_FINGERPRINT);

  const withExtraIndex = {
    ...STORE_SPECS,
    meta: {
      ...STORE_SPECS.meta,
      indexes: [{ name: "updatedAt", keyPath: "updatedAt" }],
    },
  };
  assert.notEqual(schemaFingerprintOf(withExtraIndex), SCHEMA_FINGERPRINT);

  const withMovedKeyPath = {
    ...STORE_SPECS,
    meta: { ...STORE_SPECS.meta, keyPath: "id" },
  };
  assert.notEqual(schemaFingerprintOf(withMovedKeyPath), SCHEMA_FINGERPRINT);

  const withMultiEntry = {
    ...STORE_SPECS,
    messageSearch: {
      ...STORE_SPECS.messageSearch,
      indexes: STORE_SPECS.messageSearch.indexes.map((idx) =>
        idx.name === "tokens" ? { ...idx, options: { multiEntry: false } } : idx,
      ),
    },
  };
  assert.notEqual(schemaFingerprintOf(withMultiEntry), SCHEMA_FINGERPRINT);
});
