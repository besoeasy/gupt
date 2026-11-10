// Engine blob layer: every stored or fetched byte is sha256-verified against
// its content-addressed hash. The local Dexie cache is preferred; relays are
// the fallback and get verified before caching.
import { getBlobVerified, putBlobToRelay, sha256HexOfBytes } from "./core.js";
import { deleteEngineBlob, evictEngineBlobs, getEngineBlob, putEngineBlob } from "../idb.js";

function toBytes(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

export async function hashBytes(bytes) {
  return sha256HexOfBytes(toBytes(bytes));
}

/** Store bytes locally under their own sha256. Returns the verified hash. */
export async function putBlob(bytes, { expiresAt = null } = {}) {
  const body = toBytes(bytes);
  if (!body?.byteLength) throw new Error("putBlob: empty bytes");
  const hash = await sha256HexOfBytes(body);
  await putEngineBlob(hash, body, { expiresAt });
  void evictEngineBlobs().catch(() => {});
  return hash;
}

/** Store bytes addressed by an expected hash; rejects corruption. */
export async function putVerifiedBlob(hash, bytes, { expiresAt = null } = {}) {
  const key = String(hash || "").toLowerCase();
  const body = toBytes(bytes);
  if (!key || !body?.byteLength) throw new Error("putVerifiedBlob: bad input");
  const actual = await sha256HexOfBytes(body);
  if (actual !== key) {
    const err = new Error(`blob ${key.slice(0, 12)}… does not match sha256`);
    err.name = "CorruptBlobError";
    throw err;
  }
  await putEngineBlob(key, body, { expiresAt });
  void evictEngineBlobs().catch(() => {});
  return key;
}

/**
 * Local-first blob fetch. Local bytes are re-hashed on every read; a corrupt
 * row is dropped and the verified relay copy is fetched instead.
 */
export async function getBlobBytes(hash, { relays = [] } = {}) {
  const key = String(hash || "").toLowerCase();
  if (!key) return null;

  const local = toBytes(await getEngineBlob(key));
  if (local) {
    if ((await sha256HexOfBytes(local)) === key) return local;
    await deleteEngineBlob(key).catch(() => {});
  }

  for (const relay of Array.isArray(relays) ? relays.filter(Boolean) : []) {
    try {
      const bytes = await getBlobVerified(relay, key);
      if (bytes) {
        await putEngineBlob(key, bytes, { expiresAt: null }).catch(() => {});
        void evictEngineBlobs().catch(() => {});
        return bytes;
      }
    } catch (err) {
      if (err?.name === "CorruptBlobError") continue; // relay fault; fail over
      // Network failures on one relay should not block the next one.
    }
  }
  return null;
}

/** Worker-side adapter: local cache miss falls back to verified relay fetches. */
export function createBlobAdapter(relays) {
  const list = () => (Array.isArray(relays) ? relays.filter(Boolean) : []);
  return {
    async getBlobBytesFromRelays(hash) {
      return getBlobBytes(hash, { relays: list() });
    },
    async fetchVerified(relay, hash) {
      return getBlobVerified(relay, String(hash || "").toLowerCase());
    },
    async pushToRelay(relay, hash, bytes) {
      return putBlobToRelay(relay, String(hash || "").toLowerCase(), toBytes(bytes));
    },
  };
}
