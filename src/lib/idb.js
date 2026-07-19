import Dexie from "dexie";
import { ipfsFetch } from "@/lib/ipfsFetch";
import {
  readConfiguredRetentionDays,
  readConfiguredRetentionMs,
  RETENTION_MAX_BYTES,
} from "@/config/retention";
import { normalizeRelayUrl } from "@/config/servers";
import { compressTextForCache, decompressTextFromCache } from "@/lib/messageCompression";

const APP_CACHE_DB_NAME = "gupt_app_cache_v3";
const STAGED_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const SEND_TIMING_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const RELAY_STATS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PEER_RELAY_HINTS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const RAW_EVENT_RETENTION_MS = 100 * 24 * 60 * 60 * 1000;

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

function hostnameFromFetchUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return String(url || "").slice(0, 48);
  }
}

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

function normalizeRelay(relay) {
  return normalizeRelayUrl(relay);
}

class GuptCacheDb extends Dexie {
  constructor() {
    super(APP_CACHE_DB_NAME);

    this.version(1).stores({
      encMedia: "&key, createdAt, expiresAt, lastAccessedAt",
      decMedia: "&key, createdAt, expiresAt, lastAccessedAt",
      stagedUploads: "&key, createdAt, expiresAt",
      dmMessages: "&id, roomId, ts, createdAt, expiresAt, type, [roomId+ts]",
      roomMeta: "&roomId, peerPubkey, updatedAt, lastMessageTs, expiresAt, unreadCount",
      groups: "&groupId, updatedAt, lastMessageTs, createdAt, expiresAt, unreadCount",
      groupMessages: "&key, groupId, ts, sender, expiresAt, type, [groupId+ts]",
      profiles: "&pubkey, fetchedAt, expiresAt",
      syncCursors: "&peerPubkey, lastSyncMs, updatedAt",
      messageSearch: "&id, roomId, groupId, ts, expiresAt, *tokens",
      sendTimings: "&id, kind, conversationId, completedAt, outcome, responseMs, expiresAt",
      relayStats: "&relay, updatedAt, expiresAt",
    });

    this.version(2).stores({
      peerRelayHints: "&peerPubkey, updatedAt",
    });

    this.version(3).stores({
      rawEvents:
        "&id, pubkey, kind, origin, peerPubkey, roomId, groupId, type, createdAt, expiresAt, [kind+createdAt], [kind+origin+createdAt], [roomId+ts], [groupId+ts]",
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
  };
}

function getEntryActivityTimestamp(tableName, entry) {
  switch (tableName) {
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

  return {
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
}

async function normalizeStoredGroupMessage(message, existing = null) {
  const groupId = String(message?.groupId || existing?.groupId || "").trim();
  const id = String(message?.id || existing?.id || "").trim();
  if (!groupId || !id) return null;

  const ts = Math.max(0, toNumber(message?.ts, existing?.ts || now()));
  const text =
    message?.type === "text" && message?.text != null
      ? await prepareTextForStorage(message.text)
      : message?.text;

  return {
    ...existing,
    ...message,
    text,
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

function formatStoredProfile(entry) {
  if (!entry) return null;
  return {
    name: entry.name ?? "",
    about: entry.about ?? "",
    picture: entry.picture ?? "",
    website: entry.website ?? "",
    status: entry.status ?? "",
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
  };
}

export function isProfileStale(profile, staleRatio = 0.8) {
  const fetchedAt = toNumber(profile?.fetchedAt, 0);
  if (!fetchedAt) return true;
  return fetchedAt + PROFILE_TTL_MS * staleRatio <= now();
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
    picture: sanitizeProfileField(profile?.picture, 2000),
    website: sanitizeProfileField(profile?.website, 500),
    status: sanitizeProfileField(profile?.status, 150),
    fetchedAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
  });
}

async function purgeOversizeCache() {
  const tables = ["encMedia", "decMedia", "dmMessages", "groupMessages", "rawEvents"];
  const allRows = (
    await Promise.all(
      tables.map(async (t) => {
        const rows = await db.table(t).toArray();
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
    purgeExpiredEntriesForTable("encMedia"),
    purgeExpiredEntriesForTable("decMedia"),
    purgeExpiredEntriesForTable("stagedUploads"),
    purgeExpiredEntriesForTable("dmMessages"),
    purgeExpiredEntriesForTable("roomMeta"),
    purgeExpiredEntriesForTable("groups"),
    purgeExpiredEntriesForTable("groupMessages"),
    purgeExpiredEntriesForTable("profiles"),
    purgeExpiredEntriesForTable("messageSearch"),
    purgeExpiredEntriesForTable("sendTimings"),
    purgeExpiredEntriesForTable("relayStats"),
    purgeExpiredEntriesForTable("rawEvents"),
    purgeStalePeerRelayHints(),
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
    db.syncCursors.clear(),
    db.messageSearch.clear(),
    db.sendTimings.clear(),
    db.relayStats.clear(),
    db.peerRelayHints.clear(),
    db.rawEvents.clear(),
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

export async function touchEncCached(url) {
  const key = String(url || "").trim();
  if (!key) return;
  const entry = await db.encMedia.get(key);
  if (!entry) return;
  await db.encMedia.put({ ...entry, lastAccessedAt: now() });
}

export async function fetchEncCached(url, options = {}) {
  const key = String(url || "").trim();
  if (!key) throw new Error("Missing media URL");

  const cached = await getFresh("encMedia", key);
  if (cached?.buf) {
    void touchEncCached(key);
    return cached.buf;
  }

  const timeoutMs = Number(options?.timeoutMs || 30_000);
  const externalSignal = options?.signal;
  const controller = new AbortController();
  let timeoutId = null;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  let res;
  try {
    res = await ipfsFetch(key, { signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Media fetch timed out: ${hostnameFromFetchUrl(key)}`);
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) throw new Error(`Media fetch failed (${res.status}): ${hostnameFromFetchUrl(key)}`);

  const buf = await res.arrayBuffer();
  const touchedAt = now();
  const expiry = createExpiry(touchedAt);
  await db.encMedia.put({
    key,
    buf,
    createdAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
    lastAccessedAt: touchedAt,
  });
  return buf;
}

export async function touchDecCached(msgId) {
  const key = String(msgId || "").trim();
  if (!key) return;
  const entry = await db.decMedia.get(key);
  if (!entry) return;
  await db.decMedia.put({ ...entry, lastAccessedAt: now() });
}

export async function getDecCached(msgId) {
  const entry = await getFresh("decMedia", String(msgId));
  if (!entry) return null;
  void touchDecCached(entry.key);
  return { buf: entry.buf, mime: entry.mime };
}

export async function putDecCached(msgId, buf, mime) {
  const key = String(msgId);
  const touchedAt = now();
  const expiry = createExpiry(touchedAt);
  await db.decMedia.put({
    key,
    buf,
    mime,
    createdAt: expiry.createdAt,
    expiresAt: expiry.expiresAt,
    lastAccessedAt: touchedAt,
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

async function upsertMessageSearchRows(rows) {
  const searchRows = (await Promise.all(rows.map((row) => buildMessageSearchRecord(row)))).filter(
    Boolean,
  );
  if (!searchRows.length) return;
  await db.messageSearch.bulkPut(searchRows);
}

export async function cacheRoomMessages(roomId, rows) {
  const records = (await Promise.all(rows.map((row) => normalizeCacheMessage(roomId, row)))).filter(
    Boolean,
  );
  if (!records.length) return;

  await db.transaction("rw", db.dmMessages, db.messageSearch, async () => {
    await db.dmMessages.bulkPut(records);
    await upsertMessageSearchRows(records);
  });
}

export async function putCachedRoomMessage(roomId, row) {
  const record = await normalizeCacheMessage(roomId, row);
  if (!record) return null;
  await db.transaction("rw", db.dmMessages, db.messageSearch, async () => {
    await db.dmMessages.put(record);
    const searchRow = await buildMessageSearchRecord(record);
    if (searchRow) await db.messageSearch.put(searchRow);
  });
  return record;
}

export async function deleteCachedRoomMessage(messageId) {
  const key = String(messageId || "").trim();
  if (!key) return;
  await db.transaction("rw", db.dmMessages, db.messageSearch, async () => {
    await db.dmMessages.delete(key);
    await db.messageSearch.delete(key);
  });
}

export async function listCachedRoomMessages(roomId) {
  const currentTime = now();
  const rows = await db.dmMessages
    .where("[roomId+ts]")
    .between([String(roomId), Dexie.minKey], [String(roomId), Dexie.maxKey])
    .filter((row) => toNumber(row.expiresAt, 0) > currentTime)
    .toArray();

  const hydrated = await Promise.all(
    rows.map(async ({ roomId: _roomId, createdAt: _createdAt, expiresAt: _expiresAt, ...row }) =>
      hydrateMessageText(row),
    ),
  );
  return hydrated;
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
  return db.transaction("rw", db.groupMessages, db.messageSearch, async () => {
    const existing = await getStoredGroupMessage(message?.groupId, message?.id);
    const next = await normalizeStoredGroupMessage(message, existing);
    if (!next) return null;
    await db.groupMessages.put(next);
    const searchRow = await buildMessageSearchRecord(next);
    if (searchRow) await db.messageSearch.put(searchRow);
    return next;
  });
}

export async function listStoredGroupMessages(groupId) {
  const currentTime = now();
  const key = String(groupId).trim();
  const rows = await db.groupMessages
    .where("[groupId+ts]")
    .between([key, Dexie.minKey], [key, Dexie.maxKey])
    .filter((row) => toNumber(row.expiresAt, 0) > currentTime)
    .toArray();
  return Promise.all(rows.map((row) => hydrateMessageText(row)));
}

export async function getSyncCursor(peerPubkey) {
  const key = String(peerPubkey || "").trim();
  if (!key) return null;
  return (await db.syncCursors.get(key)) || null;
}

export async function putSyncCursor(peerPubkey, lastSyncMs) {
  const key = String(peerPubkey || "").trim();
  if (!key) return null;
  const touchedAt = now();
  const row = {
    peerPubkey: key,
    lastSyncMs: Math.max(0, toNumber(lastSyncMs, 0)),
    updatedAt: touchedAt,
  };
  await db.syncCursors.put(row);
  return row;
}

// ---------------------------------------------------------------------------
// Peer Relay Hints (per-peer, per-conversation relay hint store)
// ---------------------------------------------------------------------------

const PEER_RELAY_HINT_CAPACITY = 12;

export async function getPeerRelayHints(peerPubkey) {
  const key = String(peerPubkey || "").trim();
  if (!key) return null;
  return (await db.peerRelayHints.get(key)) || null;
}

export async function putPeerRelayHints(peerPubkey, hints) {
  const key = String(peerPubkey || "").trim();
  if (!key) return null;
  const touchedAt = now();
  const row = {
    peerPubkey: key,
    hints: Array.isArray(hints) ? hints.slice(0, PEER_RELAY_HINT_CAPACITY) : [],
    updatedAt: touchedAt,
  };
  await db.peerRelayHints.put(row);
  return row;
}

/**
 * Extract and store relay hints from a list of inbound DM events for a given peer.
 * Applies Hint_Capacity eviction: when full, the oldest hint is removed.
 * `messages` should be objects with at least `{ sender, relayHint, ts }` shape.
 */
export async function collectPeerRelayHints(peerPubkey, messages) {
  const key = String(peerPubkey || "").trim();
  if (!key || !Array.isArray(messages) || !messages.length) return;

  const existing = (await db.peerRelayHints.get(key)) || {
    peerPubkey: key,
    hints: [],
    updatedAt: 0,
  };

  const hintMap = new Map(existing.hints.map((h) => [h.url, h.lastSeenAt]));

  for (const msg of messages) {
    if (!msg?.relayHint) continue;
    const normalized = normalizeRelay(msg.relayHint);
    if (!normalized) continue;
    const ts = Math.max(0, toNumber(msg.ts, now()));
    const prev = hintMap.get(normalized);
    if (!prev || ts > prev) {
      hintMap.set(normalized, ts);
    }
  }

  let entries = [...hintMap.entries()]
    .map(([url, lastSeenAt]) => ({ url, lastSeenAt }))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  if (entries.length > PEER_RELAY_HINT_CAPACITY) {
    entries = entries.slice(0, PEER_RELAY_HINT_CAPACITY);
  }

  await db.peerRelayHints.put({
    peerPubkey: key,
    hints: entries,
    updatedAt: now(),
  });
}

function purgeStalePeerRelayHints() {
  const cutoff = now() - PEER_RELAY_HINTS_RETENTION_MS;
  return db.peerRelayHints.where("updatedAt").belowOrEqual(cutoff).delete();
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

  const dmIds = hits.filter((row) => row.roomId).map((row) => row.id);
  const groupKeys = hits.filter((row) => row.groupId).map((row) => `${row.groupId}:${row.id}`);

  const [dmRows, groupMessageRows] = await Promise.all([
    dmIds.length ? db.dmMessages.bulkGet(dmIds) : [],
    groupKeys.length ? db.groupMessages.bulkGet(groupKeys) : [],
  ]);

  const dm = (
    await Promise.all(
      (dmRows || [])
        .filter((row) => row && toNumber(row.expiresAt, 0) > cutoff)
        .map((row) => hydrateMessageText(row)),
    )
  ).sort((a, b) => toNumber(b.ts, 0) - toNumber(a.ts, 0));

  const group = (
    await Promise.all(
      (groupMessageRows || [])
        .filter((row) => row && toNumber(row.expiresAt, 0) > cutoff)
        .map((row) => hydrateMessageText(row)),
    )
  ).sort((a, b) => toNumber(b.ts, 0) - toNumber(a.ts, 0));

  return { dm, group };
}

export async function recordSendTiming(record) {
  const id = String(record?.id || "").trim();
  if (!id) return null;

  const completedAt = toNumber(record.completedAt, now());
  const expiry = createExpiry(completedAt, SEND_TIMING_RETENTION_MS);
  const row = {
    id,
    kind: record.kind === "group" ? "group" : "dm",
    conversationId: String(record.conversationId || ""),
    messageType: String(record.messageType || ""),
    enqueuedAt: toNumber(record.enqueuedAt, completedAt),
    completedAt,
    responseMs: Math.max(
      0,
      toNumber(record.responseMs, completedAt - toNumber(record.enqueuedAt, completedAt)),
    ),
    attempts: Math.max(1, toNumber(record.attempts, 1)),
    outcome: record.outcome === "failed" ? "failed" : "success",
    attemptDurations: Array.isArray(record.attemptDurations)
      ? record.attemptDurations.map((value) => Math.max(0, toNumber(value, 0)))
      : [],
    lastError: String(record.lastError || "").slice(0, 500),
    expiresAt: expiry.expiresAt,
  };

  await db.sendTimings.put(row);
  return row;
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
  const publishTotal = toNumber(row.publishOk, 0) + toNumber(row.publishFail, 0);
  const publishRate = successRate(row.publishOk, row.publishFail);
  const connectTotal = toNumber(row.connectOk, 0) + toNumber(row.connectFail, 0);
  const connectRate = successRate(row.connectOk, row.connectFail);

  if (publishTotal >= 10 && publishRate !== null && publishRate < 50) return "replace";
  if (publishTotal >= 5 && publishRate !== null && publishRate < 70) return "degraded";
  if (connectTotal >= 5 && connectRate !== null && connectRate < 50) return "replace";
  if (connectTotal >= 3 && connectRate !== null && connectRate < 70) return "degraded";
  if (publishTotal >= 3 && publishRate !== null && publishRate >= 80) return "good";
  if (connectTotal >= 3 && connectRate !== null && connectRate >= 80) return "good";
  return "unknown";
}

/**
 * Record per-relay operation outcomes (publish, connect, or query).
 *
 * @param {"publish"|"connect"|"query"} operation
 * @param {Array<{ relay: string, ok: boolean, latencyMs?: number, error?: string }>} outcomes
 */
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
          existing.publishLatencySamples += 1;
          existing.lastPublishOkAt = touchedAt;
        } else {
          existing.publishFail += 1;
          existing.lastPublishFailAt = touchedAt;
          if (error) existing.lastError = error;
        }
      } else if (op === "connect") {
        if (ok) {
          existing.connectOk += 1;
          existing.connectLatencyTotalMs += latencyMs;
          existing.connectLatencySamples += 1;
          existing.lastConnectOkAt = touchedAt;
        } else {
          existing.connectFail += 1;
          existing.lastConnectFailAt = touchedAt;
          if (error) existing.lastError = error;
        }
      } else if (ok) {
        existing.queryOk += 1;
        existing.queryLatencyTotalMs += latencyMs;
        existing.queryLatencySamples += 1;
        existing.lastQueryOkAt = touchedAt;
      } else {
        existing.queryFail += 1;
        existing.lastQueryFailAt = touchedAt;
        if (error) existing.lastError = error;
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
      const tier = classifyRelayHealth(row);

      return {
        relay: row.relay,
        tier,
        publishOk: toNumber(row.publishOk, 0),
        publishFail: toNumber(row.publishFail, 0),
        publishTotal,
        publishSuccessRate: successRate(row.publishOk, row.publishFail),
        avgPublishMs: avgLatency(row.publishLatencyTotalMs, row.publishLatencySamples),
        connectOk: toNumber(row.connectOk, 0),
        connectFail: toNumber(row.connectFail, 0),
        connectTotal,
        connectSuccessRate: successRate(row.connectOk, row.connectFail),
        avgConnectMs: avgLatency(row.connectLatencyTotalMs, row.connectLatencySamples),
        queryOk: toNumber(row.queryOk, 0),
        queryFail: toNumber(row.queryFail, 0),
        queryTotal,
        querySuccessRate: successRate(row.queryOk, row.queryFail),
        avgQueryMs: avgLatency(row.queryLatencyTotalMs, row.queryLatencySamples),
        lastPublishOkAt: toNumber(row.lastPublishOkAt, 0),
        lastPublishFailAt: toNumber(row.lastPublishFailAt, 0),
        lastConnectOkAt: toNumber(row.lastConnectOkAt, 0),
        lastConnectFailAt: toNumber(row.lastConnectFailAt, 0),
        lastError: row.lastError || "",
        updatedAt: toNumber(row.updatedAt, 0),
      };
    })
    .sort((left, right) => {
      const tierRank = { replace: 0, degraded: 1, unknown: 2, good: 3 };
      const leftRank = tierRank[left.tier] ?? 2;
      const rightRank = tierRank[right.tier] ?? 2;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (left.publishSuccessRate ?? 101) - (right.publishSuccessRate ?? 101);
    });
}

export async function getSendTimingStats({ kind, conversationId, sinceMs = 0 } = {}) {
  const cutoff = Math.max(0, toNumber(sinceMs, 0));
  const currentTime = now();
  let rows = await db.sendTimings.where("completedAt").aboveOrEqual(cutoff).toArray();
  rows = rows.filter((row) => toNumber(row.expiresAt, 0) > currentTime);

  if (kind) rows = rows.filter((row) => row.kind === kind);
  if (conversationId) {
    const target = String(conversationId);
    rows = rows.filter((row) => row.conversationId === target);
  }

  const successful = rows.filter((row) => row.outcome === "success");
  const failed = rows.filter((row) => row.outcome === "failed");
  const responseTimes = successful
    .map((row) => toNumber(row.responseMs, 0))
    .filter((value) => value > 0);

  if (!responseTimes.length) {
    return {
      count: rows.length,
      successCount: successful.length,
      failedCount: failed.length,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
    };
  }

  const total = responseTimes.reduce((sum, value) => sum + value, 0);
  return {
    count: rows.length,
    successCount: successful.length,
    failedCount: failed.length,
    avgMs: Math.round(total / responseTimes.length),
    minMs: Math.min(...responseTimes),
    maxMs: Math.max(...responseTimes),
  };
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
    "rawEvents",
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

// ---------------------------------------------------------------------------
// rawEvents — full signed Nostr events for replication + decrypt-on-read
// ---------------------------------------------------------------------------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Store a full signed Nostr event in rawEvents for replication + decrypt-on-read.
 *
 * @param {object} event — full Nostr event (id, pubkey, kind, content, tags, sig, created_at)
 * @param {string} origin — "dm" | "vault" | "group" | "group-roster" | "share" | "invite"
 * @param {{ peerPubkey?: string, roomId?: string, groupId?: string, type?: string }} [denorm]
 */
export async function putRawEvent(event, origin, denorm = {}) {
  if (!event?.id) return;
  const createdAt = toNumber(event.created_at, 0) * 1000;
  const expiryTag = event.tags?.find((t) => t[0] === "expiration");
  const expiresAt = expiryTag
    ? Number(expiryTag[1]) * 1000
    : createdAt + RAW_EVENT_RETENTION_MS;
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
    event,
  });
}

/**
 * Sample random kind-1/kind-4 events newer than a cutoff for replication.
 * Returns up to `limit` rows, shuffled.
 */
export async function sampleRawEvents({ kinds, minCreatedAt, limit = 50 } = {}) {
  const kindList = Array.isArray(kinds) ? kinds : kinds ? [kinds] : [1, 4];
  const cutoff = Math.max(0, toNumber(minCreatedAt, 0));
  const rows = await db.rawEvents
    .where("[kind+createdAt]")
    .between([Math.min(...kindList), cutoff], [Math.max(...kindList), Dexie.maxKey])
    .and((row) => kindList.includes(row.kind))
    .toArray();
  return shuffle(rows).slice(0, limit);
}

/**
 * Get all rawEvents rows for a given origin (e.g. "vault").
 */
export async function getRawEventsByOrigin(origin, { minCreatedAt = 0 } = {}) {
  return db.rawEvents
    .where("[kind+origin+createdAt]")
    .between([Dexie.minKey, origin, minCreatedAt], [Dexie.maxKey, origin, Dexie.maxKey])
    .and((row) => row.origin === origin)
    .toArray();
}

/**
 * Read DM event rows from rawEvents for a given room, newest-first or oldest-first.
 * Returns raw rows — caller decrypts via decryptRows().
 */
export async function listRoomEvents(roomId) {
  const currentTime = now();
  return db.rawEvents
    .where("[roomId+ts]")
    .between([String(roomId), Dexie.minKey], [String(roomId), Dexie.maxKey])
    .and((row) => row.origin === "dm" && toNumber(row.expiresAt, 0) > currentTime)
    .toArray();
}

/**
 * Read group message event rows from rawEvents for a given group.
 * Returns raw rows — caller decrypts via decryptRows().
 */
export async function listGroupEvents(groupId) {
  const currentTime = now();
  return db.rawEvents
    .where("[groupId+ts]")
    .between([String(groupId), Dexie.minKey], [String(groupId), Dexie.maxKey])
    .and((row) => row.origin === "group" && toNumber(row.expiresAt, 0) > currentTime)
    .toArray();
}
