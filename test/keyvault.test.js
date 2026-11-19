import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "fake-indexeddb/auto";

// The cache module reads a localStorage registry; give it a minimal one so it
// can be imported in Node the same way test/idb-cache.test.js does.
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

const keyVault = await import("../src/lib/keyVault.js");
const { generateKeypair } = await import("../src/lib/crypto.js");
const { deleteCacheDatabase, sweepOldCacheDbs, clearAllCaches, CACHE_DB_REGISTRY_KEY } =
  await import("../src/lib/idb.js");

const VAULT_RECORD_ID = "device";

function openRawVault() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(keyVault.VAULT_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("vault")) req.result.createObjectStore("vault");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readRawRecord() {
  const db = await openRawVault();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("vault", "readonly");
      const req = tx.objectStore("vault").get(VAULT_RECORD_ID);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function writeRawRecord(record) {
  const db = await openRawVault();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite");
      tx.objectStore("vault").put(record, VAULT_RECORD_ID);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function deleteDatabase(name) {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
}

beforeEach(async () => {
  await keyVault.forget();
  await deleteDatabase(keyVault.VAULT_DB_NAME);
});

after(async () => {
  await keyVault.forget();
});

test("the vault database is outside the disposable cache namespace", async () => {
  assert.equal(keyVault.VAULT_DB_NAME, "gupt_vault_v1");
  assert.ok(!keyVault.VAULT_DB_NAME.startsWith("gupt_cache_"));

  const registry = JSON.parse(globalThis.localStorage.getItem(CACHE_DB_REGISTRY_KEY) || "[]");
  assert.ok(!registry.includes(keyVault.VAULT_DB_NAME));

  // One-way dependency: key code must not reach the cache module, or it would
  // be bundled into the replication and Rabta sync workers.
  const vaultSource = await readFile(new URL("../src/lib/keyVault.js", import.meta.url), "utf8");
  const idbSource = await readFile(new URL("../src/lib/idb.js", import.meta.url), "utf8");
  assert.ok(!/from\s+["']\.\/idb(\.js)?["']/.test(vaultSource));
  assert.ok(!/keyVault/.test(idbSource));
});

test("save() stores a non-extractable wrapper key and open() unwraps the same account", async () => {
  const { privkeyHex, pubkeyHex } = generateKeypair();

  assert.equal(await keyVault.save(privkeyHex, pubkeyHex, 30), true);

  const record = await readRawRecord();
  assert.equal(record.pubkeyHex, pubkeyHex);
  assert.ok(record.deviceKey, "the wrapper CryptoKey is stored with the record");
  assert.equal(record.deviceKey.extractable, false);

  // The browser refuses to hand out the wrapper key's bytes, which is the whole
  // point of the design.
  await assert.rejects(() => crypto.subtle.exportKey("raw", record.deviceKey));

  const opened = await keyVault.open();
  assert.ok(opened);
  assert.equal(opened.privkeyHex, privkeyHex);
  assert.equal(opened.pubkeyHex, pubkeyHex);
  assert.equal(opened.ttlHours, 30);
});

test("save() refuses malformed key material instead of writing junk", async () => {
  assert.equal(await keyVault.save("", ""), false);
  assert.equal(await keyVault.save("zz".repeat(32), "aa".repeat(32)), false);
  assert.equal(await readRawRecord(), null);
});

test("open() deletes a vault older than its TTL", async () => {
  const { privkeyHex, pubkeyHex } = generateKeypair();
  await keyVault.save(privkeyHex, pubkeyHex, 1);

  const record = await readRawRecord();
  record.lastSeenAt = Date.now() - 2 * 60 * 60 * 1000; // 2h ago, TTL is 1h
  await writeRawRecord(record);

  assert.equal(await keyVault.open(), null);
  assert.equal(await readRawRecord(), null, "an expired vault is deleted, not retried");
});

test("open() tolerates a backwards clock change and trips on a long forward jump", async () => {
  const { privkeyHex, pubkeyHex } = generateKeypair();
  await keyVault.save(privkeyHex, pubkeyHex, 30);

  // Clock moved back: lastSeenAt appears to be in the future. Must not expire.
  let record = await readRawRecord();
  record.lastSeenAt = Date.now() + 5 * 60 * 60 * 1000;
  await writeRawRecord(record);
  assert.ok(await keyVault.open());

  // Clock moved far forward, or the app was simply not opened for a long time.
  record = await readRawRecord();
  record.lastSeenAt = Date.now() - 31 * 60 * 60 * 1000;
  await writeRawRecord(record);
  assert.equal(await keyVault.open(), null);
});

test("open() fails closed when the ciphertext is tampered with", async () => {
  const { privkeyHex, pubkeyHex } = generateKeypair();
  await keyVault.save(privkeyHex, pubkeyHex);

  const record = await readRawRecord();
  record.ct[0] ^= 0xff;
  await writeRawRecord(record);

  assert.equal(await keyVault.open(), null);
  assert.equal(await readRawRecord(), null);
});

test("open() refuses a record whose pubkey was swapped", async () => {
  const first = generateKeypair();
  const second = generateKeypair();
  await keyVault.save(first.privkeyHex, first.pubkeyHex);

  const record = await readRawRecord();
  // Keep the ciphertext (bound to the original pubkey via AAD) but claim it is
  // someone else's account: decryption must fail.
  record.pubkeyHex = second.pubkeyHex;
  await writeRawRecord(record);

  assert.equal(await keyVault.open(), null);
});

test("a fresh login wipe (wipeAllCachesForFreshLogin) leaves the vault intact", async () => {
  const { wipeAllCachesForFreshLogin } = await import("../src/lib/cacheWipe.js");
  const { privkeyHex, pubkeyHex } = generateKeypair();
  await keyVault.save(privkeyHex, pubkeyHex);

  await wipeAllCachesForFreshLogin();

  const opened = await keyVault.open();
  assert.ok(opened, "a new login must not erase the remembered device");
  assert.equal(opened.privkeyHex, privkeyHex);
});

test("the vault survives deleting, sweeping and clearing the cache database", async () => {
  const { privkeyHex, pubkeyHex } = generateKeypair();
  await keyVault.save(privkeyHex, pubkeyHex);

  await deleteCacheDatabase();
  assert.ok(await keyVault.open(), "deleteCacheDatabase() must not touch gupt_vault_v1");

  await sweepOldCacheDbs();
  assert.ok(await keyVault.open(), "sweepOldCacheDbs() must not touch gupt_vault_v1");

  await clearAllCaches();
  const opened = await keyVault.open();
  assert.ok(opened, "clearAllCaches() must not touch gupt_vault_v1");
  assert.equal(opened.privkeyHex, privkeyHex);
});

test("a SCHEMA_EPOCH bump (old cache database swept) leaves the vault intact", async () => {
  const { privkeyHex, pubkeyHex } = generateKeypair();
  await keyVault.save(privkeyHex, pubkeyHex);

  await new Promise((resolve) => {
    const req = indexedDB.open("gupt_cache_2025_01", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("meta");
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = resolve;
  });

  const swept = await sweepOldCacheDbs();
  assert.ok(swept.includes("gupt_cache_2025_01"));
  assert.ok(await keyVault.open());
});

test("forget() removes the wrapper key and the database", async () => {
  const { privkeyHex, pubkeyHex } = generateKeypair();
  await keyVault.save(privkeyHex, pubkeyHex);

  assert.equal(await keyVault.forget(), true);
  assert.equal(await readRawRecord(), null);
  assert.equal(await keyVault.open(), null);
});

test("touch() writes at most once per throttle window and keeps the record valid", async () => {
  const { privkeyHex, pubkeyHex } = generateKeypair();
  await keyVault.save(privkeyHex, pubkeyHex);

  const before = (await readRawRecord()).lastSeenAt;
  // save() just ran, so the throttle suppresses this write.
  assert.equal(await keyVault.touch(), false);
  assert.equal((await readRawRecord()).lastSeenAt, before);
  assert.ok(await keyVault.open());
});
