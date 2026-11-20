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
  SCHEMA_FINGERPRINT,
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

// Names are layout hashes (`gupt_cache_<8 hex>`), not epochs: a date-shaped
// fixture here would suggest an ordering the naming scheme does not have. The
// current one is the real derived name, so it can never go stale.
const CURRENT = `gupt_cache_${SCHEMA_FINGERPRINT}`;
const OLD_A = "gupt_cache_1a2b3c4d";
const OLD_B = "gupt_cache_9f8e7d6c";

test("selectStaleCacheDbNames keeps the current cache and ignores other databases", () => {
  const names = [CURRENT, OLD_A, OLD_B, "other_app_db", null, 42];
  assert.deepEqual(selectStaleCacheDbNames(names, CURRENT), [OLD_A, OLD_B]);
  assert.deepEqual(selectStaleCacheDbNames([], CURRENT), []);
});

test("sweepOldCacheDbs deletes every gupt_cache_* database except the current one", async () => {
  const deleted = [];
  globalThis.indexedDB = {
    async databases() {
      return [{ name: CURRENT }, { name: OLD_A }, { name: OLD_B }, { name: "unrelated_db" }];
    },
    deleteDatabase(name) {
      deleted.push(name);
      const req = {};
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
  };

  const removed = await sweepOldCacheDbs(CURRENT);
  assert.deepEqual(removed.sort(), [OLD_A, OLD_B]);
  assert.deepEqual(deleted.sort(), [OLD_A, OLD_B]);
});

test("the cache database registry keeps only the newest four layouts", () => {
  const names = [
    "gupt_cache_11111111",
    "gupt_cache_22222222",
    "gupt_cache_33333333",
    "gupt_cache_44444444",
    "gupt_cache_55555555",
    "gupt_cache_66666666",
  ];
  assert.deepEqual(trimCacheDbRegistry(names, "gupt_cache_66666666"), [
    "gupt_cache_33333333",
    "gupt_cache_44444444",
    "gupt_cache_55555555",
    "gupt_cache_66666666",
  ]);

  // The current name survives even when it is not among the newest entries.
  const kept = trimCacheDbRegistry(names, "gupt_cache_11111111");
  assert.equal(kept.length, 4);
  assert.ok(kept.includes("gupt_cache_11111111"));

  assert.deepEqual(trimCacheDbRegistry([], CURRENT), []);
  assert.deepEqual(trimCacheDbRegistry([CURRENT], CURRENT), [CURRENT]);
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
  const old = ["gupt_cache_aaaa1111", "gupt_cache_bbbb2222", "gupt_cache_cccc3333"];
  localStorage.setItem(CACHE_DB_REGISTRY_KEY, JSON.stringify([...old, CURRENT]));

  await sweepOldCacheDbs(CURRENT);

  assert.deepEqual(JSON.parse(localStorage.getItem(CACHE_DB_REGISTRY_KEY)), [CURRENT]);
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
  localStorage.setItem("gupt_cache_db_names", `["${CURRENT}"]`);
  localStorage.setItem("unrelated", "1");

  clearLocalCache();

  assert.equal(localStorage.getItem("gupt-theme"), "dark");
  assert.equal(localStorage.getItem(OUTBOX_KEY), '{"owner":"aa","entries":[]}');
  assert.equal(localStorage.getItem("gupt_cache_db_names"), `["${CURRENT}"]`);
  assert.equal(localStorage.getItem("unrelated"), null);
});

test("deleteIdbByName is best-effort: a blocked or failed delete never rejects", async () => {
  const outcomes = [];
  for (const finish of ["onsuccess", "onerror", "onblocked"]) {
    globalThis.indexedDB = {
      deleteDatabase() {
        const req = {};
        queueMicrotask(() => req[finish]?.());
        return req;
      },
    };
    const { sweepOldCacheDbs: sweep } = await import("../src/lib/idb.js");
    globalThis.indexedDB.databases = async () => [{ name: OLD_A }];
    outcomes.push(await sweep(CURRENT));
  }
  assert.deepEqual(outcomes, [[OLD_A], [OLD_A], [OLD_A]]);
  globalThis.indexedDB = {
    deleteDatabase() {
      throw new Error("denied");
    },
    databases: async () => [{ name: OLD_B }],
  };
  const { sweepOldCacheDbs: sweepAgain } = await import("../src/lib/idb.js");
  assert.deepEqual(await sweepAgain(CURRENT), [OLD_B]);
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
