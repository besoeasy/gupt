import { readConfiguredRetentionMs } from "../config/retention.js";
import { normalizeRelayUrl } from "../config/servers.js";
import { compressTextForCache, decompressTextFromCache } from "./messageCompression.js";
import { decCachedKey, usableDecCachedRow } from "./mediaDecCache.js";
import { updateLatencyEwma, updateOkEwma } from "./relay/score.js";
import { classifyTraffic } from "./relay/constants.js";
import { WRITER_VERSION } from "./writerVersion.js";

// The cache is disposable: relays are the source of truth. The database name is
// derived from STORE_SPECS (see below), so a layout change opens a brand-new
// database and old ones are swept on boot. Never add an upgrade path or a
// migration.
const CACHE_DB_PREFIX = "gupt_cache_";
export const CACHE_DB_REGISTRY_KEY = "gupt_cache_db_names";
const CACHE_OPEN_TIMEOUT_MS = 3000;

// Unsent, self-authored events are the only rows relays cannot rebuild if the
// cache is discarded, so they live outside the cache database.
export const OUTBOX_STORAGE_KEY = "gupt_outbox_v1";
// Box header version. Entries themselves are sealed events stamped by
// `finalizeEvent`; this covers the wrapper (owner + entries), which is not.
const OUTBOX_BOX_VERSION = 1;
const OUTBOX_MAX_ENTRIES = 200;
const OUTBOX_MAX_BYTES = 1024 * 1024; // 1 MB of sealed event JSON

// One LRU budget across the media and engine blob tables.
const CACHE_BUDGET_BYTES = 300 * 1024 * 1024; // 300 MB

const STAGED_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const PROFILE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const RELAY_STATS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const OUTBOX_DONE_AT = Number.MAX_SAFE_INTEGER;
const OUTBOX_FAILED_IDS_MAX = 20;

function getMaxCacheAgeMs() {
  return readConfiguredRetentionMs();
}

function profileTtl() {
  return PROFILE_TTL_MS;
}

function sanitizeProfileField(value, maxLen) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

function normalizeRelay(relay) {
  return normalizeRelayUrl(relay);
}

// ─── Native IndexedDB Core (Zero Dexie Dependency) ──────────────────────────

const getIdbFactory = () => {
  if (typeof indexedDB !== "undefined") return indexedDB;
  if (typeof window !== "undefined" && window.indexedDB) return window.indexedDB;
  if (typeof self !== "undefined" && self.indexedDB) return self.indexedDB;
  return null;
};

export const STORE_SPECS = {
  mediaCache: {
    keyPath: "key",
    indexes: [
      { name: "type", keyPath: "type" },
      { name: "createdAt", keyPath: "createdAt" },
      { name: "expiresAt", keyPath: "expiresAt" },
      { name: "lastAccessedAt", keyPath: "lastAccessedAt" },
    ],
  },
  roomMeta: {
    keyPath: "roomId",
    indexes: [
      { name: "peerPubkey", keyPath: "peerPubkey" },
      { name: "updatedAt", keyPath: "updatedAt" },
      { name: "lastMessageTs", keyPath: "lastMessageTs" },
      { name: "expiresAt", keyPath: "expiresAt" },
      { name: "unreadCount", keyPath: "unreadCount" },
    ],
  },
  groups: {
    keyPath: "groupId",
    indexes: [
      { name: "updatedAt", keyPath: "updatedAt" },
      { name: "lastMessageTs", keyPath: "lastMessageTs" },
      { name: "createdAt", keyPath: "createdAt" },
      { name: "expiresAt", keyPath: "expiresAt" },
      { name: "unreadCount", keyPath: "unreadCount" },
    ],
  },
  profiles: {
    keyPath: "pubkey",
    indexes: [
      { name: "fetchedAt", keyPath: "fetchedAt" },
      { name: "expiresAt", keyPath: "expiresAt" },
    ],
  },
  syncCursors: {
    keyPath: "peerPubkey",
    indexes: [
      { name: "lastSyncMs", keyPath: "lastSyncMs" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  messageSearch: {
    keyPath: "id",
    indexes: [
      { name: "roomId", keyPath: "roomId" },
      { name: "groupId", keyPath: "groupId" },
      { name: "ts", keyPath: "ts" },
      { name: "expiresAt", keyPath: "expiresAt" },
      { name: "tokens", keyPath: "tokens", options: { multiEntry: true } },
    ],
  },
  relayStats: {
    keyPath: "relay",
    indexes: [
      { name: "updatedAt", keyPath: "updatedAt" },
      { name: "expiresAt", keyPath: "expiresAt" },
    ],
  },
  // Public relay hints, aggregated per relay URL, plus the last verification
  // result. Disposable like every other cache row.
  relayHints: {
    keyPath: "url",
    indexes: [
      { name: "updatedAt", keyPath: "updatedAt" },
      { name: "expiresAt", keyPath: "expiresAt" },
    ],
  },
  rawEvents: {
    keyPath: "id",
    indexes: [
      { name: "pubkey", keyPath: "pubkey" },
      { name: "kind", keyPath: "kind" },
      { name: "origin", keyPath: "origin" },
      { name: "peerPubkey", keyPath: "peerPubkey" },
      { name: "roomId", keyPath: "roomId" },
      { name: "groupId", keyPath: "groupId" },
      { name: "type", keyPath: "type" },
      { name: "createdAt", keyPath: "createdAt" },
      { name: "expiresAt", keyPath: "expiresAt" },
      { name: "lastReplicatedAt", keyPath: "lastReplicatedAt" },
      { name: "[kind+createdAt]", keyPath: ["kind", "createdAt"] },
      { name: "[kind+origin+createdAt]", keyPath: ["kind", "origin", "createdAt"] },
      { name: "[roomId+createdAt]", keyPath: ["roomId", "createdAt"] },
      { name: "[groupId+createdAt]", keyPath: ["groupId", "createdAt"] },
    ],
  },
  engineBlobs: {
    keyPath: "hash",
    indexes: [
      { name: "size", keyPath: "size" },
      { name: "createdAt", keyPath: "createdAt" },
      { name: "expiresAt", keyPath: "expiresAt" },
      { name: "lastAccessedAt", keyPath: "lastAccessedAt" },
    ],
  },
  meta: {
    keyPath: "key",
    indexes: [],
  },
};

// ─── Schema name: the layout IS the database name ───────────────────────────

/**
 * IndexedDB only creates stores and indexes inside `onupgradeneeded`, which
 * requires opening with a higher version and therefore a stacked upgrade path
 * per release. The cache is disposable, so the layout is hashed into the
 * database name instead: change `STORE_SPECS` and the next load opens a fresh
 * database, then the sweep deletes the old one.
 *
 * Derived at module load, not at build time: this module is imported by the
 * replication and Rabta workers and by `node --test`, where a bundler define
 * does not exist. Hashing a dozen keys costs microseconds.
 *
 * The projection is order-insensitive, so reordering declarations does not
 * discard anyone's cache — only a real change in stores, key paths or index
 * options does.
 */
function keyPathKey(keyPath) {
  // Brackets keep a compound key (`["a","b"]`) distinct from the literal
  // string "a+b", which would otherwise hash to the same layout.
  return Array.isArray(keyPath) ? `[${keyPath.join("+")}]` : String(keyPath ?? "");
}

function indexFingerprintPart(idx) {
  if (typeof idx === "string") return `${idx}|${keyPathKey(idx)}|0|0`;
  const multiEntry = idx?.options?.multiEntry ? 1 : 0;
  const unique = idx?.options?.unique ? 1 : 0;
  return `${idx.name}|${keyPathKey(idx.keyPath)}|${multiEntry}|${unique}`;
}

function canonicalStoreSpecs(specs) {
  return Object.keys(specs)
    .sort()
    .map((storeName) => {
      const spec = specs[storeName] || {};
      const indexes = (spec.indexes || []).map(indexFingerprintPart).sort();
      return `${storeName}|${keyPathKey(spec.keyPath)}|[${indexes.join(",")}]`;
    })
    .join(";");
}

/** FNV-1a: synchronous on purpose, the name is needed during module init. */
function hashLayout(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Fingerprint of a store layout. Exported for `test/schema-name.test.js`. */
export function schemaFingerprintOf(specs) {
  return hashLayout(canonicalStoreSpecs(specs));
}

export const SCHEMA_FINGERPRINT = schemaFingerprintOf(STORE_SPECS);
const APP_CACHE_DB_NAME = `${CACHE_DB_PREFIX}${SCHEMA_FINGERPRINT}`;

class NativeTableQuery {
  constructor(table, indexName, rangeBuilder) {
    this.table = table;
    this.indexName = indexName;
    this.rangeBuilder = rangeBuilder;
    this._filters = [];
    this._until = null;
    this._reverse = false;
    this._limit = null;
    this._sortByField = null;
  }

  filter(predicate) {
    this._filters.push(predicate);
    return this;
  }

  until(predicate) {
    this._until = predicate;
    return this;
  }

  reverse() {
    this._reverse = true;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  sortBy(field) {
    this._sortByField = field;
    return this.toArray().then((rows) =>
      rows.sort((a, b) => {
        const va = a[field] ?? 0;
        const vb = b[field] ?? 0;
        return va < vb ? -1 : va > vb ? 1 : 0;
      }),
    );
  }

  async toArray() {
    const results = [];
    await this.each((item) => {
      results.push(item);
    });
    if (this._sortByField) {
      results.sort((a, b) => {
        const va = a[this._sortByField] ?? 0;
        const vb = b[this._sortByField] ?? 0;
        return va < vb ? -1 : va > vb ? 1 : 0;
      });
    }
    return results;
  }

  async first() {
    const arr = await this.toArray();
    return arr.length ? arr[0] : undefined;
  }

  async count() {
    const arr = await this.toArray();
    return arr.length;
  }

  async delete() {
    const items = await this.toArray();
    const keyPath = STORE_SPECS[this.table.name]?.keyPath || "id";
    const keys = items.map((item) => item[keyPath]).filter((k) => k !== undefined);
    if (!keys.length) return 0;
    await this.table.bulkDelete(keys);
    return keys.length;
  }

  async each(callback) {
    const db = await this.table.db.getDb();
    if (!db) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.table.name, "readonly");
        const store = tx.objectStore(this.table.name);
        const source =
          this.indexName && store.indexNames.contains(this.indexName)
            ? store.index(this.indexName)
            : store;

        const range = typeof this.rangeBuilder === "function" ? this.rangeBuilder() : null;
        const direction = this._reverse ? "prev" : "next";
        const req = source.openCursor(range, direction);

        let count = 0;
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) {
            resolve();
            return;
          }

          const value = cursor.value;

          if (this._until && this._until(value)) {
            resolve();
            return;
          }

          let pass = true;
          for (const f of this._filters) {
            if (!f(value)) {
              pass = false;
              break;
            }
          }

          if (pass) {
            callback(value);
            count++;
            if (this._limit !== null && count >= this._limit) {
              resolve();
              return;
            }
          }

          cursor.continue();
        };

        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }
}

class NativeWhereBuilder {
  constructor(table, indexName) {
    this.table = table;
    this.indexName = indexName;
  }

  equals(val) {
    return new NativeTableQuery(this.table, this.indexName, () => IDBKeyRange.only(val));
  }

  above(val) {
    return new NativeTableQuery(this.table, this.indexName, () =>
      IDBKeyRange.lowerBound(val, true),
    );
  }

  belowOrEqual(val) {
    return new NativeTableQuery(this.table, this.indexName, () =>
      IDBKeyRange.upperBound(val, false),
    );
  }

  between(lower, upper, includeLower = true, includeUpper = true) {
    return new NativeTableQuery(this.table, this.indexName, () =>
      IDBKeyRange.bound(lower, upper, !includeLower, !includeUpper),
    );
  }

  anyOf(keys) {
    const list = Array.isArray(keys) ? keys : [];
    const query = new NativeTableQuery(this.table, this.indexName, null);
    query.filter((item) => {
      const val = item[this.indexName];
      return list.includes(val);
    });
    return query;
  }

  sortBy(field) {
    const query = new NativeTableQuery(this.table, this.indexName, null);
    return query.sortBy(field);
  }
}

class NativeTable {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }

  where(indexName) {
    return new NativeWhereBuilder(this, indexName);
  }

  async get(key) {
    const db = await this.db.getDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.name, "readonly");
        const store = tx.objectStore(this.name);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      } catch (err) {
        resolve(null);
      }
    });
  }

  async put(value) {
    const db = await this.db.getDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.name, "readwrite");
        const store = tx.objectStore(this.name);
        const req = store.put(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async delete(key) {
    const db = await this.db.getDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.name, "readwrite");
        const store = tx.objectStore(this.name);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        resolve();
      }
    });
  }

  async clear() {
    const db = await this.db.getDb();
    if (!db) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.name, "readwrite");
        const store = tx.objectStore(this.name);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        resolve();
      }
    });
  }

  async count() {
    const db = await this.db.getDb();
    if (!db) return 0;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.name, "readonly");
        const store = tx.objectStore(this.name);
        const req = store.count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => reject(req.error);
      } catch (err) {
        resolve(0);
      }
    });
  }

  async toArray() {
    const db = await this.db.getDb();
    if (!db) return [];
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.name, "readonly");
        const store = tx.objectStore(this.name);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (err) {
        resolve([]);
      }
    });
  }

  async each(callback) {
    const query = new NativeTableQuery(this, null, null);
    return query.each(callback);
  }

  async bulkGet(keys) {
    if (!Array.isArray(keys) || !keys.length) return [];
    const db = await this.db.getDb();
    if (!db) return [];
    return Promise.all(keys.map((k) => this.get(k)));
  }

  async bulkPut(items) {
    if (!Array.isArray(items) || !items.length) return;
    const db = await this.db.getDb();
    if (!db) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.name, "readwrite");
        const store = tx.objectStore(this.name);
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async bulkDelete(keys) {
    if (!Array.isArray(keys) || !keys.length) return;
    const db = await this.db.getDb();
    if (!db) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.name, "readwrite");
        const store = tx.objectStore(this.name);
        for (const k of keys) {
          store.delete(k);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        resolve();
      }
    });
  }

  async update(key, changes) {
    const db = await this.db.getDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.name, "readwrite");
        const store = tx.objectStore(this.name);
        const req = store.get(key);
        req.onsuccess = () => {
          if (!req.result) {
            resolve(0);
            return;
          }
          const updated = Object.assign({}, req.result, changes);
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve(1);
          putReq.onerror = () => reject(putReq.error);
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async bulkUpdate(updates) {
    if (!Array.isArray(updates) || !updates.length) return;
    for (const u of updates) {
      if (u.key) await this.update(u.key, u.changes);
    }
  }
}

class NativeGuptDb {
  constructor() {
    this._db = null;
    this._initPromise = null;
    this.tables = {};

    for (const name of Object.keys(STORE_SPECS)) {
      this.tables[name] = new NativeTable(this, name);
      this[name] = this.tables[name];
    }
  }

  table(name) {
    return this.tables[name];
  }

  async getDb() {
    const idb = getIdbFactory();
    if (!idb) return null;
    if (this._db) return this._db;
    if (this._initPromise) return this._initPromise;

    const init = new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };

      // A blocked, corrupt or quota-exceeded database must never hang the UI:
      // fall back to memory-only after a few seconds and retry next call.
      const timer = setTimeout(() => {
        this._initPromise = null;
        finish(null);
      }, CACHE_OPEN_TIMEOUT_MS);

      try {
        // No version argument: a schema change ships as a new database name, so
        // this always opens at version 1 and can never block or downgrade.
        const req = idb.open(APP_CACHE_DB_NAME);

        req.onupgradeneeded = () => {
          const database = req.result;
          for (const [storeName, spec] of Object.entries(STORE_SPECS)) {
            const store = database.createObjectStore(storeName, { keyPath: spec.keyPath });
            for (const idx of spec.indexes) {
              const idxName = typeof idx === "string" ? idx : idx.name;
              const keyPath = typeof idx === "string" ? idx : idx.keyPath;
              const options = typeof idx === "string" ? {} : idx.options || {};
              store.createIndex(idxName, keyPath, options);
            }
          }
        };

        req.onsuccess = () => {
          const database = req.result;
          database.onversionchange = () => {
            // A newer build wants this name; let go instead of blocking it.
            try {
              database.close();
            } catch {
              // Already closed.
            }
            if (this._db === database) this._db = null;
            this._initPromise = null;
          };
          this._db = database;
          rememberCacheDbName(APP_CACHE_DB_NAME);
          void sweepOldCacheDbs(APP_CACHE_DB_NAME).catch(() => {});
          void hydrateOutboxQueue().catch(() => {});
          finish(database);
        };

        req.onerror = () => {
          this._initPromise = null;
          finish(null);
        };

        req.onblocked = () => {
          this._initPromise = null;
          finish(null);
        };
      } catch {
        this._initPromise = null;
        finish(null);
      }
    });

    this._initPromise = init;
    return init;
  }

  async open() {
    return this.getDb();
  }

  close() {
    if (this._db) {
      try {
        this._db.close();
      } catch {
        // Already closed.
      }
    }
    this._db = null;
    this._initPromise = null;
  }

  async transaction(mode, tableNames, callback) {
    return callback();
  }
}

const db = new NativeGuptDb();
let maintenanceStarted = false;
let dbOwnerPubkey = null;
let outboxHydrated = false;

// ─── Cache Database Lifecycle (schema = name, never migrate) ─────────────────

function getLocalStorage() {
  try {
    if (typeof localStorage !== "undefined" && localStorage) return localStorage;
  } catch {
    // Access throws in private mode or when storage is disabled.
  }
  return null;
}

function readCacheDbRegistry() {
  const ls = getLocalStorage();
  if (!ls) return [];
  try {
    const parsed = JSON.parse(ls.getItem(CACHE_DB_REGISTRY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((name) => typeof name === "string") : [];
  } catch {
    return [];
  }
}

function writeCacheDbRegistry(names, currentName = APP_CACHE_DB_NAME) {
  const ls = getLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(CACHE_DB_REGISTRY_KEY, JSON.stringify(trimCacheDbRegistry(names, currentName)));
  } catch {
    // Registry is a Firefox fallback only; ignore quota errors.
  }
}

/**
 * The registry is only a fallback for browsers where `indexedDB.databases()`
 * throws (Firefox), so it needs the current name and a little history — never
 * a growing list. Keeps the newest epochs and always the current one, unless
 * the caller is clearing it deliberately (`deleteCacheDatabase`).
 */
const CACHE_DB_REGISTRY_MAX = 4;

export function trimCacheDbRegistry(names, currentName = APP_CACHE_DB_NAME) {
  const unique = [
    ...new Set((Array.isArray(names) ? names : []).filter((n) => typeof n === "string" && n)),
  ];
  if (!unique.length) return [];
  // Names are layout hashes, so they carry no age; the registry is appended in
  // creation order (`rememberCacheDbName`), which is what makes "last four"
  // mean "newest four".
  const keep = unique.slice(-CACHE_DB_REGISTRY_MAX);
  if (!keep.includes(currentName)) {
    if (keep.length >= CACHE_DB_REGISTRY_MAX) keep.shift();
    keep.push(currentName);
  }
  return keep;
}

function rememberCacheDbName(name) {
  if (!name) return;
  const names = readCacheDbRegistry();
  if (names.includes(name)) return;
  writeCacheDbRegistry([...names, name]);
}

/** Pure: every cache database name except the one this build uses. */
export function selectStaleCacheDbNames(names, currentName = APP_CACHE_DB_NAME) {
  return (Array.isArray(names) ? names : []).filter(
    (name) => typeof name === "string" && name.startsWith(CACHE_DB_PREFIX) && name !== currentName,
  );
}

async function listCacheDbNames() {
  const idb = getIdbFactory();
  if (idb?.databases) {
    try {
      const databases = await idb.databases();
      const names = (databases || []).map((entry) => entry?.name).filter(Boolean);
      if (names.length) return names;
    } catch {
      // Firefox throws here; the registry covers what this app created.
    }
  }
  return readCacheDbRegistry();
}

/**
 * Best-effort delete: resolves either way. The cache is disposable, so a
 * blocked or refused deletion is not worth reporting or retrying — the database
 * costs disk until the browser evicts it, never data.
 */
function deleteIdbByName(idb, name) {
  return new Promise((resolve) => {
    try {
      const req = idb.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Delete every `gupt_cache_*` database except the current one. Fire and forget:
 * the cache is disposable, so a database another tab still holds open is simply
 * left behind — it costs disk, never data. The registry is pruned either way,
 * which keeps it a list of names this build created rather than a to-do list.
 */
export async function sweepOldCacheDbs(currentName = APP_CACHE_DB_NAME) {
  const idb = getIdbFactory();
  if (!idb) return [];
  const stale = selectStaleCacheDbNames(await listCacheDbNames(), currentName);
  if (!stale.length) return [];
  await Promise.all(stale.map((name) => deleteIdbByName(idb, name)));
  const staleSet = new Set(stale);
  writeCacheDbRegistry(
    readCacheDbRegistry().filter((name) => !staleSet.has(name)),
    currentName,
  );
  return stale;
}

/** Delete every cache database this app created, including the current one. */
export async function deleteCacheDatabase() {
  const idb = getIdbFactory();
  if (!idb) return [];
  db.close();
  const names = await listCacheDbNames();
  const targets = new Set(
    names.filter((name) => typeof name === "string" && name.startsWith(CACHE_DB_PREFIX)),
  );
  targets.add(APP_CACHE_DB_NAME);
  const deleted = [];
  for (const name of targets) {
    await deleteIdbByName(idb, name);
    deleted.push(name);
  }
  writeCacheDbRegistry([]);
  outboxHydrated = false;
  return deleted;
}

// ─── Outbox (localStorage: the only rows relays cannot rebuild) ──────────────

function normalizeOwner(pubkey) {
  return String(pubkey || "")
    .trim()
    .toLowerCase()
    .replace(/^ed25519:/, "");
}

function readOutboxBox() {
  const ls = getLocalStorage();
  if (!ls) return { owner: null, entries: [] };
  try {
    const parsed = JSON.parse(ls.getItem(OUTBOX_STORAGE_KEY) || "null");
    if (!parsed || !Array.isArray(parsed.entries)) return { owner: null, entries: [] };
    const box = {
      owner: normalizeOwner(parsed.owner) || null,
      entries: parsed.entries.filter((entry) => entry?.id && entry?.event),
    };
    // Read-repair: a box written by another build is rewritten in the current
    // shape the first time any reader touches it (see AGENTS.md).
    if (Number(parsed.v) !== OUTBOX_BOX_VERSION || parsed.w !== WRITER_VERSION) {
      writeOutboxBox(box);
    }
    return box;
  } catch {
    return { owner: null, entries: [] };
  }
}

function writeOutboxBox(box) {
  const ls = getLocalStorage();
  if (!ls) return false;
  const entries = [];
  let bytes = 0;
  // Newest entries win when the queue is over budget.
  for (let i = box.entries.length - 1; i >= 0 && entries.length < OUTBOX_MAX_ENTRIES; i -= 1) {
    const entry = box.entries[i];
    const size = estimateValueBytes(entry);
    if (entries.length && bytes + size > OUTBOX_MAX_BYTES) break;
    bytes += size;
    entries.unshift(entry);
  }
  try {
    if (!entries.length && !box.owner) {
      ls.removeItem(OUTBOX_STORAGE_KEY);
      return true;
    }
    ls.setItem(
      OUTBOX_STORAGE_KEY,
      JSON.stringify({
        v: OUTBOX_BOX_VERSION,
        w: WRITER_VERSION,
        owner: box.owner || null,
        entries,
      }),
    );
    return true;
  } catch {
    try {
      const trimmed = entries.slice(Math.ceil(entries.length / 2));
      ls.setItem(
        OUTBOX_STORAGE_KEY,
        JSON.stringify({
          v: OUTBOX_BOX_VERSION,
          w: WRITER_VERSION,
          owner: box.owner || null,
          entries: trimmed,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}

export function setOutboxOwner(pubkeyHex) {
  const owner = normalizeOwner(pubkeyHex);
  if (!owner) return;
  const box = readOutboxBox();
  let changed = false;
  if (box.owner && box.owner !== owner) {
    box.entries = [];
    changed = true;
  }
  if (box.owner !== owner) {
    box.owner = owner;
    changed = true;
  }
  if (changed) writeOutboxBox(box);
}

/** Remember an unsent, self-authored raw event outside the disposable cache. */
export function queueOutboxEvent(row) {
  if (!row?.id || !row?.event) return false;
  const box = readOutboxBox();
  const owner = normalizeOwner(row.pubkey);
  if (box.owner && owner && box.owner !== owner) {
    box.entries = [];
  }
  if (owner) box.owner = owner;
  const entry = { ...row, savedAt: now() };
  box.entries = box.entries.filter((item) => item.id !== entry.id);
  box.entries.push(entry);
  return writeOutboxBox(box);
}

export function dequeueOutboxEvents(ids) {
  const drop = new Set(uniqueIds(ids));
  if (!drop.size) return false;
  const box = readOutboxBox();
  const entries = box.entries.filter((entry) => !drop.has(entry.id));
  if (entries.length === box.entries.length) return false;
  box.entries = entries;
  return writeOutboxBox(box);
}

export function clearOutboxQueue() {
  const ls = getLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(OUTBOX_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function outboxQueueSize() {
  const box = readOutboxBox();
  return {
    entries: box.entries.length,
    bytes: box.entries.reduce((total, entry) => total + estimateValueBytes(entry), 0),
    owner: box.owner,
  };
}

/** Put queued unsent events back into the freshly opened cache database. */
async function hydrateOutboxQueue() {
  if (outboxHydrated) return 0;
  outboxHydrated = true;
  const box = readOutboxBox();
  if (!box.entries.length) return 0;
  const owner = dbOwnerPubkey;
  if (box.owner && owner && box.owner !== owner) {
    clearOutboxQueue();
    return 0;
  }
  let restored = 0;
  for (const entry of box.entries) {
    const existing = await db.rawEvents.get(entry.id).catch(() => null);
    if (existing) continue;
    const { savedAt, ...row } = entry;
    await db.rawEvents.put(row).catch(() => null);
    restored += 1;
  }
  return restored;
}

function resolveDbOwner() {
  return dbOwnerPubkey || readOutboxBox().owner || null;
}

const CACHE_TABLE_LABELS = {
  mediaCache: "Media cache",
  roomMeta: "Room metadata",
  groups: "Groups",
  rawEvents: "Events",
  engineBlobs: "Blobs",
};

function now() {
  return Date.now();
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function createExpiry(createdAt, ttl = getMaxCacheAgeMs()) {
  const normalizedCreatedAt = Math.max(0, toNumber(createdAt, now()));
  return {
    createdAt: normalizedCreatedAt,
    expiresAt: normalizedCreatedAt + ttl,
  };
}

function isFresh(entry) {
  return Boolean(entry) && toNumber(entry.expiresAt, 0) > now();
}

function estimateValueBytes(value) {
  if (value == null) return 0;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (typeof value === "string") return new TextEncoder().encode(value).length;
  if (typeof value === "number") return 8;
  if (typeof value === "boolean") return 4;
  if (Array.isArray(value))
    return value.reduce((total, entry) => total + estimateValueBytes(entry), 0);
  if (typeof value === "object") {
    return Object.entries(value).reduce(
      (total, [key, entry]) => total + estimateValueBytes(key) + estimateValueBytes(entry),
      0,
    );
  }
  return 0;
}

function getPrimaryKey(tableName, entry) {
  switch (tableName) {
    case "groups":
      return entry.groupId;
    case "roomMeta":
      return entry.roomId;
    default:
      return entry.key || entry.id;
  }
}

function tokenizeSearchText(text) {
  return [
    ...new Set(
      String(text || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 2),
    ),
  ];
}

async function prepareTextForStorage(text) {
  return compressTextForCache(text);
}

async function prepareTextForRead(text) {
  return decompressTextFromCache(text);
}

async function hydrateMessageText(row) {
  if (!row || row.type !== "text" || row.text == null) return row;
  return { ...row, text: await prepareTextForRead(row.text) };
}

async function buildMessageSearchRecord(source) {
  const id = String(source?.id || "").trim();
  if (!id || source?.type !== "text") return null;

  const text = await prepareTextForRead(source.text);
  const tokens = tokenizeSearchText(text);
  if (!tokens.length) return null;

  const ts = toNumber(source.ts, now());
  const baseExpiry = createExpiry(ts);
  // Respect a shorter per-message deadline (chat timer) in search too.
  const sourceExpiry = toNumber(source.expiresAt, 0);
  const expiresAt =
    sourceExpiry > 0 ? Math.min(baseExpiry.expiresAt, sourceExpiry) : baseExpiry.expiresAt;
  return {
    id,
    roomId: String(source.roomId || ""),
    groupId: String(source.groupId || ""),
    ts,
    tokens,
    expiresAt,
    text: source.text,
    sender: source.sender || "",
    mine: Boolean(source.mine),
  };
}

function getEntryActivityTimestamp(tableName, entry) {
  switch (tableName) {
    case "mediaCache":
      return Math.max(
        toNumber(entry?.lastAccessedAt, 0),
        toNumber(entry?.createdAt, 0),
        toNumber(entry?.ts, 0),
      );
    case "roomMeta":
      return Math.max(
        toNumber(entry?.lastMessageTs, 0),
        toNumber(entry?.updatedAt, 0),
        toNumber(entry?.createdAt, 0),
      );
    case "groups":
      return Math.max(
        toNumber(entry?.lastMessageTs, 0),
        toNumber(entry?.updatedAt, 0),
        toNumber(entry?.createdAt, 0),
      );
    case "profiles":
      return Math.max(toNumber(entry?.fetchedAt, 0), toNumber(entry?.createdAt, 0));
    default:
      return Math.max(
        toNumber(entry?.createdAt, 0),
        toNumber(entry?.ts, 0),
        toNumber(entry?.updatedAt, 0),
      );
  }
}

function getEntryExpiryTimestamp(tableName, entry) {
  const activityTimestamp = getEntryActivityTimestamp(tableName, entry);
  const storedExpiry = toNumber(entry?.expiresAt, 0);

  if (!activityTimestamp) return storedExpiry;

  if (tableName === "mediaCache" && entry?.type === "staged") {
    return Math.max(storedExpiry, activityTimestamp + STAGED_UPLOAD_MAX_AGE_MS);
  }

  switch (tableName) {
    case "mediaCache":
      return Math.max(storedExpiry, activityTimestamp + getMaxCacheAgeMs());
    case "profiles":
      return storedExpiry || activityTimestamp + PROFILE_TTL_MS;
    case "relayStats":
      return storedExpiry || activityTimestamp + RELAY_STATS_RETENTION_MS;
    default:
      return storedExpiry || activityTimestamp + getMaxCacheAgeMs();
  }
}

function isEntryExpired(tableName, entry, currentTime = now()) {
  return getEntryExpiryTimestamp(tableName, entry) <= currentTime;
}

async function purgeExpiredEntriesForTable(tableName) {
  const table = db.table(tableName);
  if (!table) return 0;
  return table.where("expiresAt").belowOrEqual(now()).delete();
}

async function summarizeTable(tableName) {
  const rows = await db.table(tableName).toArray();
  const currentTime = now();
  const freshRows = rows.filter((entry) => !isEntryExpired(tableName, entry, currentTime));
  const staleKeys = rows
    .filter((entry) => isEntryExpired(tableName, entry, currentTime))
    .map((entry) => getPrimaryKey(tableName, entry))
    .filter(Boolean);
  if (staleKeys.length) {
    await db.table(tableName).bulkDelete(staleKeys);
  }

  const totalBytes = freshRows.reduce((total, entry) => total + estimateValueBytes(entry), 0);
  const newestCreatedAt = freshRows.reduce(
    (latest, entry) => Math.max(latest, toNumber(entry.createdAt, 0)),
    0,
  );
  const newestExpiresAt = freshRows.reduce(
    (latest, entry) => Math.max(latest, toNumber(entry.expiresAt, 0)),
    0,
  );

  return {
    table: tableName,
    label: CACHE_TABLE_LABELS[tableName] || tableName,
    entries: freshRows.length,
    estimatedBytes: totalBytes,
    newestCreatedAt,
    newestExpiresAt,
  };
}

async function normalizeCacheMessage(roomId, row) {
  if (!row?.id || !roomId) return null;

  const createdAt = toNumber(row.created_at || row.ts, now());
  const expiry = createExpiry(createdAt);
  if (expiry.expiresAt <= now()) return null;

  return {
    id: String(row.id),
    roomId: String(roomId),
    ts: createdAt,
    createdAt,
    expiresAt: expiry.expiresAt,
    sender: row.sender || "",
    recipient: row.recipient || "",
    mine: Boolean(row.mine),
    text: row.text != null ? await prepareTextForStorage(row.text) : null,
    type: row.type || "text",
    status: row.status || "delivered",
    readByPeer: Boolean(row.readByPeer),
    readByAll: Boolean(row.readByAll),
    editedAt: row.editedAt ? toNumber(row.editedAt) : null,
    replyTo: row.replyTo || null,
    replyExcerpt: row.replyExcerpt || null,
    reactions: Array.isArray(row.reactions) ? row.reactions : [],
    media: row.media || null,
    template: Boolean(row.template),
  };
}

/**
 * Pure: merge a room-meta patch into the stored row. Exported for tests — this
 * is the only place preview/type/seen fields are allowed to be dropped, and
 * losing them makes the chat list fall back to the room hash.
 */
export function normalizeRoomMeta(roomId, patch = {}, existing = null) {
  if (!roomId) return null;

  const patchTs = toNumber(patch?.lastMessageTs, toNumber(patch?.lastMessage?.ts, 0));
  const existingTs = toNumber(existing?.lastMessageTs, 0);
  const resetPreview = Boolean(patch?.resetPreview);
  const lastMessageTs = resetPreview ? Math.max(0, patchTs) : Math.max(existingTs, patchTs);

  // Only overwrite the preview when the patch carries a newer message; an
  // empty preview must never erase the last real one. `resetPreview` is the
  // one exception, used when a room's messages all expired.
  const nextPreview = patch?.lastMessageText !== undefined ? String(patch.lastMessageText) : null;
  const shouldUpdateLastMessage = resetPreview
    ? true
    : nextPreview !== null && patchTs >= existingTs && Boolean(nextPreview);
  const lastMessageText = shouldUpdateLastMessage
    ? nextPreview || ""
    : existing?.lastMessageText || "";
  const lastMessageMine = shouldUpdateLastMessage
    ? Boolean(patch?.lastMessageMine)
    : Boolean(existing?.lastMessageMine);

  const updatedAt = Math.max(
    toNumber(existing?.updatedAt, 0),
    toNumber(patch?.updatedAt, now()),
    now(),
  );
  const expiry = createExpiry(lastMessageTs || updatedAt);
  if (expiry.expiresAt <= now()) return null;

  const unreadCount = patch?.resetUnread
    ? 0
    : patch?.unreadCount !== undefined
      ? Math.max(0, toNumber(patch.unreadCount, 0))
      : Math.max(0, toNumber(existing?.unreadCount, 0) + toNumber(patch?.unreadDelta, 0));

  const textField = (value, fallback) =>
    typeof value === "string" && value ? value : fallback || "";

  return {
    roomId: String(roomId),
    peerPubkey: textField(patch?.peerPubkey, existing?.peerPubkey),
    name: textField(patch?.name, existing?.name),
    type: textField(patch?.type, existing?.type || "dm"),
    about: textField(patch?.about, existing?.about),
    picture: textField(patch?.picture, existing?.picture),
    website: textField(patch?.website, existing?.website),
    banner: textField(patch?.banner, existing?.banner),
    botRole: patch?.botRole !== undefined ? patch.botRole : (existing?.botRole ?? null),
    botSystemPrompt:
      patch?.botSystemPrompt !== undefined
        ? patch.botSystemPrompt
        : (existing?.botSystemPrompt ?? null),
    botModel: patch?.botModel !== undefined ? patch.botModel : (existing?.botModel ?? null),
    botGreeting:
      patch?.botGreeting !== undefined ? patch.botGreeting : (existing?.botGreeting ?? null),
    botAutoReply:
      patch?.botAutoReply !== undefined
        ? Boolean(patch.botAutoReply)
        : (existing?.botAutoReply ?? null),
    createdAt: toNumber(existing?.createdAt, updatedAt),
    updatedAt,
    lastMessageTs,
    lastMessageText,
    lastMessageMine,
    lastMessageExpiresAt: shouldUpdateLastMessage
      ? toNumber(patch?.lastMessageExpiresAt, 0)
      : Math.max(
          toNumber(existing?.lastMessageExpiresAt, 0),
          toNumber(patch?.lastMessageExpiresAt, 0),
        ),
    lastInboundTs: Math.max(
      toNumber(existing?.lastInboundTs, 0),
      toNumber(patch?.lastInboundTs, 0),
    ),
    unreadCount,
    lastSeenTs:
      patch?.lastSeenTs !== undefined
        ? toNumber(patch.lastSeenTs, now())
        : toNumber(existing?.lastSeenTs, 0),
    lastMessage:
      patch?.lastMessage !== undefined ? patch.lastMessage : existing?.lastMessage || null,
    expiresAt: expiry.expiresAt,
  };
}

/** Pure: merge a group patch into the stored row, keeping unread/seen state. */
export function normalizeStoredGroup(group = {}, existing = null) {
  const groupId = String(group?.groupId || existing?.groupId || "").trim();
  if (!groupId) return null;

  const createdAt = Math.max(0, toNumber(group?.createdAt, existing?.createdAt || now()));
  const updatedAt = Math.max(
    toNumber(existing?.updatedAt, 0),
    toNumber(group?.updatedAt, now()),
    now(),
  );
  const lastMessageTs = group?.resetLastMessage
    ? Math.max(0, toNumber(group?.lastMessageTs, 0))
    : Math.max(
        toNumber(existing?.lastMessageTs, 0),
        toNumber(group?.lastMessageTs, toNumber(group?.lastMessage?.ts, 0)),
      );
  // Roll the TTL forward from the latest activity so active groups never stale-expire.
  const activityTs = lastMessageTs || updatedAt;
  const unreadCount = group?.resetUnread
    ? 0
    : group?.unreadCount !== undefined
      ? Math.max(0, toNumber(group.unreadCount, 0))
      : Math.max(0, toNumber(existing?.unreadCount, 0) + toNumber(group?.unreadDelta, 0));
  const lastSeenTs =
    group?.lastSeenTs !== undefined
      ? toNumber(group.lastSeenTs, now())
      : toNumber(existing?.lastSeenTs, 0);

  const { unreadDelta, resetUnread, resetLastMessage, ...clean } = { ...existing, ...group };

  return {
    ...clean,
    groupId,
    name: clean.name || "Group",
    members: Array.isArray(clean.members) ? clean.members : [],
    admins: Array.isArray(clean.admins) ? clean.admins : [],
    createdAt,
    updatedAt,
    lastMessageTs,
    unreadCount,
    lastSeenTs,
    expiresAt: activityTs + getMaxCacheAgeMs(),
  };
}

async function getFresh(table, key) {
  const entry = await table.get(key);
  return isFresh(entry) ? entry : null;
}

function formatStoredProfile(row) {
  if (!row) return null;
  return {
    name: sanitizeProfileField(row.name, 100),
    about: sanitizeProfileField(row.about, 500),
    website: sanitizeProfileField(row.website, 500),
    picture: row.picture ? String(row.picture).trim() : "",
    banner: row.banner ? String(row.banner).trim() : "",
    fetchedAt: toNumber(row.fetchedAt, 0),
    expiresAt: toNumber(row.expiresAt, 0),
  };
}

export async function getStoredProfile(pubkey) {
  if (!pubkey) return null;
  const row = await getFresh(db.profiles, String(pubkey).toLowerCase());
  return formatStoredProfile(row);
}

export async function peekStoredProfile(pubkey) {
  if (!pubkey) return null;
  const row = await db.profiles.get(String(pubkey).toLowerCase());
  return formatStoredProfile(row);
}

export async function putStoredProfile(pubkey, profile, ttlMs = null) {
  if (!pubkey) return;
  const key = String(pubkey).toLowerCase();
  const currentTs = now();
  const effectiveTtl = toNumber(ttlMs, profileTtl());
  await db.profiles.put({
    pubkey: key,
    name: sanitizeProfileField(profile?.name, 100),
    about: sanitizeProfileField(profile?.about, 500),
    website: sanitizeProfileField(profile?.website, 500),
    picture: profile?.picture ? String(profile.picture).trim() : "",
    banner: profile?.banner ? String(profile.banner).trim() : "",
    fetchedAt: currentTs,
    expiresAt: currentTs + effectiveTtl,
  });
}

export async function purgeExpiredCache() {
  await Promise.all([
    purgeExpiredEntriesForTable("mediaCache"),
    purgeExpiredEntriesForTable("roomMeta"),
    purgeExpiredEntriesForTable("groups"),
    purgeExpiredEntriesForTable("profiles"),
    purgeExpiredEntriesForTable("messageSearch"),
    purgeExpiredEntriesForTable("relayStats"),
    purgeExpiredEntriesForTable("relayHints"),
    purgeExpiredEntriesForTable("rawEvents"),
  ]);
  await purgeExpiredEntriesForTable("engineBlobs").catch(() => {});
  await evictEngineBlobs().catch(() => {});
}

// ─── One LRU Budget Across Media + Engine Blobs ─────────────────────────────

/**
 * Pure: pick the oldest-accessed entries to drop until the total fits the
 * budget. Entries look like `{ key, table, size, lastAccessedAt }`.
 */
export function planLruEviction(entries, budget = CACHE_BUDGET_BYTES) {
  const list = (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      ...entry,
      size: Math.max(0, Number(entry?.size) || 0),
      lastAccessedAt: Number(entry?.lastAccessedAt) || 0,
    }))
    .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  let total = list.reduce((sum, entry) => sum + entry.size, 0);
  const evicted = [];
  for (const entry of list) {
    if (total <= budget) break;
    evicted.push(entry);
    total -= entry.size;
  }
  return evicted;
}

function mediaRowSize(row) {
  return Math.max(0, Number(row?.size) || 0, row?.buf?.byteLength || 0, row?.buf?.length || 0);
}

/** Trim media + engine blobs together to CACHE_BUDGET_BYTES, oldest first. */
export async function evictCacheLru() {
  const [mediaRows, blobRows] = await Promise.all([
    db.mediaCache.toArray().catch(() => []),
    db.engineBlobs.toArray().catch(() => []),
  ]);
  const entries = [
    ...mediaRows.map((row) => ({
      key: row.key,
      table: "mediaCache",
      size: mediaRowSize(row),
      lastAccessedAt: toNumber(row.lastAccessedAt, toNumber(row.createdAt, 0)),
    })),
    ...blobRows.map((row) => ({
      key: row.hash,
      table: "engineBlobs",
      size: toNumber(row.size, row?.buf?.byteLength || 0),
      lastAccessedAt: toNumber(row.lastAccessedAt, toNumber(row.createdAt, 0)),
    })),
  ];
  const victims = planLruEviction(entries);
  let freed = 0;
  for (const victim of victims) {
    await db
      .table(victim.table)
      .delete(victim.key)
      .catch(() => {});
    freed += victim.size;
  }
  return freed;
}

export async function putEngineBlob(hash, buf, { expiresAt = null } = {}) {
  const key = String(hash || "")
    .trim()
    .toLowerCase();
  if (!key || !buf) return false;
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const touchedAt = now();

  await db.engineBlobs.put({
    hash: key,
    buf: bytes,
    size: bytes.byteLength,
    createdAt: touchedAt,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    lastAccessedAt: touchedAt,
  });

  void evictCacheLru().catch(() => {});
  return true;
}

export async function getEngineBlob(hash) {
  const key = String(hash || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const row = await db.engineBlobs.get(key);
  if (!row) return null;
  if (row.expiresAt && Number(row.expiresAt) < now()) {
    await db.engineBlobs.delete(key).catch(() => {});
    return null;
  }

  // Update LRU accessed timestamp on hit
  await db.engineBlobs.update(key, { lastAccessedAt: now() }).catch(() => {});
  if (!row.buf) return null;
  return row.buf instanceof Uint8Array ? row.buf : new Uint8Array(row.buf);
}

export async function hasEngineBlob(hash) {
  return Boolean(await getEngineBlob(hash));
}

export async function deleteEngineBlob(hash) {
  return db.engineBlobs.delete(String(hash || "").toLowerCase());
}

/** Bytes currently cached in the native engine blob table. */
export async function engineBlobCacheBytes() {
  let total = 0;
  await db.engineBlobs.each((row) => {
    total += Number(row.size) || 0;
  });
  return total;
}

/** Kept for existing callers: the byte budget is now shared with media. */
export async function evictEngineBlobs() {
  return evictCacheLru();
}

// ─── Raw Events & Cache Operations ──────────────────────────────────────────

export async function getRawEventsByIds(ids) {
  if (!ids?.length) return [];
  const rows = await db.rawEvents.bulkGet(ids);
  return rows.filter(Boolean);
}

/**
 * Blobs and media only: the part of the cache that is cheap to rebuild and
 * usually the only part worth reclaiming. Messages, rooms and cursors stay.
 */
export async function clearMediaCache() {
  await Promise.all([db.mediaCache.clear(), db.engineBlobs.clear()]);
}

export async function clearAllCaches() {
  await Promise.all([
    db.mediaCache.clear(),
    db.roomMeta.clear(),
    db.groups.clear(),
    db.profiles.clear(),
    db.syncCursors.clear(),
    db.messageSearch.clear(),
    db.relayStats.clear(),
    db.relayHints.clear(),
    db.rawEvents.clear(),
    db.engineBlobs.clear(),
    db.meta.clear(),
  ]);
  outboxHydrated = false;
}

export async function ensureDbOwner(pubkeyHex, { wipe = false } = {}) {
  const key = normalizeOwner(pubkeyHex);
  if (!key) return;
  const existing = await db.meta.get("db_owner");
  const ownerChanged = Boolean(existing?.pubkey && existing.pubkey !== key);
  if (ownerChanged) clearOutboxQueue();
  dbOwnerPubkey = key;
  setOutboxOwner(key);
  if (wipe || ownerChanged) {
    await clearAllCaches();
  }
  if (!existing || wipe || ownerChanged) {
    await db.meta.put({ key: "db_owner", pubkey: key, createdAt: now() });
  }
  await hydrateOutboxQueue();
}

export function startCacheMaintenance() {
  if (maintenanceStarted) return;
  maintenanceStarted = true;
  void purgeExpiredCache();
  setInterval(() => {
    void purgeExpiredCache();
  }, PURGE_INTERVAL_MS);
}

// ─── Media Cache Helpers ────────────────────────────────────────────────────

export async function getEncCached(key) {
  const row = await getFresh(db.mediaCache, String(key));
  if (!row?.buf) return null;
  return row.buf instanceof Uint8Array ? row.buf : new Uint8Array(row.buf);
}

export async function putEncCached(key, buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const currentTs = now();
  const expiry = createExpiry(currentTs);
  await db.mediaCache.put({
    key: String(key),
    type: "enc",
    buf: bytes,
    size: bytes.byteLength,
    createdAt: currentTs,
    expiresAt: expiry.expiresAt,
    lastAccessedAt: currentTs,
  });
  void evictCacheLru().catch(() => {});
}

export async function touchEncCached(url) {
  const key = String(url);
  const row = await db.mediaCache.get(key);
  if (row) {
    await db.mediaCache.update(key, { lastAccessedAt: now() });
  }
}

export async function touchDecCached(msgId) {
  const key = decCachedKey(msgId);
  const row = await db.mediaCache.get(key);
  if (row) {
    await db.mediaCache.update(key, { lastAccessedAt: now() });
  }
}

export async function getDecCached(msgId) {
  const key = decCachedKey(msgId);
  const row = await getFresh(db.mediaCache, key);
  // A stored row with no bytes is worse than no row: it would render as a
  // broken picture instead of falling back to a fresh download.
  const usable = usableDecCachedRow(row);
  if (row && !usable) void db.mediaCache.delete(key).catch(() => {});
  return usable;
}

export async function putDecCached(msgId, buf, mime, { previewable = true } = {}) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // Never let a failed or malformed decrypt poison the cache.
  if (!bytes.byteLength) return;
  const currentTs = now();
  const expiry = createExpiry(currentTs);
  await db.mediaCache.put({
    key: decCachedKey(msgId),
    type: "dec",
    buf: bytes,
    size: bytes.byteLength,
    mime: mime || "application/octet-stream",
    previewable: previewable !== false,
    createdAt: currentTs,
    expiresAt: expiry.expiresAt,
    lastAccessedAt: currentTs,
  });
  void evictCacheLru().catch(() => {});
}

/** Forget one decrypted copy so the next render downloads it again. */
export async function clearDecCached(msgId) {
  await db.mediaCache.delete(decCachedKey(msgId));
}

export async function clearEncCached(url) {
  await db.mediaCache.delete(String(url));
}

export async function stageUpload(tempKey, buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const currentTs = now();
  await db.mediaCache.put({
    key: `staged:${tempKey}`,
    type: "staged",
    buf: bytes,
    size: bytes.byteLength,
    createdAt: currentTs,
    expiresAt: currentTs + STAGED_UPLOAD_MAX_AGE_MS,
    lastAccessedAt: currentTs,
  });
  void evictCacheLru().catch(() => {});
}

export async function getStagedUpload(tempKey) {
  const row = await getFresh(db.mediaCache, `staged:${tempKey}`);
  return row?.buf ? (row.buf instanceof Uint8Array ? row.buf : new Uint8Array(row.buf)) : null;
}

export async function clearStagedUpload(tempKey) {
  await db.mediaCache.delete(`staged:${tempKey}`);
}

// ─── Messaging, Search & Room Meta ──────────────────────────────────────────

export async function indexRoomMessage(roomId, row) {
  const record = await buildMessageSearchRecord({ ...row, roomId });
  if (!record) return;
  await db.messageSearch.put(record);
}

export async function deleteRoomMessage(messageId) {
  const key = String(messageId || "");
  if (!key) return;
  await Promise.all([
    db.messageSearch.delete(key),
    db.rawEvents.delete(key),
    db.mediaCache.delete(decCachedKey(key)),
  ]);
}

export async function deleteRawEvent(id) {
  if (!id) return;
  const key = String(id);
  await db.rawEvents.delete(key);
  dequeueOutboxEvents([key]);
}

export async function putRoomMeta(roomId, patch) {
  const id = String(roomId || "");
  if (!id) return;
  const existing = (await db.roomMeta.get(id)) || null;
  const normalized = normalizeRoomMeta(id, patch, existing);
  if (!normalized) return;
  await db.roomMeta.put(normalized);
}

export async function getRoomMeta(roomId) {
  const id = String(roomId || "");
  if (!id) return null;
  return getFresh(db.roomMeta, id);
}

export async function listRoomMeta() {
  const rows = await db.roomMeta.where("expiresAt").above(now()).sortBy("lastMessageTs");
  return rows.reverse();
}

export async function getStoredGroup(groupId) {
  const id = String(groupId || "");
  if (!id) return null;
  return getFresh(db.groups, id);
}

export async function putStoredGroup(group) {
  if (!group?.groupId) return;
  const id = String(group.groupId);
  const existing = (await db.groups.get(id)) || null;
  const normalized = normalizeStoredGroup(group, existing);
  if (!normalized) return;
  await db.groups.put(normalized);
}

export async function listStoredGroups() {
  const rows = await db.groups.where("expiresAt").above(now()).sortBy("lastMessageTs");
  return rows.reverse();
}

export async function indexGroupMessage(message) {
  const record = await buildMessageSearchRecord(message);
  if (!record) return;
  await db.messageSearch.put(record);
}

export function filterMessageSearchResults(
  hits,
  tokens = [],
  { sinceTs = null, limitPerContact = null, currentTime = now() } = {},
) {
  let valid = (hits || []).filter((h) => toNumber(h.expiresAt, 0) > currentTime);

  if (tokens.length > 1) {
    valid = valid.filter((h) => {
      const itemTokens = new Set(h.tokens || []);
      return tokens.every((t) => itemTokens.has(t));
    });
  }

  if (typeof sinceTs === "number" && sinceTs > 0) {
    valid = valid.filter((h) => toNumber(h.ts, 0) >= sinceTs);
  }

  valid.sort((a, b) => toNumber(b.ts, 0) - toNumber(a.ts, 0));

  if (typeof limitPerContact === "number" && limitPerContact > 0) {
    const contactCounts = new Map();
    valid = valid.filter((h) => {
      const key = h.roomId || h.groupId || "general";
      const count = contactCounts.get(key) || 0;
      if (count >= limitPerContact) return false;
      contactCounts.set(key, count + 1);
      return true;
    });
  }

  return valid;
}

export async function searchMessages(query, { sinceTs = null, limitPerContact = null } = {}) {
  const tokens = tokenizeSearchText(query);
  if (!tokens.length) return [];
  const hits = await db.messageSearch.where("tokens").equals(tokens[0]).toArray();
  return filterMessageSearchResults(hits, tokens, { sinceTs, limitPerContact });
}

// ─── Relay Telemetry & Health Tracking ──────────────────────────────────────

export async function recordRelayOutcomes(operation, outcomes) {
  if (!Array.isArray(outcomes) || !outcomes.length) return;
  const currentTs = now();

  for (const outcome of outcomes) {
    const relay = normalizeRelay(outcome?.relay);
    if (!relay) continue;

    const existing = (await db.relayStats.get(relay)) || {
      relay,
      publishOk: 0,
      publishTotal: 0,
      queryOk: 0,
      queryTotal: 0,
      connectOk: 0,
      connectTotal: 0,
      ewmaOk: null,
      ewmaLatencyMs: null,
      lastError: null,
      batteryMode: null,
    };

    const isOk = Boolean(outcome.ok);
    const latency = toNumber(outcome.latencyMs, 0);

    if (operation === "publish") {
      existing.publishTotal = (existing.publishTotal || 0) + 1;
      if (isOk) existing.publishOk = (existing.publishOk || 0) + 1;
    } else if (operation === "query") {
      existing.queryTotal = (existing.queryTotal || 0) + 1;
      if (isOk) existing.queryOk = (existing.queryOk || 0) + 1;
    } else if (operation === "connect") {
      existing.connectTotal = (existing.connectTotal || 0) + 1;
      if (isOk) existing.connectOk = (existing.connectOk || 0) + 1;
    }

    if (outcome.error && !isOk) {
      existing.lastError = String(outcome.error);
    }

    // Detailed probes report the node's battery mode; the engine reads it back
    // through getRelayCapacityModes() to keep read-only nodes out of push work.
    const batteryMode = String(outcome.mode || "")
      .trim()
      .toLowerCase();
    if (batteryMode) existing.batteryMode = batteryMode;

    existing.ewmaOk = updateOkEwma(existing.ewmaOk, isOk);
    if (latency > 0) {
      existing.ewmaLatencyMs = updateLatencyEwma(existing.ewmaLatencyMs, latency);
    }
    existing.updatedAt = currentTs;
    existing.expiresAt = currentTs + RELAY_STATS_RETENTION_MS;

    await db.relayStats.put(existing);
  }
}

export async function getRelayHealthSummary() {
  const currentTime = now();
  const rows = await db.relayStats.where("expiresAt").above(currentTime).toArray();
  return rows.map((r) => {
    const pubRate = r.publishTotal ? Math.round((r.publishOk / r.publishTotal) * 100) : null;
    const qryRate = r.queryTotal ? Math.round((r.queryOk / r.queryTotal) * 100) : null;
    const conRate = r.connectTotal ? Math.round((r.connectOk / r.connectTotal) * 100) : null;
    const tier = classifyTraffic(pubRate, r.publishTotal, qryRate, r.queryTotal);
    return {
      relay: r.relay,
      tier,
      publishSuccessRate: pubRate,
      querySuccessRate: qryRate,
      connectSuccessRate: conRate,
      publishOk: r.publishOk || 0,
      publishTotal: r.publishTotal || 0,
      queryOk: r.queryOk || 0,
      queryTotal: r.queryTotal || 0,
      connectOk: r.connectOk || 0,
      connectTotal: r.connectTotal || 0,
      avgPublishMs: r.ewmaLatencyMs ? Math.round(r.ewmaLatencyMs) : null,
      lastError: r.lastError || null,
      batteryMode: r.batteryMode || null,
    };
  });
}

export async function deleteRelayStats(relays) {
  if (!Array.isArray(relays) || !relays.length) return;
  const list = relays.map(normalizeRelay).filter(Boolean);
  await db.relayStats.bulkDelete(list);
}

/**
 * Last observed battery mode per relay, keyed by normalized relay URL. The
 * replication engine uses it to pull from read-only nodes while leaving them
 * out of push targets. Relays that never reported telemetry stay absent, so
 * unknown modes still count as writable.
 */
export async function getRelayCapacityModes() {
  const currentTime = now();
  const rows = await db.relayStats.where("expiresAt").above(currentTime).toArray();
  const modes = {};
  for (const row of rows) {
    const relay = normalizeRelay(row?.relay);
    const mode = String(row?.batteryMode || "")
      .trim()
      .toLowerCase();
    if (relay && mode) modes[relay] = mode;
  }
  return modes;
}

// ─── Relay Hint Cache ───────────────────────────────────────────────────────

/**
 * Replace the suggestion cache with the given rows. Each row is keyed by its
 * normalized relay URL, so re-fetching is an upsert and a disappearing hint
 * expires on its own `expiresAt` (capped by the caller's TTL).
 */
export async function putRelayHints(rows) {
  const list = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const url = normalizeRelay(row?.url);
      if (!url) return null;
      const updatedAt = Math.max(0, toNumber(row?.updatedAt, now()));
      const expiresAt = Math.max(0, toNumber(row?.expiresAt, 0));
      return {
        ...row,
        url,
        updatedAt,
        expiresAt: expiresAt > updatedAt ? expiresAt : updatedAt,
      };
    })
    .filter(Boolean);
  if (!list.length) return [];
  await db.relayHints.bulkPut(list);
  return list;
}

/** Fresh hint rows. Expired rows are left for purgeExpiredCache(). */
export async function listRelayHints() {
  const currentTime = now();
  return db.relayHints.where("expiresAt").above(currentTime).toArray();
}

export async function deleteRelayHints(urls) {
  if (!Array.isArray(urls) || !urls.length) return;
  const list = urls.map(normalizeRelay).filter(Boolean);
  if (!list.length) return;
  await db.relayHints.bulkDelete(list);
}

// ─── Storage Cache Summaries ────────────────────────────────────────────────

export async function getCacheSummary() {
  const [media, roomMeta, groups, rawEvents, blobs] = await Promise.all([
    summarizeTable("mediaCache"),
    summarizeTable("roomMeta"),
    summarizeTable("groups"),
    summarizeTable("rawEvents"),
    summarizeTable("engineBlobs"),
  ]);

  const stores = [media, roomMeta, groups, rawEvents, blobs].filter(Boolean);
  const totalEntries = stores.reduce((sum, s) => sum + s.entries, 0);
  const totalEstimatedBytes = stores.reduce((sum, s) => sum + s.estimatedBytes, 0);

  return {
    dbName: APP_CACHE_DB_NAME,
    totalEntries,
    totalEstimatedBytes,
    stores,
  };
}

export async function getRawEventsBreakdown() {
  const rows = await db.rawEvents.toArray();
  const byOrigin = new Map();
  const byKind = new Map();
  const byGuptTag = new Map();

  for (const row of rows) {
    const origin = row.origin || "unknown";
    byOrigin.set(origin, (byOrigin.get(origin) || 0) + 1);
    const kind = row.kind ?? "unknown";
    byKind.set(kind, (byKind.get(kind) || 0) + 1);
  }

  const formatEntries = (map) =>
    Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  return {
    total: rows.length,
    byOrigin: formatEntries(byOrigin),
    byKind: formatEntries(byKind),
    byGuptTag: formatEntries(byGuptTag),
  };
}

// ─── Raw Event Storage & Engine Reconciliation ──────────────────────────────

export async function putRawEvent(event, origin, denorm = {}) {
  if (!event?.id) return;
  const createdAt = toNumber(event.created_at, 0) * 1000;
  const expiryTag = event.tags?.find((t) => t[0] === "expiration");

  let expiresAt;
  if (expiryTag) {
    expiresAt = Number(expiryTag[1]) * 1000;
  } else if (origin === "bookmarks" || origin === "passwords" || origin === "notes") {
    expiresAt = Number.MAX_SAFE_INTEGER;
  } else {
    expiresAt = createdAt + readConfiguredRetentionMs();
  }

  const existing = await db.rawEvents.get(event.id).catch(() => null);

  const row = {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    origin,
    peerPubkey: denorm.peerPubkey || null,
    roomId: denorm.roomId || null,
    groupId: denorm.groupId || null,
    type: denorm.type || null,
    createdAt,
    expiresAt,
    lastReplicatedAt: existing?.lastReplicatedAt || 0,
    syncAttempts: existing?.syncAttempts || 0,
    lastAttemptAt: existing?.lastAttemptAt || 0,
    lastAckedAt: existing?.lastAckedAt || 0,
    lastSyncError: existing?.lastSyncError || null,
    appliedAt: existing?.appliedAt || null,
    event,
  };

  await db.rawEvents.put(row);

  // Self-authored rows are the only ones relays cannot rebuild, so an unsent
  // one is mirrored to the local outbox until a relay acks it.
  const owner = resolveDbOwner();
  if (owner && normalizeOwner(event.pubkey) === owner && toNumber(row.lastReplicatedAt, 0) === 0) {
    queueOutboxEvent(row);
  }
}

export async function getRawEventsByOrigin(origin, { minCreatedAt = 0 } = {}) {
  const rows = await db.rawEvents.where("origin").equals(String(origin)).toArray();
  if (!minCreatedAt) return rows;
  return rows.filter((row) => toNumber(row.createdAt, 0) >= minCreatedAt);
}

export async function getReplicationCandidates({
  limit = 10,
  origins = null,
  excludeOrigins = null,
  filter = null,
} = {}) {
  const nowMs = now();
  const include = Array.isArray(origins) ? new Set(origins) : null;
  const exclude = Array.isArray(excludeOrigins) ? new Set(excludeOrigins) : null;
  const rows = [];

  await db.rawEvents
    .where("lastReplicatedAt")
    .belowOrEqual(nowMs)
    .filter((row) => {
      if (toNumber(row.expiresAt, 0) <= nowMs) return false;
      if (include && !include.has(row.origin)) return false;
      if (exclude && exclude.has(row.origin)) return false;
      if (typeof filter === "function" && !filter(row)) return false;
      return true;
    })
    .until(() => rows.length >= limit)
    .each((row) => rows.push(row));

  return rows;
}

export async function markEventsReplicated(ids, ts = now()) {
  if (!ids?.length) return;
  await db.rawEvents.bulkUpdate(ids.map((id) => ({ key: id, changes: { lastReplicatedAt: ts } })));
  // A fully-replicated event no longer needs the localStorage safety net.
  if (toNumber(ts, 0) >= OUTBOX_DONE_AT) dequeueOutboxEvents(ids);
}

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
}

export async function recordOutboxResult({
  ackedIds = [],
  unackedIds = [],
  failedAfter = 5,
  error = "no relay ack",
} = {}) {
  const ts = now();
  const acked = uniqueIds(ackedIds);
  const unacked = uniqueIds(unackedIds).filter((id) => !acked.includes(id));
  const failedIds = [];

  if (acked.length) {
    const rows = await db.rawEvents.bulkGet(acked);
    const updates = rows.filter(Boolean).map((row) => ({
      key: row.id,
      changes: { syncAttempts: 0, lastSyncError: null, lastAckedAt: ts },
    }));
    if (updates.length) await db.rawEvents.bulkUpdate(updates);
    dequeueOutboxEvents(acked);
  }

  if (unacked.length) {
    const rows = await db.rawEvents.bulkGet(unacked);
    const updates = [];
    for (const row of rows) {
      if (!row) continue;
      const attempts = (row.syncAttempts || 0) + 1;
      const isFailed = attempts >= failedAfter;
      if (isFailed) failedIds.push(row.id);
      updates.push({
        key: row.id,
        changes: {
          syncAttempts: attempts,
          lastAttemptAt: ts,
          lastSyncError: error,
          lastReplicatedAt: isFailed ? OUTBOX_DONE_AT : ts + Math.min(60000, 1000 * 2 ** attempts),
        },
      });
    }
    if (updates.length) await db.rawEvents.bulkUpdate(updates);
  }

  return { failedIds };
}

export async function getOutboxSnapshot({ origins = null, filter = null, failedAfter = 5 } = {}) {
  const rows = await db.rawEvents.toArray();
  const nowMs = now();
  const include = Array.isArray(origins) ? new Set(origins) : null;

  let inFlight = 0;
  let retryPending = 0;
  let failed = 0;
  const failedIds = [];

  for (const row of rows) {
    if (include && !include.has(row.origin)) continue;
    if (typeof filter === "function" && !filter(row)) continue;
    if (toNumber(row.expiresAt, 0) <= nowMs) continue;

    const attempts = row.syncAttempts || 0;
    if (attempts >= failedAfter || row.lastReplicatedAt === OUTBOX_DONE_AT) {
      failed++;
      if (failedIds.length < OUTBOX_FAILED_IDS_MAX) failedIds.push(row.id);
    } else if (attempts > 0) {
      retryPending++;
    } else if (row.lastReplicatedAt === 0) {
      inFlight++;
    }
  }

  return { inFlight, retryPending, failed, failedIds };
}

export async function markRawEventsApplied(ids) {
  if (!ids?.length) return;
  const ts = now();
  await db.rawEvents.bulkUpdate(ids.map((id) => ({ key: id, changes: { appliedAt: ts } })));
}

export async function listUnappliedRawEvents({ origin = "dm", limit = 300 } = {}) {
  const rows = await db.rawEvents.where("origin").equals(origin).toArray();
  return rows.filter((r) => !r.appliedAt).slice(0, limit);
}

export async function getEngineCursor(key) {
  const row = await db.meta.get(`cursor:${key}`);
  return row?.value || null;
}

export async function putEngineCursor(key, cursor) {
  await db.meta.put({
    key: `cursor:${key}`,
    value: cursor,
    updatedAt: now(),
  });
}

export async function getEngineWatermark(key) {
  const row = await db.meta.get(`watermark:${key}`);
  return Number(row?.value || 0);
}

export async function setEngineWatermark(key, watermarkSec) {
  await db.meta.put({
    key: `watermark:${key}`,
    value: Math.floor(Number(watermarkSec) || 0),
    updatedAt: now(),
  });
}

export async function countLocalRawEvents({
  collection = null,
  owner = null,
  since = null,
  until = null,
} = {}) {
  const rows = await db.rawEvents.toArray();
  return rows.filter((row) => {
    if (collection && row.origin !== collection) return false;
    if (owner && row.pubkey !== owner) return false;
    const createdAtSec = Math.floor(toNumber(row.createdAt, 0) / 1000);
    if (since !== null && createdAtSec < since) return false;
    if (until !== null && createdAtSec > until) return false;
    return true;
  }).length;
}

export async function getLatestRawEventCreatedAt({ origin = null } = {}) {
  const rows = origin
    ? await db.rawEvents.where("origin").equals(origin).toArray()
    : await db.rawEvents.toArray();
  if (!rows.length) return 0;
  return rows.reduce((latest, r) => Math.max(latest, toNumber(r.createdAt, 0)), 0);
}

export async function mergeRawEventsByOrigin(origin, events) {
  const list = Array.isArray(events) ? events : [];
  for (const ev of list) {
    await putRawEvent(ev, origin);
  }
  return getRawEventsByOrigin(origin);
}

export async function listRoomEventsBefore(roomId, beforeMs, limit = 100) {
  const id = String(roomId || "");
  if (!id) return [];
  const currentTime = now();
  const before = Math.max(0, toNumber(beforeMs, currentTime));
  const rows = await db.rawEvents
    .where("[roomId+createdAt]")
    .between([id, 0], [id, before], true, false)
    .reverse()
    .limit(Math.max(1, limit))
    .toArray();
  return rows.filter((row) => row.origin === "dm" && toNumber(row.expiresAt, 0) > currentTime);
}

export async function listGroupEventsBefore(groupId, beforeMs, limit = 100) {
  const id = String(groupId || "");
  if (!id) return [];
  const currentTime = now();
  const before = Math.max(0, toNumber(beforeMs, currentTime));
  const rows = await db.rawEvents
    .where("[groupId+createdAt]")
    .between([id, 0], [id, before], true, false)
    .reverse()
    .limit(Math.max(1, limit))
    .toArray();
  return rows.filter((row) => row.origin === "group" && toNumber(row.expiresAt, 0) > currentTime);
}

export async function listRoomEvents(roomId) {
  const currentTime = now();
  const allForRoom = await db.rawEvents.where("roomId").equals(String(roomId)).toArray();
  return allForRoom.filter(
    (row) => row.origin === "dm" && toNumber(row.expiresAt, 0) > currentTime,
  );
}

export async function listGroupEvents(groupId) {
  const currentTime = now();
  const allForGroup = await db.rawEvents.where("groupId").equals(String(groupId)).toArray();
  return allForGroup.filter(
    (row) => row.origin === "group" && toNumber(row.expiresAt, 0) > currentTime,
  );
}
