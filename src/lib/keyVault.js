import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { WRITER_VERSION } from "./writerVersion.js";

/**
 * Device vault: the account private key at rest, wrapped by a non-extractable
 * AES-GCM CryptoKey that lives in this origin's IndexedDB.
 *
 * The wrapped key is the only copy of the account key on disk, and the wrapper
 * key's bytes can never be read by JavaScript — not by app code, not by XSS,
 * not by `exportKey()`. The browser keeps that material behind the OS key store
 * (Keychain / DPAPI / login keyring), so copying a profile folder to another
 * machine yields nothing usable.
 *
 * This module owns `gupt_vault_v1` and nothing else may name or open it. That
 * separation is load-bearing: the cache database is disposable and is deleted
 * on every PWA update, every logout and every SCHEMA_EPOCH bump (see
 * `src/lib/idb.js`), while the vault must outlive all of that. It also must not
 * be reachable from `idb.js`, which is bundled into the replication and Rabta
 * sync workers — they have no business carrying key code.
 *
 * Plain HTTP has no `crypto.subtle`, so `isSupported()` is false there and the
 * app keeps the key in memory only, logging in again on every load.
 */

export const VAULT_DB_NAME = "gupt_vault_v1";

/**
 * Inactivity window: how long the remembered key survives without the app
 * being opened or used. Chosen at login from the stops below, stored per
 * record, so the default only applies to a record that carries no value.
 */
export const VAULT_TTL_MS = 30 * 60 * 60 * 1000;
export const VAULT_TTL_MIN_MS = 5 * 60 * 1000;
export const VAULT_TTL_MAX_MS = 3 * 24 * 60 * 60 * 1000;

/** The values the login slider offers; also the range every save is clamped to. */
export const VAULT_TTL_STOPS_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  VAULT_TTL_MS,
  2 * 24 * 60 * 60 * 1000,
  VAULT_TTL_MAX_MS,
];

const VAULT_DB_VERSION = 1;
const VAULT_STORE = "vault";
const VAULT_RECORD_ID = "device";
const VAULT_RECORD_VERSION = 1;
// Records written before the slider stored whole hours. Read them as-is.
// COMPAT: remove after 2027-12-25 — pre-slider vault records stored `ttlHours`; last written 2026-11-20, window is 400 days.
const LEGACY_MIN_TTL_HOURS = 1;
const LEGACY_MAX_TTL_HOURS = 24 * 365;
const MIN_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const PRIVKEY_HEX_RE = /^[0-9a-f]{64}$/;

let dbPromise = null;
let lastTouchAt = 0;
// Mirrors the loaded record's window so the activity listeners can throttle
// without reading IndexedDB on every tap.
let activeTtlMs = VAULT_TTL_MS;

function getIdbFactory() {
  if (typeof indexedDB !== "undefined") return indexedDB;
  if (typeof window !== "undefined" && window.indexedDB) return window.indexedDB;
  if (typeof self !== "undefined" && self.indexedDB) return self.indexedDB;
  return null;
}

function getSubtle() {
  return globalThis.crypto?.subtle ?? null;
}

/**
 * True only where an unextractable wrapper key is possible: a secure context
 * with WebCrypto and IndexedDB. Every caller must handle `false` by keeping
 * the key in memory only.
 */
export function isSupported() {
  return Boolean(getSubtle() && getIdbFactory());
}

export function normalizeTtlMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return VAULT_TTL_MS;
  const clamped = Math.min(VAULT_TTL_MAX_MS, Math.max(VAULT_TTL_MIN_MS, ms));
  return Math.round(clamped / MINUTE_MS) * MINUTE_MS;
}

function legacyTtlMs(record) {
  const hours = Number(record?.ttlHours);
  if (!Number.isFinite(hours) || hours <= 0) return VAULT_TTL_MS;
  const ms = hours * 60 * 60 * 1000;
  return Math.min(
    LEGACY_MAX_TTL_HOURS * 60 * 60 * 1000,
    Math.max(LEGACY_MIN_TTL_HOURS * 60 * 60 * 1000, ms),
  );
}

/** The window a record carries: `ttlMs` now, `ttlHours` on older records. */
export function recordTtlMs(record) {
  const ms = Number(record?.ttlMs);
  if (Number.isFinite(ms) && ms > 0) return normalizeTtlMs(ms);
  return legacyTtlMs(record);
}

/** Human label for a window: "5 minutes", "30 hours", "3 days". */
export function formatVaultTtl(value) {
  const minutes = Math.round(normalizeTtlMs(value) / MINUTE_MS);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}

/** Binds a ciphertext to one public key: a swapped record fails to decrypt. */
function additionalData(pubkeyHex) {
  return new TextEncoder().encode(`gupt-vault-v1\u0000${pubkeyHex}`);
}

function openDb() {
  if (dbPromise) return dbPromise;

  const idb = getIdbFactory();
  if (!idb) return Promise.resolve(null);

  dbPromise = new Promise((resolve) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      dbPromise = null;
      resolve(null);
    };

    try {
      const req = idb.open(VAULT_DB_NAME, VAULT_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VAULT_STORE)) {
          db.createObjectStore(VAULT_STORE);
        }
      };
      req.onsuccess = () => {
        settled = true;
        const db = req.result;
        // A blocked upgrade or a deleted database must not leave a dead handle.
        db.onversionchange = () => db.close();
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = fail;
      req.onblocked = fail;
    } catch {
      fail();
    }
  });

  return dbPromise;
}

/**
 * Runs one request inside its own transaction and resolves with the request's
 * result on commit, or null on any failure. IndexedDB failures are never worth
 * throwing at the caller: the app treats a missing vault as "log in again".
 */
function run(mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);

        let result = null;
        try {
          const tx = db.transaction(VAULT_STORE, mode);
          const request = work(tx.objectStore(VAULT_STORE));
          if (request) request.onsuccess = () => (result = request.result ?? null);
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

function isExpired(record, now = Date.now()) {
  const ttlMs = recordTtlMs(record);
  const lastSeenAt = Number(record?.lastSeenAt) || 0;
  const delta = now - lastSeenAt;
  // A backwards clock change is ignored: never expire because of it. A huge
  // forward jump is treated as real elapsed time (this is policy, not auth).
  if (delta < 0) return false;
  return delta > ttlMs;
}

function persistStorage() {
  try {
    void navigator?.storage?.persist?.().catch?.(() => {});
  } catch {
    // Storage persistence is a best-effort hint; the TTL is the real control.
  }
}

/**
 * Wraps and stores the account key. Overwrites any previous record, so one
 * browser profile holds exactly one remembered account, matching the router.
 * Returns false when the platform cannot hold an unextractable key (plain HTTP)
 * or when storage refuses the write — callers must not treat that as fatal.
 */
export async function save(privkeyHex, pubkeyHex, ttlMs = VAULT_TTL_MS) {
  const privkey = String(privkeyHex || "").trim().toLowerCase();
  const pubkey = String(pubkeyHex || "").trim().toLowerCase();
  if (!PRIVKEY_HEX_RE.test(privkey) || !PRIVKEY_HEX_RE.test(pubkey)) return false;

  const subtle = getSubtle();
  if (!subtle || !getIdbFactory()) return false;

  try {
    const deviceKey = await subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // never extractable: the wrapper key cannot leave the browser
      ["encrypt", "decrypt"],
    );

    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: additionalData(pubkey) },
      deviceKey,
      hexToBytes(privkey),
    );

    const now = Date.now();
    const ttl = normalizeTtlMs(ttlMs);
    const record = {
      id: VAULT_RECORD_ID,
      v: VAULT_RECORD_VERSION,
      w: WRITER_VERSION,
      pubkeyHex: pubkey,
      iv,
      ct: new Uint8Array(ct),
      deviceKey,
      lastSeenAt: now,
      createdAt: now,
      ttlMs: ttl,
    };

    const stored = await run("readwrite", (store) => store.put(record, VAULT_RECORD_ID));
    // put() resolves with the record key on commit; a null means the
    // transaction never completed, so nothing durable was written.
    if (stored === null) return false;

    lastTouchAt = now;
    activeTtlMs = ttl;
    persistStorage();
    return true;
  } catch {
    return false;
  }
}

async function readRecord() {
  const record = await run("readonly", (store) => store.get(VAULT_RECORD_ID));
  return record && typeof record === "object" ? record : null;
}

/**
 * Unwraps the remembered account. Returns null when there is no vault, it has
 * expired, or it cannot be opened — and in the last two cases the record is
 * deleted, so a broken vault can never wedge the app into a retry loop.
 *
 * The caller must still verify that `pubkeyHex` is the account it expects; see
 * `runInit()` in `src/stores/identity.js`.
 */
export async function open() {
  if (!isSupported()) return null;

  const record = await readRecord();
  if (!record) return null;

  const pubkey = String(record.pubkeyHex || "").toLowerCase();
  if (!PRIVKEY_HEX_RE.test(pubkey) || !record.deviceKey || !record.iv || !record.ct) {
    await forget();
    return null;
  }

  if (isExpired(record)) {
    await forget();
    return null;
  }

  try {
    const plain = await getSubtle().decrypt(
      { name: "AES-GCM", iv: record.iv, additionalData: additionalData(pubkey) },
      record.deviceKey,
      record.ct,
    );
    const bytes = new Uint8Array(plain);
    if (bytes.byteLength !== 32) {
      bytes.fill(0);
      await forget();
      return null;
    }

    const privkeyHex = bytesToHex(bytes);
    bytes.fill(0);

    // Opening the app is the "seen" event the inactivity window measures.
    const now = Date.now();
    const ttl = recordTtlMs(record);
    record.lastSeenAt = now;
    // Migrate a pre-slider record to the millisecond field on first open.
    record.ttlMs = ttl;
    delete record.ttlHours;
    // Stamp pre-stamp records so every vault row carries its writer.
    record.w = record.w || WRITER_VERSION;
    lastTouchAt = now;
    activeTtlMs = ttl;
    await run("readwrite", (store) => store.put(record, VAULT_RECORD_ID));

    return {
      pubkeyHex: pubkey,
      privkeyHex,
      lastSeenAt: Number(record.lastSeenAt) || 0,
      ttlMs: ttl,
    };
  } catch {
    // Wrong key, tampered ciphertext, or a different account: fail closed.
    await forget();
    return null;
  }
}

/**
 * Refreshes `lastSeenAt`, throttled so this can be called from every tap,
 * keypress and hide without turning into a disk write each time. The window
 * is a quarter of the TTL (capped at five minutes), so a short TTL still
 * refreshes often enough to never lapse mid-use.
 */
export async function touch() {
  if (!isSupported()) return false;

  const now = Date.now();
  if (now - lastTouchAt < Math.min(MIN_TOUCH_INTERVAL_MS, activeTtlMs / 4)) return false;

  const record = await readRecord();
  if (!record) return false;

  const ttl = recordTtlMs(record);
  if (isExpired(record, now)) {
    await forget();
    return false;
  }

  lastTouchAt = now;
  activeTtlMs = ttl;
  record.lastSeenAt = now;
  record.ttlMs = ttl;
  await run("readwrite", (store) => store.put(record, VAULT_RECORD_ID));
  return true;
}

/**
 * Read-only expiry check for the watchdog: unlike `open()`, this never touches
 * `lastSeenAt`, so watching the window cannot keep it alive on its own.
 */
export async function isCurrent(pubkeyHex) {
  if (!isSupported()) return true;

  const record = await readRecord();
  if (!record) return false;
  if (String(record.pubkeyHex || "").toLowerCase() !== String(pubkeyHex || "").toLowerCase()) {
    return false;
  }
  if (isExpired(record)) {
    await forget();
    return false;
  }
  activeTtlMs = recordTtlMs(record);
  return true;
}

/**
 * Deletes the remembered account: the only way key material leaves this device
 * apart from expiry. Clears the record first (so a blocked database delete can
 * never leave a usable key behind) and then drops the database itself.
 */
export async function forget() {
  lastTouchAt = 0;
  activeTtlMs = VAULT_TTL_MS;

  const db = await openDb();
  if (db) {
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(VAULT_STORE, "readwrite");
        tx.objectStore(VAULT_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
    try {
      db.close();
    } catch {
      // Already closed.
    }
  }

  dbPromise = null;

  const idb = getIdbFactory();
  if (!idb) return false;

  return new Promise((resolve) => {
    try {
      const req = idb.deleteDatabase(VAULT_DB_NAME);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false); // Another tab still holds it open.
    } catch {
      resolve(false);
    }
  });
}
