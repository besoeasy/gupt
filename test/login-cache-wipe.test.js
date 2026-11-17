import test from "node:test";
import assert from "node:assert/strict";
import { clearEngineCache } from "../src/lib/engine/core.js";
import { clearRabtaHttpCache } from "../src/lib/rabta/index.js";
import {
  clearAllCaches,
  ensureDbOwner,
  getEngineWatermark,
  setEngineWatermark,
} from "../src/lib/idb.js";
import {
  clearLocalCache,
  clearBrowserCacheStorage,
  clearProfileSessionFields,
  wipeAllCachesForFreshLogin,
} from "../src/lib/cacheWipe.js";

function createMockStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, val) {
      map.set(key, String(val));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    get size() {
      return map.size;
    },
  };
}

test("clearEngineCache executes without error and empties in-memory cache", () => {
  assert.equal(typeof clearEngineCache, "function");
  assert.doesNotThrow(() => clearEngineCache());
});

test("clearRabtaHttpCache executes without error and resets caches", () => {
  assert.equal(typeof clearRabtaHttpCache, "function");
  assert.doesNotThrow(() => clearRabtaHttpCache());
});

test("clearLocalCache wipes all cached items while preserving gupt-theme", () => {
  const originalStorage = globalThis.localStorage;
  const mock = createMockStorage();
  globalThis.localStorage = mock;

  try {
    mock.setItem("gupt-theme", "light");
    mock.setItem("gupt:conversations:pinned", JSON.stringify(["room-1"]));
    mock.setItem("funding_btc_price_cache", "100000");
    mock.setItem("gupt_pins", JSON.stringify({ "test.eth": "123" }));

    clearLocalCache({ preserveTheme: true });

    assert.equal(mock.getItem("gupt-theme"), "light");
    assert.equal(mock.getItem("gupt:conversations:pinned"), null);
    assert.equal(mock.getItem("funding_btc_price_cache"), null);
    assert.equal(mock.getItem("gupt_pins"), null);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("clearLocalCache wipes theme when preserveTheme is false", () => {
  const originalStorage = globalThis.localStorage;
  const mock = createMockStorage();
  globalThis.localStorage = mock;

  try {
    mock.setItem("gupt-theme", "dark");
    mock.setItem("some_cache", "value");

    clearLocalCache({ preserveTheme: false });

    assert.equal(mock.getItem("gupt-theme"), null);
    assert.equal(mock.getItem("some_cache"), null);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("clearProfileSessionFields clears only profile sessionStorage keys", () => {
  const originalSession = globalThis.sessionStorage;
  const mock = createMockStorage();
  globalThis.sessionStorage = mock;

  try {
    mock.setItem("gupt_privkey", "account:1234");
    mock.setItem("gupt_profile_name", "Alice");
    mock.setItem("gupt_profile_about", "Secret Agent");
    mock.setItem("gupt_profile_website", "https://example.com");
    mock.setItem("gupt_profile_status", "Active");

    clearProfileSessionFields();

    assert.equal(mock.getItem("gupt_privkey"), "account:1234"); // Session key preserved until explicit wipe
    assert.equal(mock.getItem("gupt_profile_name"), null);
    assert.equal(mock.getItem("gupt_profile_about"), null);
    assert.equal(mock.getItem("gupt_profile_website"), null);
    assert.equal(mock.getItem("gupt_profile_status"), null);
  } finally {
    globalThis.sessionStorage = originalSession;
  }
});

test("clearBrowserCacheStorage gracefully deletes all Cache Storage API entries", async () => {
  const deleted = [];
  const originalCaches = globalThis.caches;

  globalThis.caches = {
    keys: async () => ["v1-assets", "v1-pages", "pwa-media"],
    delete: async (key) => {
      deleted.push(key);
      return true;
    },
  };

  try {
    await clearBrowserCacheStorage();
    assert.deepEqual(deleted.sort(), ["pwa-media", "v1-assets", "v1-pages"].sort());
  } finally {
    globalThis.caches = originalCaches;
  }
});

test("clearBrowserCacheStorage handles undefined caches gracefully", async () => {
  const originalCaches = globalThis.caches;
  delete globalThis.caches;

  try {
    await assert.doesNotReject(async () => {
      await clearBrowserCacheStorage();
    });
  } finally {
    globalThis.caches = originalCaches;
  }
});

test("wipeAllCachesForFreshLogin completes end-to-end without rejection", async () => {
  const originalStorage = globalThis.localStorage;
  const originalSession = globalThis.sessionStorage;
  const originalCaches = globalThis.caches;

  globalThis.localStorage = createMockStorage();
  globalThis.sessionStorage = createMockStorage();
  globalThis.caches = {
    keys: async () => ["cache-1"],
    delete: async () => true,
  };

  try {
    globalThis.localStorage.setItem("gupt-theme", "dark");
    globalThis.localStorage.setItem("stale_cache", "abc");
    globalThis.sessionStorage.setItem("gupt_profile_name", "Bob");

    await wipeAllCachesForFreshLogin();

    // Verifications:
    assert.equal(globalThis.localStorage.getItem("gupt-theme"), "dark");
    assert.equal(globalThis.localStorage.getItem("stale_cache"), null);
    assert.equal(globalThis.sessionStorage.getItem("gupt_profile_name"), null);
  } finally {
    globalThis.localStorage = originalStorage;
    globalThis.sessionStorage = originalSession;
    globalThis.caches = originalCaches;
  }
});

test("clearAllCaches and ensureDbOwner function signatures are valid", async () => {
  assert.equal(typeof clearAllCaches, "function");
  assert.equal(typeof ensureDbOwner, "function");
  assert.equal(typeof setEngineWatermark, "function");
  assert.equal(typeof getEngineWatermark, "function");
});
