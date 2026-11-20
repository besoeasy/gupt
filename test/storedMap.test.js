import test from "node:test";
import assert from "node:assert/strict";

import { readStoredMap, writeStoredMap, STORED_MAP_VERSION } from "../src/lib/storedMap.js";
import { WRITER_VERSION } from "../src/lib/writerVersion.js";

function installStorage(entries = {}) {
  const store = new Map(Object.entries(entries));
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return store;
}

test("writeStoredMap writes a versioned header around the entries", () => {
  const store = installStorage();
  writeStoredMap("gupt_test_map", { abc: { ttlSec: 60 } });

  const raw = JSON.parse(store.get("gupt_test_map"));
  assert.equal(raw.v, STORED_MAP_VERSION);
  assert.equal(raw.w, WRITER_VERSION);
  assert.deepEqual(raw.data, { abc: { ttlSec: 60 } });
  assert.deepEqual(readStoredMap("gupt_test_map"), { abc: { ttlSec: 60 } });
});

test("readStoredMap repairs a map written by an older release", () => {
  const store = installStorage({
    gupt_test_map: JSON.stringify({ v: 1, w: "2020.101.1", data: { abc: { ttlSec: 60 } } }),
  });

  const data = readStoredMap("gupt_test_map");
  assert.deepEqual(data, { abc: { ttlSec: 60 } }, "entries survive the repair");

  const raw = JSON.parse(store.get("gupt_test_map"));
  assert.equal(raw.w, WRITER_VERSION, "stamp moves to the current build");
  assert.deepEqual(raw.data, { abc: { ttlSec: 60 } });
});

test("readStoredMap tolerates missing and corrupt values", () => {
  installStorage({ gupt_bad: "{not json" });
  assert.deepEqual(readStoredMap("gupt_missing"), {});
  assert.deepEqual(readStoredMap("gupt_bad"), {});
});
