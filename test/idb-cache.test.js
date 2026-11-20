import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Minimal localStorage so the cache module can be imported in Node.
globalThis.localStorage = (() => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
})();

const {
  selectStaleCacheDbNames,
  trimCacheDbRegistry,
  planLruEviction,
  sweepOldCacheDbs,
  queueOutboxEvent,
  dequeueOutboxEvents,
  clearOutboxQueue,
  outboxQueueSize,
  setOutboxOwner,
} = await import("../src/lib/idb.js");

const OUTBOX_KEY = "gupt_outbox_v1";

function outboxRow(id, pubkey = "aa") {
  return {
    id,
    pubkey,
    kind: 1,
    origin: "dm",
    createdAt: 1,
    expiresAt: Number.MAX_SAFE_INTEGER,
    lastReplicatedAt: 0,
    syncAttempts: 0,
    event: { id, pubkey, kind: 1, created_at: 1, content: `payload-${id}` },
  };
}

test("selectStaleCacheDbNames keeps the current cache and ignores other databases", () => {
  const names = [
    "gupt_cache_2026_11",
    "gupt_cache_2025_01",
    "gupt_cache_legacy",
    "other_app_db",
    null,
    42,
  ];
  assert.deepEqual(selectStaleCacheDbNames(names, "gupt_cache_2026_11"), [
    "gupt_cache_2025_01",
    "gupt_cache_legacy",
  ]);
  assert.deepEqual(selectStaleCacheDbNames([], "gupt_cache_2026_11"), []);
});

test("sweepOldCacheDbs deletes every gupt_cache_* database except the current one", async () => {
  const deleted = [];
  globalThis.indexedDB = {
    async databases() {
      return [
        { name: "gupt_cache_2026_11" },
        { name: "gupt_cache_2025_01" },
        { name: "gupt_cache_legacy" },
        { name: "unrelated_db" },
      ];
    },
    deleteDatabase(name) {
      deleted.push(name);
      const req = {};
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
  };

  const removed = await sweepOldCacheDbs("gupt_cache_2026_11");
  assert.deepEqual(removed.sort(), ["gupt_cache_2025_01", "gupt_cache_legacy"]);
  assert.deepEqual(deleted.sort(), ["gupt_cache_2025_01", "gupt_cache_legacy"]);
});

test("the cache database registry keeps only the newest four epochs", () => {
  const names = [
    "gupt_cache_2025_01",
    "gupt_cache_2025_07",
    "gupt_cache_2026_01",
    "gupt_cache_2026_05",
    "gupt_cache_2026_09",
    "gupt_cache_2026_12",
  ];
  assert.deepEqual(trimCacheDbRegistry(names, "gupt_cache_2026_12"), [
    "gupt_cache_2026_01",
    "gupt_cache_2026_05",
    "gupt_cache_2026_09",
    "gupt_cache_2026_12",
  ]);

  // The current name survives even when it is not among the newest entries.
  const kept = trimCacheDbRegistry(names, "gupt_cache_2025_01");
  assert.equal(kept.length, 4);
  assert.ok(kept.includes("gupt_cache_2025_01"));

  assert.deepEqual(trimCacheDbRegistry([], "gupt_cache_2026_12"), []);
  assert.deepEqual(trimCacheDbRegistry(["gupt_cache_2026_12"], "gupt_cache_2026_12"), [
    "gupt_cache_2026_12",
  ]);
});

test("a sweep prunes the registry instead of letting it accumulate", async () => {
  globalThis.indexedDB = {
    async databases() {
      return [];
    },
    deleteDatabase() {
      const req = {};
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
  };
  const { CACHE_DB_REGISTRY_KEY } = await import("../src/lib/idb.js");
  const old = ["gupt_cache_2024_01", "gupt_cache_2025_01", "gupt_cache_2025_07"];
  localStorage.setItem(CACHE_DB_REGISTRY_KEY, JSON.stringify([...old, "gupt_cache_2026_12"]));

  await sweepOldCacheDbs("gupt_cache_2026_12");

  assert.deepEqual(JSON.parse(localStorage.getItem(CACHE_DB_REGISTRY_KEY)), ["gupt_cache_2026_12"]);
});

test("planLruEviction trims the oldest entries until the shared budget fits", () => {
  const entries = [
    { key: "new", table: "mediaCache", size: 40, lastAccessedAt: 300 },
    { key: "old", table: "engineBlobs", size: 50, lastAccessedAt: 100 },
    { key: "mid", table: "mediaCache", size: 30, lastAccessedAt: 200 },
  ];

  assert.deepEqual(
    planLruEviction(entries, 100).map((entry) => entry.key),
    ["old"],
  );
  assert.deepEqual(
    planLruEviction(entries, 60).map((entry) => entry.key),
    ["old", "mid"],
  );
  assert.deepEqual(planLruEviction(entries, 1000), []);
  // The source list is not mutated.
  assert.deepEqual(
    entries.map((entry) => entry.key),
    ["new", "old", "mid"],
  );
});

test("outbox queue is capped, newest-first, and dedupes by event id", () => {
  clearOutboxQueue();
  for (let i = 0; i < 260; i += 1) queueOutboxEvent(outboxRow(`e${i}`));

  const size = outboxQueueSize();
  assert.equal(size.entries, 200);

  const box = JSON.parse(localStorage.getItem(OUTBOX_KEY));
  assert.equal(box.entries[0].id, "e60");
  assert.equal(box.entries.at(-1).id, "e259");

  queueOutboxEvent(outboxRow("e259"));
  assert.equal(outboxQueueSize().entries, 200);
  const ids = JSON.parse(localStorage.getItem(OUTBOX_KEY)).entries.map((entry) => entry.id);
  assert.equal(ids.filter((id) => id === "e259").length, 1);
});

test("dequeueOutboxEvents removes acked events and leaves the rest queued", () => {
  clearOutboxQueue();
  queueOutboxEvent(outboxRow("a"));
  queueOutboxEvent(outboxRow("b"));
  queueOutboxEvent(outboxRow("c"));

  dequeueOutboxEvents(["b", "missing"]);
  const ids = JSON.parse(localStorage.getItem(OUTBOX_KEY)).entries.map((entry) => entry.id);
  assert.deepEqual(ids, ["a", "c"]);
});

test("queued outbox entries are dropped when the account changes", () => {
  clearOutboxQueue();
  setOutboxOwner("aa");
  queueOutboxEvent(outboxRow("a", "aa"));
  assert.equal(outboxQueueSize().entries, 1);
  assert.equal(outboxQueueSize().owner, "aa");

  setOutboxOwner("bb");
  const size = outboxQueueSize();
  assert.equal(size.entries, 0);
  assert.equal(size.owner, "bb");
});

test("clearLocalCache keeps the outbox and cache registry", async () => {
  const { clearLocalCache } = await import("../src/lib/cacheWipe.js");
  localStorage.clear();
  localStorage.setItem("gupt-theme", "dark");
  localStorage.setItem(OUTBOX_KEY, '{"owner":"aa","entries":[]}');
  localStorage.setItem("gupt_cache_db_names", '["gupt_cache_2026_11"]');
  localStorage.setItem("unrelated", "1");

  clearLocalCache();

  assert.equal(localStorage.getItem("gupt-theme"), "dark");
  assert.equal(localStorage.getItem(OUTBOX_KEY), '{"owner":"aa","entries":[]}');
  assert.equal(localStorage.getItem("gupt_cache_db_names"), '["gupt_cache_2026_11"]');
  assert.equal(localStorage.getItem("unrelated"), null);
});

test("idb.js has no DB_VERSION or migration code left", async () => {
  const source = await readFile(new URL("../src/lib/idb.js", import.meta.url), "utf8");
  assert.ok(source.includes("schemaFingerprintOf(STORE_SPECS)"));
  assert.ok(source.includes("idb.open(APP_CACHE_DB_NAME)"));
  assert.ok(source.includes("database.onversionchange"));
  assert.equal(source.includes("DB_VERSION"), false);
  // Creation only: no reconciliation against an existing schema.
  assert.equal(source.includes("objectStoreNames.contains"), false);
});
