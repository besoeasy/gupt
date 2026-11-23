import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "fake-indexeddb/auto";

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
  listOutboxEvents,
  completeOutboxEvent,
  scheduleOutboxRetry,
  getOutboxSnapshot,
  putRawEvent,
  ensureDbOwner,
  SCHEMA_FINGERPRINT,
} = await import("../src/lib/idb.js");

// Sweep tests below swap in mock indexedDB factories; the queue tests need the
// real (fake) one back.
const realIndexedDB = globalThis.indexedDB;
function useRealIndexedDb() {
  globalThis.indexedDB = realIndexedDB;
}

const OUTBOX_KEY = "gupt_outbox_v1";

function outboxRow(id, pubkey = "aa") {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    id,
    pubkey,
    kind: 1,
    origin: "dm",
    createdAt: Date.now(),
    expiresAt: Number.MAX_SAFE_INTEGER,
    lastReplicatedAt: 0,
    syncAttempts: 0,
    event: { id, pubkey, kind: 1, created_at: nowSec, content: `payload-${id}` },
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

test("outbox queue is capped, newest-first, and dedupes by event id", async () => {
  useRealIndexedDb();
  await setOutboxOwner("aa");
  await clearOutboxQueue();
  for (let i = 0; i < 260; i += 1) await queueOutboxEvent(outboxRow(`e${i}`));

  const size = await outboxQueueSize();
  assert.equal(size.entries, 200);

  const ids = (await listOutboxEvents(200)).map((entry) => entry.id);
  assert.equal(ids.length, 200);
  // Strictly increasing stamps make eviction exact: the first 60 are gone.
  for (let i = 0; i < 60; i += 1) assert.ok(!ids.includes(`e${i}`), `e${i} evicted`);
  for (let i = 60; i < 260; i += 1) assert.ok(ids.includes(`e${i}`), `e${i} kept`);

  await queueOutboxEvent(outboxRow("e259"));
  assert.equal((await outboxQueueSize()).entries, 200);
  const again = (await listOutboxEvents(200)).map((entry) => entry.id);
  assert.equal(again.filter((id) => id === "e259").length, 1);
});

test("dequeueOutboxEvents removes acked events and leaves the rest queued", async () => {
  useRealIndexedDb();
  await setOutboxOwner("aa");
  await clearOutboxQueue();
  await queueOutboxEvent(outboxRow("a"));
  await queueOutboxEvent(outboxRow("b"));
  await queueOutboxEvent(outboxRow("c"));

  await dequeueOutboxEvents(["b", "missing"]);
  const ids = (await listOutboxEvents(200)).map((entry) => entry.id).sort();
  assert.deepEqual(ids, ["a", "c"]);
});

test("queued outbox entries are dropped when the account changes", async () => {
  useRealIndexedDb();
  await clearOutboxQueue();
  await setOutboxOwner("aa");
  await queueOutboxEvent(outboxRow("a", "aa"));
  assert.equal((await outboxQueueSize()).entries, 1);
  assert.equal((await outboxQueueSize()).owner, "aa");

  await setOutboxOwner("bb");
  const size = await outboxQueueSize();
  assert.equal(size.entries, 0);
  assert.equal(size.owner, "bb");
});

test("a stale pre-queue localStorage box is ignored, never resurrected", async () => {
  useRealIndexedDb();
  await setOutboxOwner("aa");
  await clearOutboxQueue();
  localStorage.setItem(
    OUTBOX_KEY,
    JSON.stringify({
      owner: "aa",
      entries: [{ id: "ghost", pubkey: "aa", event: { id: "ghost" } }],
    }),
  );
  await queueOutboxEvent(outboxRow("live"));

  const ids = (await listOutboxEvents(200)).map((entry) => entry.id);
  assert.deepEqual(ids, ["live"]);
  // Untouched: no migration owns this key anymore.
  assert.ok(JSON.parse(localStorage.getItem(OUTBOX_KEY)).entries.length === 1);
  localStorage.removeItem(OUTBOX_KEY);
});

test("outbox due filtering, retries and completion", async () => {
  useRealIndexedDb();
  await setOutboxOwner("cc");
  await clearOutboxQueue();
  await queueOutboxEvent(outboxRow("q1"));
  await queueOutboxEvent(outboxRow("q2"));

  assert.deepEqual((await listOutboxEvents(10)).map((row) => row.id).sort(), ["q1", "q2"]);

  // Deferred rows leave the drain cursor until they are due.
  await scheduleOutboxRetry("q1", { nextDue: Date.now() + 60_000 });
  assert.deepEqual(
    (await listOutboxEvents(10)).map((row) => row.id),
    ["q2"],
  );

  let snap = await getOutboxSnapshot({});
  assert.equal(snap.inFlight, 1, "q2 has not been attempted");
  assert.equal(snap.retryPending, 1, "q1 is waiting for its next pass");
  assert.equal(snap.failed, 0);

  await scheduleOutboxRetry("q2", { nextDue: Date.now() + 60_000, error: "no relay ack" });
  snap = await getOutboxSnapshot({});
  assert.equal(snap.inFlight, 0);
  assert.equal(snap.retryPending, 2);
  assert.equal(snap.failed, 0);

  // Completing one row removes it and leaves the other retrying.
  await completeOutboxEvent("q1");
  snap = await getOutboxSnapshot({});
  assert.equal(snap.retryPending, 1);
  assert.deepEqual(
    (await listOutboxEvents(10)).map((row) => row.id),
    [],
    "both rows are deferred until their next due time",
  );
});

test("putRawEvent queues self-authored rows; inbound rows stay out", async () => {
  useRealIndexedDb();
  await ensureDbOwner("dd");
  await clearOutboxQueue();
  const nowSec = Math.floor(Date.now() / 1000);
  await putRawEvent(
    {
      id: "self1",
      pubkey: "dd",
      kind: 4,
      created_at: nowSec,
      tags: [["expiration", String(nowSec + 3600)]],
      data: {},
    },
    "dm",
    { peerPubkey: "ee", roomId: "room-de", type: "text" },
  );
  await putRawEvent(
    {
      id: "in1",
      pubkey: "ee",
      kind: 4,
      created_at: nowSec,
      tags: [["expiration", String(nowSec + 3600)]],
      data: {},
    },
    "dm",
    { peerPubkey: "dd", roomId: "room-de", type: "text" },
  );

  const due = await listOutboxEvents(10, { origins: ["dm"] });
  assert.deepEqual(
    due.map((row) => row.id),
    ["self1"],
  );
  assert.deepEqual(await listOutboxEvents(10, { origins: ["group"] }), []);
});

test("clearLocalCache keeps the theme and cache registry; the outbox lives in IndexedDB now", async () => {
  const { clearLocalCache } = await import("../src/lib/cacheWipe.js");
  localStorage.clear();
  localStorage.setItem("gupt-theme", "dark");
  localStorage.setItem("gupt_cache_db_names", `["${CURRENT}"]`);
  localStorage.setItem("unrelated", "1");

  clearLocalCache();

  assert.equal(localStorage.getItem("gupt-theme"), "dark");
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
