import Dexie from "dexie";
import {
  readConfiguredRetentionDays,
  readConfiguredRetentionMs,
  RETENTION_MAX_BYTES,
} from "@/config/retention";

const APP_CACHE_DB_NAME = "gupt_app_cache_v2";
const STAGED_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

function getMaxCacheAgeMs() {
  return readConfiguredRetentionMs();
}

// Jitter ±4 h so all profiles don't expire at the same wall-clock time.
function profileTtl() {
  return PROFILE_TTL_MS + (Math.random() - 0.5) * 8 * 60 * 60 * 1000;
}

// Strip HTML tags and control characters before persisting untrusted relay data.
function sanitizeProfileField(value, maxLen) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

class GuptCacheDb extends Dexie {
  constructor() {
    super(APP_CACHE_DB_NAME);

    this.version(1).stores({
      encMedia: "&key, createdAt, expiresAt",
      decMedia: "&key, createdAt, expiresAt",
      stagedUploads: "&key, createdAt, expiresAt",
      dmMessages: "&id, roomId, ts, createdAt, expiresAt, type, [roomId+ts]",
      roomMeta: "&roomId, peerPubkey, updatedAt, lastMessageTs, expiresAt",
      groups: "&groupId, updatedAt, lastMessageTs, createdAt, expiresAt",
      groupMessages: "&key, groupId, ts, sender, expiresAt, type, [groupId+ts]",
      profiles: "&pubkey, fetchedAt, expiresAt",
    });
  }
}

const db = new GuptCacheDb();
let maintenanceStarted = false;

const CACHE_TABLE_LABELS = {
  encMedia: "Encrypted media",
  decMedia: "Decrypted media",
  stagedUploads: "Staged uploads",
  dmMessages: "DM messages",
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
    case "groupMessages":
      return entry.key;
    case "roomMeta":
      return entry.roomId;
    default:
      return entry.key || entry.id;
  }
}

function getEntryActivityTimestamp(tableName, entry) {
  switch (tableName) {
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
    case "groupMessages":
      return Math.max(
        toNumber(entry?.ts, 0),
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

  switch (tableName) {
    case "stagedUploads":
      return activityTimestamp + STAGED_UPLOAD_MAX_AGE_MS;
    case "profiles":
      return storedExpiry || activityTimestamp + PROFILE_TTL_MS;
    default:
      return activityTimestamp + getMaxCacheAgeMs();
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

function normalizeCacheMessage(roomId, row) {
  if (!row?.id || !roomId) return null;

  const createdAt = toNumber(row.created_at || row.ts, now());
  const expiry = createExpiry(createdAt);
  if (expiry.expiresAt <= now()) return null;

  return {
    ...row,
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

  // Only overwrite the last-message preview when the patch has a newer timestamp
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
  return {
    ...existing,
    ...group,
    groupId,
    createdAt,
    updatedAt,
    lastMessageTs,
    expiresAt: activityTs + getMaxCacheAgeMs(),
  };
}

function normalizeStoredGroupMessage(message, existing = null) {
  const groupId = String(message?.groupId || existing?.groupId || "").trim();
  const id = String(message?.id || existing?.id || "").trim();
  if (!groupId || !id) return null;

  const ts = Math.max(0, toNumber(message?.ts, existing?.ts || now()));
  return {
    ...existing,
    ...message,
    key: `${groupId}:${id}`,
    groupId,
    id,
    ts,
    updatedAt: Math.max(
      toNumber(existing?.updatedAt, 0),
      toNumber(message?.updatedAt, now()),
      now(),
    ),
    expiresAt: ts + getMaxCacheAgeMs(),
  };
}

async function getFresh(table, key) {
  const entry = await db.table(table).get(key);
  if (!entry) return null;
  if (!isEntryExpired(table, entry)) return entry;
  await db.table(table).delete(key);
  return null;
}

export async function getStoredProfile(pubkey) {
  const entry = await getFresh("profiles", String(pubkey || "").trim());
  if (!entry) return null;
  return {
    name: entry.name ?? "",
    about: entry.about ?? "",
    picture: entry.picture ?? "",
    website: entry.website ?? "",
    status: entry.status ?? "",
    fetchedAt: entry.fetchedAt,
  };
}

export async function putStoredProfile(pubkey, profile) {
  const key = String(pubkey || "").trim();
  if (!key) return;
  const expiry = createExpiry(now(), profileTtl());
  await db.profiles.put({
    pubkey: key,
    name: sanitizeProfileField(profile?.name, 100),
    about: sanitizeProfileField(profile?.about, 500),
    picture: sanitizeProfileField(profile?.picture, 2000),
    website: sanitizeProfileField(profile?.website, 500),
    status: sanitizeProfileField(profile?.status, 150),
    fetchedAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
  });
}

/** @deprecated Use getStoredProfile instead */
export async function getProfileName(pubkey) {
  return (await getStoredProfile(pubkey))?.name ?? null;
}

/** @deprecated Use putStoredProfile instead */
export async function putProfileName(pubkey, name) {
  return putStoredProfile(pubkey, { name });
}

async function purgeOversizeCache() {
  const tables = ["encMedia", "decMedia", "dmMessages", "groupMessages"];
  const allRows = (
    await Promise.all(
      tables.map(async (t) => {
        const rows = await db.table(t).toArray();
        return rows.map((row) => ({
          table: t,
          key: getPrimaryKey(t, row),
          bytes: estimateValueBytes(row),
          ts: toNumber(row.createdAt || row.ts, 0),
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
    purgeExpiredEntriesForTable("encMedia"),
    purgeExpiredEntriesForTable("decMedia"),
    purgeExpiredEntriesForTable("stagedUploads"),
    purgeExpiredEntriesForTable("dmMessages"),
    purgeExpiredEntriesForTable("roomMeta"),
    purgeExpiredEntriesForTable("groups"),
    purgeExpiredEntriesForTable("groupMessages"),
    purgeExpiredEntriesForTable("profiles"),
  ]);
  await purgeOversizeCache();
}

/**
 * Wipe all tables — call this when the user switches to a different identity
 * so no previous account's data leaks into the new session.
 */
export async function clearAllCaches() {
  await Promise.all([
    db.encMedia.clear(),
    db.decMedia.clear(),
    db.stagedUploads.clear(),
    db.dmMessages.clear(),
    db.roomMeta.clear(),
    db.groups.clear(),
    db.groupMessages.clear(),
    db.profiles.clear(),
  ]);
}

export async function deleteCacheDatabase() {
  db.close();
  await Dexie.delete(APP_CACHE_DB_NAME);
}

export function startCacheMaintenance() {
  if (maintenanceStarted || typeof window === "undefined") return;
  maintenanceStarted = true;
  void purgeExpiredCache();
  window.setInterval(() => {
    void purgeExpiredCache();
  }, PURGE_INTERVAL_MS);
}

export async function fetchEncCached(url) {
  const key = String(url || "").trim();
  if (!key) throw new Error("Missing media URL");

  const cached = await getFresh("encMedia", key);
  if (cached?.buf) return cached.buf;

  const res = await fetch(key);
  if (!res.ok) throw new Error(`Media fetch failed (${res.status}): ${key}`);

  const buf = await res.arrayBuffer();
  const expiry = createExpiry(now());
  await db.encMedia.put({ key, buf, createdAt: expiry.createdAt, expiresAt: expiry.expiresAt });
  return buf;
}

export async function getDecCached(msgId) {
  const entry = await getFresh("decMedia", String(msgId));
  return entry ? { buf: entry.buf, mime: entry.mime } : null;
}

export async function putDecCached(msgId, buf, mime) {
  const key = String(msgId);
  const expiry = createExpiry(now());
  await db.decMedia.put({
    key,
    buf,
    mime,
    createdAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
  });
}

export async function clearEncCached(url) {
  await db.encMedia.delete(String(url));
}

export async function stageUpload(tempKey, buf) {
  const key = `upload:${tempKey}`;
  const expiry = createExpiry(now(), STAGED_UPLOAD_MAX_AGE_MS);
  await db.stagedUploads.put({
    key,
    buf,
    createdAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
  });
}

export async function getStagedUpload(tempKey) {
  const entry = await getFresh("stagedUploads", `upload:${tempKey}`);
  return entry?.buf || null;
}

export async function clearStagedUpload(tempKey) {
  await db.stagedUploads.delete(`upload:${tempKey}`);
}

export async function cacheRoomMessages(roomId, rows) {
  const records = rows.map((row) => normalizeCacheMessage(roomId, row)).filter(Boolean);
  if (!records.length) return;
  await db.dmMessages.bulkPut(records);
}

export async function putCachedRoomMessage(roomId, row) {
  const record = normalizeCacheMessage(roomId, row);
  if (!record) return null;
  await db.dmMessages.put(record);
  return record;
}

export async function deleteCachedRoomMessage(messageId) {
  const key = String(messageId || "").trim();
  if (!key) return;
  await db.dmMessages.delete(key);
}

export async function listCachedRoomMessages(roomId) {
  const currentTime = now();
  const rows = await db.dmMessages
    .where("[roomId+ts]")
    .between([String(roomId), Dexie.minKey], [String(roomId), Dexie.maxKey])
    .filter((row) => toNumber(row.expiresAt, 0) > currentTime)
    .toArray();

  return rows.map(
    ({ roomId: _roomId, createdAt: _createdAt, expiresAt: _expiresAt, ...row }) => row,
  );
}

export async function putRoomMeta(roomId, patch) {
  const key = String(roomId || "");
  if (!key) return null;

  return db.transaction("rw", db.roomMeta, async () => {
    const existing = await getFresh("roomMeta", key);
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
  const rows = await db.roomMeta.where("expiresAt").above(now()).toArray();
  rows.sort((a, b) => toNumber(b.lastMessageTs, 0) - toNumber(a.lastMessageTs, 0));
  return rows;
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
  const rows = await db.groups.where("expiresAt").above(now()).toArray();
  rows.sort((a, b) => toNumber(b.lastMessageTs, 0) - toNumber(a.lastMessageTs, 0));
  return rows;
}

export async function getStoredGroupMessage(groupId, messageId) {
  const groupKey = String(groupId).trim();
  const messageKey = String(messageId).trim();
  if (!groupKey || !messageKey) return null;
  return await getFresh("groupMessages", `${groupKey}:${messageKey}`);
}

export async function putStoredGroupMessage(message) {
  return db.transaction("rw", db.groupMessages, async () => {
    const existing = await getStoredGroupMessage(message?.groupId, message?.id);
    const next = normalizeStoredGroupMessage(message, existing);
    if (!next) return null;
    await db.groupMessages.put(next);
    return next;
  });
}

export async function listStoredGroupMessages(groupId) {
  const currentTime = now();
  const key = String(groupId).trim();
  return db.groupMessages
    .where("[groupId+ts]")
    .between([key, Dexie.minKey], [key, Dexie.maxKey])
    .filter((row) => toNumber(row.expiresAt, 0) > currentTime)
    .toArray();
}

export async function searchMessages(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return { dm: [], group: [] };

  const cutoff = now();
  // Use the `type` index to fetch only text messages, then filter in JS
  const [dmRows, groupRows] = await Promise.all([
    db.dmMessages.where("type").equals("text").toArray(),
    db.groupMessages.where("type").equals("text").toArray(),
  ]);

  const dm = dmRows
    .filter(
      (row) =>
        toNumber(row.expiresAt, 0) > cutoff &&
        String(row.text || "")
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => toNumber(b.ts, 0) - toNumber(a.ts, 0))
    .slice(0, 100);

  const group = groupRows
    .filter(
      (row) =>
        toNumber(row.expiresAt, 0) > cutoff &&
        String(row.text || "")
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => toNumber(b.ts, 0) - toNumber(a.ts, 0))
    .slice(0, 100);

  return { dm, group };
}

export async function getCacheSummary() {
  const tables = [
    "encMedia",
    "decMedia",
    "stagedUploads",
    "dmMessages",
    "roomMeta",
    "groups",
    "groupMessages",
  ];
  const stores = await Promise.all(tables.map((table) => summarizeTable(table)));
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
