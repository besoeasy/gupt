import Dexie from "dexie";
import {
  readConfiguredRetentionDays,
  readConfiguredRetentionMs,
  RETENTION_MAX_BYTES,
} from "../config/retention.js";
import { normalizeRelayUrl } from "../config/servers.js";
import { compressTextForCache, decompressTextFromCache } from "./messageCompression.js";
import {
  updateLatencyEwma,
  updateOkEwma,
  relayScore,
  trafficSamples,
  rankingLatencyMs,
} from "./relay/score.js";
import { classifyTraffic } from "./relay/constants.js";

const APP_CACHE_DB_NAME = "gupt_app_cache_v3";
const STAGED_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const RELAY_STATS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const OUTBOX_DONE_AT = Number.MAX_SAFE_INTEGER;
const OUTBOX_FAILED_IDS_MAX = 20;

function getMaxCacheAgeMs() {
  return readConfiguredRetentionMs();
}

function profileTtl() {
  return PROFILE_TTL_MS + (Math.random() - 0.5) * 8 * 60 * 60 * 1000;
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

const DB_VERSION =
  parseInt(typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "2", 10) || 2;

class GuptCacheDb extends Dexie {
  constructor() {
    super(APP_CACHE_DB_NAME);

    this.version(DB_VERSION).stores({
      mediaCache: "&key, type, createdAt, expiresAt, lastAccessedAt",
      roomMeta: "&roomId, peerPubkey, updatedAt, lastMessageTs, expiresAt, unreadCount",
      groups: "&groupId, updatedAt, lastMessageTs, createdAt, expiresAt, unreadCount",
      profiles: "&pubkey, fetchedAt, expiresAt",
      syncCursors: "&peerPubkey, lastSyncMs, updatedAt",
      messageSearch: "&id, roomId, groupId, ts, expiresAt, *tokens",
      relayStats: "&relay, updatedAt, expiresAt",
      peerRelayHints: "&peerPubkey, updatedAt",
      rawEvents:
        "&id, pubkey, kind, origin, peerPubkey, roomId, groupId, type, createdAt, expiresAt, lastReplicatedAt, [kind+createdAt], [kind+origin+createdAt], [roomId+createdAt], [groupId+createdAt]",
    });

    // Dexie-side blob cache used by the Rabta engine. Bytes are stored
    // verified: the primary key hash must equal sha256(bytes).
    this.version(DB_VERSION + 1).stores({
      engineBlobs: "&hash, size, createdAt, expiresAt, lastAccessedAt",
    });

    this.version(DB_VERSION + 2).stores({
      sendTimings: null,
    });

    // Ownership stamp: exactly one row ("db_owner") naming the pubkey whose
    // data this database holds. Lives and dies with the data it describes.
    this.version(DB_VERSION + 3).stores({
      meta: "&key",
    });
  }
}

const db = new GuptCacheDb();
let maintenanceStarted = false;

const CACHE_TABLE_LABELS = {
  encMedia: "Encrypted media",
  decMedia: "Decrypted media",
  stagedUploads: "Staged uploads",
  roomMeta: "Room metadata",
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
  const expiry = createExpiry(ts);
  return {
    id,
    roomId: String(source.roomId || ""),
    groupId: String(source.groupId || ""),
    ts,
    tokens,
    expiresAt: expiry.expiresAt,
    text: source.text,
    sender: source.sender || "",
    mine: Boolean(source.mine),
  };
}

function getEntryActivityTimestamp(tableName, entry) {
  switch (tableName) {
    case "mediaCache":
    case "encMedia":
    case "decMedia":
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
    case "stagedUploads":
      return Math.max(storedExpiry, activityTimestamp + STAGED_UPLOAD_MAX_AGE_MS);
    case "mediaCache":
      // touchEncCached moves lastAccessedAt but never expiresAt, so here the
      // rolling activity value is the one that keeps hot media alive.
      return Math.max(storedExpiry, activityTimestamp + getMaxCacheAgeMs());
    case "profiles":
      return storedExpiry || activityTimestamp + PROFILE_TTL_MS;
    case "relayStats":
      // The writer rolls expiresAt forward on every touch, so stored wins.
      return storedExpiry || activityTimestamp + RELAY_STATS_RETENTION_MS;
    default:
      // The writer's expiresAt is authoritative: it encodes the event's own
      // NIP-40 expiration (up to 10 years for tombstones) or MAX_SAFE_INTEGER
      // for stream events that carry no tag. Honouring it also keeps this in
      // agreement with purgeExpiredCache, which filters on the stored index.
      // Only legacy rows written before a field existed fall back to the
      // retention window.
      return storedExpiry || activityTimestamp + getMaxCacheAgeMs();
  }
}

function isEntryExpired(tableName, entry, currentTime = now()) {
  return getEntryExpiryTimestamp(tableName, entry) <= currentTime;
}

async function purgeExpiredEntriesForTable(tableName) {
  return db.table(tableName).where("expiresAt").belowOrEqual(now()).delete();
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

  const text =
    row.type === "text" && row.text != null ? await prepareTextForStorage(row.text) : row.text;

  return {
    ...row,
    text,
    roomId: String(roomId),
    ts: toNumber(row.ts, createdAt),
    created_at: createdAt,
    createdAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
  };
}

function normalizeRoomMeta(roomId, patch, existing = null) {
  if (!roomId) return null;

  const patchTs = toNumber(patch?.lastMessageTs, 0);
  const existingTs = toNumber(existing?.lastMessageTs, 0);
  const lastMessageTs = Math.max(existingTs, patchTs);

  const shouldUpdateLastMessage = patchTs >= existingTs && patch?.lastMessageText !== undefined;
  const lastMessageText = shouldUpdateLastMessage
    ? String(patch.lastMessageText)
    : existing?.lastMessageText || "";
  const lastMessageMine = shouldUpdateLastMessage
    ? Boolean(patch.lastMessageMine)
    : (existing?.lastMessageMine ?? false);

  const updatedAt = Math.max(
    toNumber(existing?.updatedAt, 0),
    toNumber(patch?.updatedAt, now()),
    now(),
  );
  const expiry = createExpiry(lastMessageTs || updatedAt);
  if (expiry.expiresAt <= now()) return null;

  const unreadCount = patch?.resetUnread
    ? 0
    : Math.max(0, toNumber(existing?.unreadCount, 0) + toNumber(patch?.unreadDelta, 0));
  const lastSeenTs =
    patch?.lastSeenTs !== undefined
      ? toNumber(patch.lastSeenTs, now())
      : toNumber(existing?.lastSeenTs, 0);

  return {
    roomId: String(roomId),
    peerPubkey:
      typeof patch?.peerPubkey === "string" && patch.peerPubkey
        ? patch.peerPubkey
        : existing?.peerPubkey || "",
    name: typeof patch?.name === "string" && patch.name ? patch.name : existing?.name || "",
    type: typeof patch?.type === "string" && patch.type ? patch.type : existing?.type || "dm",
    lastMessageTs,
    lastMessageText,
    lastMessageMine,
    unreadCount,
    lastSeenTs,
    updatedAt,
    createdAt: toNumber(existing?.createdAt, updatedAt),
    expiresAt: expiry.expiresAt,
  };
}

function normalizeStoredGroup(group, existing = null) {
  const groupId = String(group?.groupId || existing?.groupId || "").trim();
  if (!groupId) return null;

  const createdAt = Math.max(0, toNumber(group?.createdAt, existing?.createdAt || now()));
  const lastMessageTs = Math.max(
    toNumber(existing?.lastMessageTs, 0),
    toNumber(group?.lastMessageTs, 0),
  );
  const updatedAt = Math.max(
    toNumber(existing?.updatedAt, 0),
    toNumber(group?.updatedAt, now()),
    now(),
  );
  // Roll the TTL forward from the latest activity so active groups never stale-expire.
  const activityTs = lastMessageTs || updatedAt;
  const unreadCount = group?.resetUnread
    ? 0
    : Math.max(0, toNumber(existing?.unreadCount, 0) + toNumber(group?.unreadDelta, 0));
  const lastSeenTs =
    group?.lastSeenTs !== undefined
      ? toNumber(group.lastSeenTs, now())
      : toNumber(existing?.lastSeenTs, 0);

  const next = {
    ...existing,
    ...group,
    groupId,
    createdAt,
    updatedAt,
    lastMessageTs,
    unreadCount,
    lastSeenTs,
    expiresAt: activityTs + getMaxCacheAgeMs(),
  };
  delete next.admins;
  delete next.createdBy;
  delete next.description;
  delete next.version;
  if (!next.name && next.code) next.name = String(next.code);
  delete next.code;
  return next;
}

async function getFresh(table, key) {
  const entry = await db.table(table).get(key);
  if (!entry) return null;
  if (!isEntryExpired(table, entry)) return entry;
  await db.table(table).delete(key);
  return null;
}

function formatStoredProfile(entry) {
  if (!entry) return null;
  return {
    name: entry.name ?? "",
    about: entry.about ?? "",
    website: entry.website ?? "",
    status: entry.status ?? "",
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
  };
}

export async function getStoredProfile(pubkey) {
  const entry = await getFresh("profiles", String(pubkey || "").trim());
  return formatStoredProfile(entry);
}

/** Read a profile without deleting expired rows — used for stale-while-revalidate. */
export async function peekStoredProfile(pubkey) {
  const entry = await db.profiles.get(String(pubkey || "").trim());
  return formatStoredProfile(entry);
}

export async function putStoredProfile(pubkey, profile) {
  const key = String(pubkey || "").trim();
  if (!key) return;
  const expiry = createExpiry(now(), profileTtl());
  await db.profiles.put({
    pubkey: key,
    name: sanitizeProfileField(profile?.name, 100),
    about: sanitizeProfileField(profile?.about, 500),
    website: sanitizeProfileField(profile?.website, 500),
    status: sanitizeProfileField(profile?.status, 150),
    fetchedAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
  });
}

async function purgeOversizeCache() {
  const tables = ["mediaCache", "rawEvents"];
  const allRows = (
    await Promise.all(
      tables.map(async (t) => {
        let rows = await db.table(t).toArray();
        if (t === "mediaCache") {
          rows = rows.filter((row) => row.type !== "staged");
        }
        return rows.map((row) => ({
          table: t,
          key: getPrimaryKey(t, row),
          bytes: estimateValueBytes(row),
          ts: getEntryActivityTimestamp(t, row),
        }));
      }),
    )
  ).flat();

  let totalBytes = allRows.reduce((s, e) => s + e.bytes, 0);
  if (totalBytes <= RETENTION_MAX_BYTES) return;

  allRows.sort((a, b) => a.ts - b.ts);

  const toDelete = Object.fromEntries(tables.map((t) => [t, []]));
  for (const entry of allRows) {
    if (totalBytes <= RETENTION_MAX_BYTES) break;
    if (entry.key) {
      toDelete[entry.table].push(entry.key);
      totalBytes -= entry.bytes;
    }
  }

  await Promise.all(
    tables.filter((t) => toDelete[t].length > 0).map((t) => db.table(t).bulkDelete(toDelete[t])),
  );
}

export async function purgeExpiredCache() {
  await Promise.all([
    purgeExpiredEntriesForTable("mediaCache"),
    purgeExpiredEntriesForTable("roomMeta"),
    purgeExpiredEntriesForTable("groups"),
    purgeExpiredEntriesForTable("profiles"),
    purgeExpiredEntriesForTable("messageSearch"),
    purgeExpiredEntriesForTable("relayStats"),
    purgeExpiredEntriesForTable("rawEvents"),
  ]);
  await purgeOversizeCache();
  await purgeExpiredEntriesForTable("engineBlobs").catch(() => {});
  await evictEngineBlobs().catch(() => {});
}

// ─── Engine blob cache ───────────────────────────────────────────────────────

const ENGINE_BLOB_CACHE_BYTES = 200 * 1024 * 1024;

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

/** Bytes currently cached in the engine blob table. */
export async function engineBlobCacheBytes() {
  let total = 0;
  await db.engineBlobs.each((row) => {
    total += Number(row.size) || 0;
  });
  return total;
}

/** LRU eviction: drop oldest-accessed rows until total is under cap. */
export async function evictEngineBlobs() {
  let total = await engineBlobCacheBytes();
  if (total <= ENGINE_BLOB_CACHE_BYTES) return 0;
  let freed = 0;
  const lru = (await db.engineBlobs.toArray()).sort(
    (a, b) => Number(a.lastAccessedAt) - Number(b.lastAccessedAt),
  );
  for (const row of lru) {
    if (total <= ENGINE_BLOB_CACHE_BYTES) break;
    const size = Number(row.size) || 0;
    await db.engineBlobs.delete(row.hash);
    total -= size;
    freed += size;
  }
  return freed;
}

export async function getRawEventsByIds(ids) {
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!list.length) return [];
  const rows = await db.rawEvents.bulkGet(list);
  return rows.filter(Boolean);
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
    db.peerRelayHints.clear(),
    db.rawEvents.clear(),
    db.engineBlobs.clear(),
  ]);
}

export async function deleteCacheDatabase() {
  db.close();
  await Dexie.delete(APP_CACHE_DB_NAME);
}

const DB_OWNER_KEY = "db_owner";

/**
 * The local cache belongs to exactly one account. On boot the signed-in
 * pubkey must match the stamp inside the database: a mismatch — or a stamp
 * that is missing while data exists — means another identity's data is on
 * disk, so the whole database is deleted and rebuilt. Everything the account
 * needs re-pulls from the relays within their TTL.
 *
 * Call once per boot with the resolved pubkey, before any cache read.
 */
export async function ensureDbOwner(pubkeyHex) {
  const owner = String(pubkeyHex || "").toLowerCase();
  if (!owner) return false;
  const stamp = await db.meta.get(DB_OWNER_KEY).catch(() => null);
  const value = String(stamp?.value || "").toLowerCase();
  if (value === owner) return false;

  // Wipe: close and delete the whole database, then rebuild it with the
  // incoming identity stamped as owner.
  db.close();
  await Dexie.delete(APP_CACHE_DB_NAME);
  await db.open();
  await db.meta.put({ key: DB_OWNER_KEY, value: owner });
  return true;
}

export function startCacheMaintenance() {
  if (maintenanceStarted || typeof window === "undefined") return;
  maintenanceStarted = true;
  void purgeExpiredCache();
  window.setInterval(() => {
    void purgeExpiredCache();
  }, PURGE_INTERVAL_MS);
}

async function getFreshMedia(type, key) {
  const entry = await db.mediaCache.get(key);
  if (!entry) return null;
  if (entry.type !== type) return null;
  if (!isEntryExpired("mediaCache", entry)) return entry;
  await db.mediaCache.delete(key);
  return null;
}

export async function getEncCached(key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return null;
  return getFreshMedia("encrypted", normalizedKey);
}

export async function putEncCached(key, buf) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey || !buf) return;
  const touchedAt = now();
  const expiry = createExpiry(touchedAt);
  await db.mediaCache.put({
    key: normalizedKey,
    type: "encrypted",
    buf,
    createdAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
    lastAccessedAt: touchedAt,
  });
}

export async function touchEncCached(url) {
  const key = String(url || "").trim();
  if (!key) return;
  const entry = await db.mediaCache.get(key);
  if (!entry || entry.type !== "encrypted") return;
  await db.mediaCache.put({ ...entry, lastAccessedAt: now() });
}

export async function touchDecCached(msgId) {
  const key = `dec:${String(msgId || "").trim()}`;
  const entry = await db.mediaCache.get(key);
  if (!entry || entry.type !== "decrypted") return;
  await db.mediaCache.put({ ...entry, lastAccessedAt: now() });
}

export async function getDecCached(msgId) {
  const entry = await getFreshMedia("decrypted", `dec:${String(msgId)}`);
  if (!entry) return null;
  void touchDecCached(msgId);
  return { buf: entry.buf, mime: entry.mime };
}

export async function putDecCached(msgId, buf, mime) {
  const key = `dec:${String(msgId)}`;
  const touchedAt = now();
  const expiry = createExpiry(touchedAt);
  await db.mediaCache.put({
    key,
    type: "decrypted",
    buf,
    mime,
    createdAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
    lastAccessedAt: touchedAt,
  });
}

export async function clearEncCached(url) {
  await db.mediaCache.delete(String(url));
}

export async function stageUpload(tempKey, buf) {
  const key = `upload:${tempKey}`;
  const expiry = createExpiry(now(), STAGED_UPLOAD_MAX_AGE_MS);
  await db.mediaCache.put({
    key,
    type: "staged",
    buf,
    createdAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
  });
}

export async function getStagedUpload(tempKey) {
  const entry = await getFreshMedia("staged", `upload:${tempKey}`);
  return entry?.buf || null;
}

export async function clearStagedUpload(tempKey) {
  await db.mediaCache.delete(`upload:${tempKey}`);
}

export async function indexRoomMessage(roomId, row) {
  const record = await normalizeCacheMessage(roomId, row);
  if (!record) return null;
  const searchRow = await buildMessageSearchRecord(record);
  if (searchRow) await db.messageSearch.put(searchRow);
  return record;
}

export async function deleteRoomMessage(messageId) {
  const key = String(messageId || "").trim();
  if (!key) return;
  await db.transaction("rw", db.rawEvents, db.messageSearch, async () => {
    await db.rawEvents.delete(key);
    await db.messageSearch.delete(key);
  });
}

export async function deleteRawEvent(id) {
  const key = String(id || "").trim();
  if (!key) return;
  await db.rawEvents.delete(key);
}

export async function putRoomMeta(roomId, patch) {
  const key = String(roomId || "");
  if (!key) return null;

  return db.transaction("rw", db.roomMeta, async () => {
    const existing = await getFresh("roomMeta", key);
    if (!existing && !patch?.peerPubkey) return null;
    const next = normalizeRoomMeta(key, patch, existing);
    if (!next) {
      await db.roomMeta.delete(key);
      return null;
    }
    await db.roomMeta.put(next);
    return next;
  });
}

export async function getRoomMeta(roomId) {
  const key = String(roomId || "").trim();
  if (!key) return null;
  return await getFresh("roomMeta", key);
}

export async function listRoomMeta() {
  const rows = await db.roomMeta.where("expiresAt").above(now()).sortBy("lastMessageTs");
  return rows.reverse();
}

export async function getStoredGroup(groupId) {
  const key = String(groupId).trim();
  if (!key) return null;
  return await getFresh("groups", key);
}

export async function putStoredGroup(group) {
  const groupId = String(group?.groupId || "").trim();
  if (!groupId) return null;

  return db.transaction("rw", db.groups, async () => {
    const existing = await getStoredGroup(groupId);
    const next = normalizeStoredGroup(group, existing);
    if (!next) return null;
    await db.groups.put(next);
    return next;
  });
}

export async function listStoredGroups() {
  const rows = await db.groups.where("expiresAt").above(now()).sortBy("lastMessageTs");
  return rows.reverse();
}

export async function indexGroupMessage(message) {
  const searchRow = await buildMessageSearchRecord(message);
  if (searchRow) await db.messageSearch.put(searchRow);
}

export async function searchMessages(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return { dm: [], group: [] };

  const tokens = tokenizeSearchText(q);
  if (!tokens.length) return { dm: [], group: [] };

  const cutoff = now();
  let hits = await db.messageSearch.where("tokens").equals(tokens[0]).toArray();
  hits = hits.filter(
    (row) =>
      toNumber(row.expiresAt, 0) > cutoff && tokens.every((token) => row.tokens?.includes(token)),
  );
  hits.sort((a, b) => toNumber(b.ts, 0) - toNumber(a.ts, 0));
  hits = hits.slice(0, 100);

  const dm = hits.filter((row) => row.roomId && row.text !== undefined);
  const group = hits.filter((row) => row.groupId && row.text !== undefined);

  return { dm, group };
}

function emptyRelayStatsRow(relay) {
  return {
    relay,
    publishOk: 0,
    publishFail: 0,
    connectOk: 0,
    connectFail: 0,
    queryOk: 0,
    queryFail: 0,
    publishLatencyTotalMs: 0,
    publishLatencySamples: 0,
    connectLatencyTotalMs: 0,
    connectLatencySamples: 0,
    queryLatencyTotalMs: 0,
    queryLatencySamples: 0,
    publishLatencyEwmaMs: 0,
    connectLatencyEwmaMs: 0,
    queryLatencyEwmaMs: 0,
    publishOkEwma: 0,
    connectOkEwma: 0,
    queryOkEwma: 0,
    lastPublishOkAt: 0,
    lastPublishFailAt: 0,
    lastConnectOkAt: 0,
    lastConnectFailAt: 0,
    lastQueryOkAt: 0,
    lastQueryFailAt: 0,
    lastError: "",
    updatedAt: 0,
    expiresAt: 0,
  };
}

function successRate(ok, fail) {
  const total = Math.max(0, toNumber(ok, 0)) + Math.max(0, toNumber(fail, 0));
  if (!total) return null;
  return Math.round((Math.max(0, toNumber(ok, 0)) / total) * 100);
}

function avgLatency(totalMs, samples) {
  const count = Math.max(0, toNumber(samples, 0));
  if (!count) return 0;
  return Math.round(Math.max(0, toNumber(totalMs, 0)) / count);
}

function classifyRelayHealth(row) {
  return classifyTraffic(
    successRate(row.publishOk, row.publishFail),
    toNumber(row.publishOk, 0) + toNumber(row.publishFail, 0),
    successRate(row.queryOk, row.queryFail),
    toNumber(row.queryOk, 0) + toNumber(row.queryFail, 0),
  );
}

export async function recordRelayOutcomes(operation, outcomes) {
  const op =
    operation === "connect" || operation === "query" || operation === "publish"
      ? operation
      : "publish";
  if (!Array.isArray(outcomes) || !outcomes.length) return;

  const touchedAt = now();
  await db.transaction("rw", db.relayStats, async () => {
    for (const entry of outcomes) {
      const relay = String(entry?.relay || "").trim();
      if (!relay) continue;

      const existing = (await db.relayStats.get(relay)) || emptyRelayStatsRow(relay);
      const ok = Boolean(entry.ok);
      const latencyMs = Math.max(0, toNumber(entry.latencyMs, 0));
      const error = String(entry.error || "").slice(0, 500);

      if (op === "publish") {
        if (ok) {
          existing.publishOk += 1;
          existing.publishLatencyTotalMs += latencyMs;
          existing.publishLatencyEwmaMs = updateLatencyEwma(
            existing.publishLatencyEwmaMs,
            existing.publishLatencySamples,
            latencyMs,
          );
          existing.publishLatencySamples += 1;
          existing.lastPublishOkAt = touchedAt;
        } else {
          existing.publishFail += 1;
          existing.lastPublishFailAt = touchedAt;
          if (error) existing.lastError = error;
        }
        existing.publishOkEwma = updateOkEwma(
          existing.publishOkEwma,
          existing.publishOk + existing.publishFail - 1,
          ok,
        );
      } else if (op === "connect") {
        if (ok) {
          existing.connectOk += 1;
          existing.connectLatencyTotalMs += latencyMs;
          existing.connectLatencyEwmaMs = updateLatencyEwma(
            existing.connectLatencyEwmaMs,
            existing.connectLatencySamples,
            latencyMs,
          );
          existing.connectLatencySamples += 1;
          existing.lastConnectOkAt = touchedAt;
        } else {
          existing.connectFail += 1;
          existing.lastConnectFailAt = touchedAt;
          if (error) existing.lastError = error;
        }
        existing.connectOkEwma = updateOkEwma(
          existing.connectOkEwma,
          existing.connectOk + existing.connectFail - 1,
          ok,
        );
      } else {
        if (ok) {
          existing.queryOk += 1;
          existing.queryLatencyTotalMs += latencyMs;
          existing.queryLatencyEwmaMs = updateLatencyEwma(
            existing.queryLatencyEwmaMs,
            existing.queryLatencySamples,
            latencyMs,
          );
          existing.queryLatencySamples += 1;
          existing.lastQueryOkAt = touchedAt;
        } else {
          existing.queryFail += 1;
          existing.lastQueryFailAt = touchedAt;
          if (error) existing.lastError = error;
        }
        existing.queryOkEwma = updateOkEwma(
          existing.queryOkEwma,
          existing.queryOk + existing.queryFail - 1,
          ok,
        );
      }

      existing.updatedAt = touchedAt;
      existing.expiresAt = touchedAt + RELAY_STATS_RETENTION_MS;
      await db.relayStats.put(existing);
    }
  });
}

export async function getRelayHealthSummary() {
  const currentTime = now();
  const rows = await db.relayStats.where("expiresAt").above(currentTime).toArray();

  return rows
    .map((row) => {
      const publishTotal = toNumber(row.publishOk, 0) + toNumber(row.publishFail, 0);
      const connectTotal = toNumber(row.connectOk, 0) + toNumber(row.connectFail, 0);
      const queryTotal = toNumber(row.queryOk, 0) + toNumber(row.queryFail, 0);
      if (!publishTotal && !queryTotal && !connectTotal) return null;
      const tier = classifyRelayHealth(row);

      return {
        relay: row.relay,
        tier,
        publishOk: toNumber(row.publishOk, 0),
        publishFail: toNumber(row.publishFail, 0),
        publishTotal,
        publishSuccessRate: successRate(row.publishOk, row.publishFail),
        avgPublishMs: toNumber(row.publishLatencyEwmaMs, 0),
        connectOk: toNumber(row.connectOk, 0),
        connectFail: toNumber(row.connectFail, 0),
        connectTotal,
        connectSuccessRate: successRate(row.connectOk, row.connectFail),
        avgConnectMs: toNumber(row.connectLatencyEwmaMs, 0),
        queryOk: toNumber(row.queryOk, 0),
        queryFail: toNumber(row.queryFail, 0),
        queryTotal,
        querySuccessRate: successRate(row.queryOk, row.queryFail),
        avgQueryMs: toNumber(row.queryLatencyEwmaMs, 0),
        lastPublishOkAt: toNumber(row.lastPublishOkAt, 0),
        lastPublishFailAt: toNumber(row.lastPublishFailAt, 0),
        lastConnectOkAt: toNumber(row.lastConnectOkAt, 0),
        lastConnectFailAt: toNumber(row.lastConnectFailAt, 0),
        lastError: row.lastError || "",
        updatedAt: toNumber(row.updatedAt, 0),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const tierRank = { poor: 0, degraded: 1, unknown: 2, good: 3 };
      const leftRank = tierRank[left.tier] ?? 2;
      const rightRank = tierRank[right.tier] ?? 2;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (left.publishSuccessRate ?? 101) - (right.publishSuccessRate ?? 101);
    });
}

/**
 * Returns relays sorted by EWMA score desc (best first).
 * score = okRate (0..1). Untested relays default to NEUTRAL_SCORE.
 *
 * Used by readRelays() for both read and write relay selection — top-N
 * exploit slots + tournament explore slots for untested relays.
 */
export async function getRelayRanking() {
  const currentTime = now();
  const rows = await db.relayStats.where("expiresAt").above(currentTime).toArray();

  return rows
    .map((row) => ({
      relay: row.relay,
      score: relayScore(row),
      okRate: relayScore(row),
      latencyMs: rankingLatencyMs(row),
      samples: trafficSamples(row),
    }))
    .filter((row) => row.samples > 0)
    .sort((a, b) => b.score - a.score || a.relay.localeCompare(b.relay));
}

export async function deleteRelayStats(relays) {
  if (!Array.isArray(relays) || !relays.length) return;
  const keys = relays.map((r) => String(r || "").trim()).filter(Boolean);
  if (keys.length) await db.relayStats.bulkDelete(keys);
}

async function summarizeMediaSubtype(type, tableName) {
  const rows = await db.mediaCache.where("type").equals(type).toArray();
  const currentTime = now();
  const freshRows = rows.filter((entry) => !isEntryExpired("mediaCache", entry, currentTime));
  const staleKeys = rows
    .filter((entry) => isEntryExpired("mediaCache", entry, currentTime))
    .map((entry) => entry.key)
    .filter(Boolean);
  if (staleKeys.length) {
    await db.mediaCache.bulkDelete(staleKeys);
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

export async function getCacheSummary() {
  const stores = await Promise.all([
    summarizeMediaSubtype("encrypted", "encMedia"),
    summarizeMediaSubtype("decrypted", "decMedia"),
    summarizeMediaSubtype("staged", "stagedUploads"),
    summarizeTable("roomMeta"),
    summarizeTable("groups"),
    summarizeTable("rawEvents"),
  ]);
  const totalEntries = stores.reduce((total, store) => total + store.entries, 0);
  const totalEstimatedBytes = stores.reduce((total, store) => total + store.estimatedBytes, 0);
  const newestCreatedAt = stores.reduce(
    (latest, store) => Math.max(latest, store.newestCreatedAt),
    0,
  );
  const newestExpiresAt = stores.reduce(
    (latest, store) => Math.max(latest, store.newestExpiresAt),
    0,
  );

  return {
    dbName: APP_CACHE_DB_NAME,
    maxAgeDays: readConfiguredRetentionDays(),
    stagedUploadMaxAgeHours: Math.round(STAGED_UPLOAD_MAX_AGE_MS / (60 * 60 * 1000)),
    totalEntries,
    totalEstimatedBytes,
    newestCreatedAt,
    newestExpiresAt,
    stores,
  };
}

const KNOWN_GUPT_TAGS = new Set(["gupt_bookmark", "gupt_password", "gupt_note", "gupt_vault"]);

function extractGuptTags(event) {
  const tags = event?.tags;
  if (!Array.isArray(tags)) return [];
  const found = new Set();
  for (const tag of tags) {
    if (!Array.isArray(tag) || !tag[0]) continue;
    const key = String(tag[0]);
    if (KNOWN_GUPT_TAGS.has(key)) found.add(key);
    if (key === "t" && tag[1] && KNOWN_GUPT_TAGS.has(String(tag[1]))) {
      found.add(String(tag[1]));
    }
  }
  return [...found];
}

/**
 * Break down cached rawEvents by origin, kind, and gupt_* stream tags.
 */
export async function getRawEventsBreakdown() {
  const rows = await db.rawEvents.toArray();
  const currentTime = now();

  const byOrigin = new Map();
  const byKind = new Map();
  const byGuptTag = new Map();

  let total = 0;
  let live = 0;
  let expired = 0;
  let unreplicated = 0;
  let estimatedBytes = 0;

  for (const row of rows) {
    total += 1;
    const bytes = estimateValueBytes(row);
    estimatedBytes += bytes;
    const isExpired = toNumber(row.expiresAt, 0) > 0 && toNumber(row.expiresAt, 0) <= currentTime;
    if (isExpired) expired += 1;
    else live += 1;
    if (!toNumber(row.lastReplicatedAt, 0)) unreplicated += 1;

    const origin = row.origin || "unknown";
    const originBucket = byOrigin.get(origin) || {
      origin,
      count: 0,
      live: 0,
      expired: 0,
      unreplicated: 0,
      estimatedBytes: 0,
      kinds: {},
    };
    originBucket.count += 1;
    originBucket.estimatedBytes += bytes;
    if (isExpired) originBucket.expired += 1;
    else originBucket.live += 1;
    if (!toNumber(row.lastReplicatedAt, 0)) originBucket.unreplicated += 1;
    const kindKey = String(row.kind ?? "?");
    originBucket.kinds[kindKey] = (originBucket.kinds[kindKey] || 0) + 1;
    byOrigin.set(origin, originBucket);

    const kindBucket = byKind.get(kindKey) || { kind: kindKey, count: 0, estimatedBytes: 0 };
    kindBucket.count += 1;
    kindBucket.estimatedBytes += bytes;
    byKind.set(kindKey, kindBucket);

    for (const guptTag of extractGuptTags(row.event)) {
      let tagBucket = byGuptTag.get(guptTag);
      if (!tagBucket) {
        tagBucket = {
          tag: guptTag,
          count: 0,
          live: 0,
          expired: 0,
          unreplicated: 0,
          estimatedBytes: 0,
          origin,
        };
        byGuptTag.set(guptTag, tagBucket);
      }
      tagBucket.count += 1;
      tagBucket.estimatedBytes += bytes;
      if (isExpired) tagBucket.expired += 1;
      else tagBucket.live += 1;
      if (!toNumber(row.lastReplicatedAt, 0)) tagBucket.unreplicated += 1;
    }
  }

  const sortByCount = (a, b) =>
    b.count - a.count ||
    String(a.origin || a.tag || a.kind).localeCompare(String(b.origin || b.tag || b.kind));

  return {
    total,
    live,
    expired,
    unreplicated,
    estimatedBytes,
    byOrigin: [...byOrigin.values()].sort(sortByCount),
    byKind: [...byKind.values()].sort(sortByCount),
    byGuptTag: [...byGuptTag.values()].sort(sortByCount),
  };
}

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

  await db.rawEvents.put({
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
    event,
  });
}

export async function getRawEventsByOrigin(origin, { minCreatedAt = 0 } = {}) {
  const rows = await db.rawEvents.where("origin").equals(String(origin)).toArray();
  if (!minCreatedAt) return rows;
  return rows.filter((row) => toNumber(row.createdAt, 0) >= minCreatedAt);
}

/**
 * Returns raw events that are candidates for replication across Rabta relays.
 * Picks live (non-expired) events ordered by lastReplicatedAt ascending.
 */
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
  // Only never-synced rows (0) and due retries (<= now) are eligible; fully
  // synced rows sit at ENGINE_DONE_AT and are never scanned.
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

/**
 * Update lastReplicatedAt for replicated event IDs. A future `ts` schedules a
 * retry (partial replication) without blocking the rest of the outbox.
 */
export async function markEventsReplicated(ids, ts = now()) {
  if (!ids?.length) return;
  await db.rawEvents.bulkUpdate(ids.map((id) => ({ key: id, changes: { lastReplicatedAt: ts } })));
}

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
}

/**
 * Record the outcome of one outbox attempt per event. An ack clears the retry
 * counter immediately, so a late relay acknowledgement always clears a failed
 * state. Unacked events accumulate attempts and become failed at the threshold.
 */
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
  }

  if (unacked.length) {
    const rows = await db.rawEvents.bulkGet(unacked);
    const updates = [];
    for (const row of rows) {
      if (!row) continue;
      const attempts = Math.max(0, toNumber(row.syncAttempts, 0)) + 1;
      updates.push({
        key: row.id,
        changes: { syncAttempts: attempts, lastAttemptAt: ts, lastSyncError: error },
      });
      if (attempts >= failedAfter) failedIds.push(row.id);
    }
    if (updates.length) await db.rawEvents.bulkUpdate(updates);
  }

  return { failedIds };
}

/**
 * Count every unsynced locally-authored event, including ones whose next retry
 * sits in the future. This is the UI's view of the engine outbox.
 */
export async function getOutboxSnapshot({ origins = null, filter = null, failedAfter = 5 } = {}) {
  const nowMs = now();
  const include = Array.isArray(origins) ? new Set(origins) : null;
  const snapshot = {
    pending: 0,
    stuck: 0,
    failed: 0,
    total: 0,
    failedIds: [],
    oldestCreatedAt: 0,
    failedAfter,
    updatedAt: nowMs,
  };

  await db.rawEvents
    .where("lastReplicatedAt")
    .below(OUTBOX_DONE_AT)
    .filter((row) => {
      if (toNumber(row.expiresAt, 0) <= nowMs) return false;
      if (include && !include.has(row.origin)) return false;
      if (typeof filter === "function" && !filter(row)) return false;
      return true;
    })
    .each((row) => {
      const attempts = Math.max(0, toNumber(row.syncAttempts, 0));
      if (attempts >= failedAfter) {
        snapshot.failed += 1;
        if (snapshot.failedIds.length < OUTBOX_FAILED_IDS_MAX) snapshot.failedIds.push(row.id);
      } else if (attempts > 0 || row.lastAckedAt) {
        snapshot.stuck += 1;
      } else {
        snapshot.pending += 1;
      }
      snapshot.total += 1;
      const createdAt = toNumber(row.createdAt, 0);
      if (createdAt && (!snapshot.oldestCreatedAt || createdAt < snapshot.oldestCreatedAt)) {
        snapshot.oldestCreatedAt = createdAt;
      }
    });

  return snapshot;
}

/** Mark raw events the app has already parsed into rooms/groups. */
export async function markRawEventsApplied(ids) {
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!list.length) return;
  const ts = now();
  await db.rawEvents
    .bulkUpdate(list.map((id) => ({ key: id, changes: { appliedAt: ts } })))
    .catch(() => {});
}

/** Raw events stored by the engine but not yet routed into reactive state. */
export async function listUnappliedRawEvents({ origin = "dm", limit = 300 } = {}) {
  const rows = [];
  await db.rawEvents
    .orderBy("createdAt")
    .reverse()
    .filter((row) => row.origin === origin && !row.appliedAt)
    .until(() => rows.length >= limit)
    .each((row) => rows.push(row));
  return rows;
}

/** Engine pull cursors live in syncCursors under engine-prefixed keys. */
export async function getEngineCursor(key) {
  const row = await db.syncCursors.get(String(key || "")).catch(() => null);
  return row?.cursor || null;
}

export async function putEngineCursor(key, cursor) {
  const id = String(key || "");
  if (!id) return null;
  if (!cursor) {
    await db.syncCursors.delete(id).catch(() => {});
    return null;
  }
  const row = { peerPubkey: id, cursor: String(cursor), lastSyncMs: 0, updatedAt: now() };
  await db.syncCursors.put(row);
  return row;
}

export async function getEngineWatermark(key) {
  const id = String(key || "");
  if (!id) return 0;
  const row = await db.syncCursors.get(id).catch(() => null);
  return toNumber(row?.cursor, 0);
}

export async function setEngineWatermark(key, watermarkSec) {
  const id = String(key || "");
  if (!id) return;
  const val = Math.max(0, Math.floor(toNumber(watermarkSec, 0)));
  await db.syncCursors.put({
    peerPubkey: id,
    cursor: String(val),
    lastSyncMs: now(),
    updatedAt: now(),
  });
}

export async function countLocalRawEvents({
  startSec = 0,
  endSec = Number.MAX_SAFE_INTEGER,
  owner = null,
  label = null,
} = {}) {
  const startMs = Math.max(0, toNumber(startSec, 0) * 1000);
  const endMs = Math.min(Number.MAX_SAFE_INTEGER, toNumber(endSec, Number.MAX_SAFE_INTEGER) * 1000);
  const nowMs = now();
  const normOwner = owner
    ? String(owner)
        .toLowerCase()
        .replace(/^ed25519:/, "")
    : null;
  const normLabel = label ? String(label).toLowerCase() : null;

  return db.rawEvents
    .where("createdAt")
    .between(startMs, endMs, true, false)
    .filter((row) => {
      if (toNumber(row.expiresAt, 0) <= nowMs) return false;
      const ev = row.event;
      if (!ev) return false;
      if (normOwner) {
        const evOwner = String(ev.owner || ev.pubkey || "")
          .toLowerCase()
          .replace(/^ed25519:/, "");
        if (evOwner !== normOwner) return false;
      }
      if (normLabel) {
        const labels = Array.isArray(ev.labels) ? ev.labels : [];
        if (!labels.some((l) => String(l).toLowerCase() === normLabel)) return false;
      }
      return true;
    })
    .count();
}

/** Get the latest createdAt (in seconds) for raw events matching an origin or overall. */
export async function getLatestRawEventCreatedAt({ origin = null } = {}) {
  try {
    if (origin === "vault") {
      const origins = ["notes", "bookmarks", "passwords"];
      let max = 0;
      for (const o of origins) {
        const rows = await db.rawEvents.where("origin").equals(o).toArray();
        for (const r of rows) {
          const val = toNumber(r.createdAt, 0);
          if (val > max) max = val;
        }
      }
      return Math.floor(max / 1000);
    }
    if (origin) {
      const rows = await db.rawEvents.where("origin").equals(origin).toArray();
      if (!rows.length) return 0;
      let max = 0;
      for (const r of rows) {
        const val = toNumber(r.createdAt, 0);
        if (val > max) max = val;
      }
      return Math.floor(max / 1000);
    }
    const last = await db.rawEvents.orderBy("createdAt").last();
    return last?.createdAt ? Math.floor(toNumber(last.createdAt, 0) / 1000) : 0;
  } catch {
    return 0;
  }
}

/** Upsert incoming events, then return every cached event for this origin. */
export async function mergeRawEventsByOrigin(origin, events) {
  const list = Array.isArray(events) ? events : [];
  if (list.length) {
    await Promise.all(list.map((event) => putRawEvent(event, origin).catch(() => {})));
  }
  return getRawEventsByOrigin(origin).catch(() => []);
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
  const filtered = allForRoom.filter(
    (row) => row.origin === "dm" && toNumber(row.expiresAt, 0) > currentTime,
  );
  const expiredCount = allForRoom.filter(
    (row) => row.origin === "dm" && toNumber(row.expiresAt, 0) <= currentTime,
  ).length;
  const wrongOrigin = allForRoom.filter((row) => row.origin !== "dm").length;

  return filtered;
}

export async function listGroupEvents(groupId) {
  const currentTime = now();
  const allForGroup = await db.rawEvents.where("groupId").equals(String(groupId)).toArray();
  const filtered = allForGroup.filter(
    (row) => row.origin === "group" && toNumber(row.expiresAt, 0) > currentTime,
  );
  const expiredCount = allForGroup.filter(
    (row) => row.origin === "group" && toNumber(row.expiresAt, 0) <= currentTime,
  ).length;

  return filtered;
}
