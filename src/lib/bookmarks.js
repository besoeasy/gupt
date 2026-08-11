import { finalizeEvent } from "./crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { encryptDm, decryptDm, normalizeNostrPubkey } from "./crypto.js";
import { publishToRelays, query } from "./relay";
import { putRawEvent, getRawEventsByOrigin, deleteRawEvent } from "./idb";

const BOOKMARK_KIND = 1;
const BOOKMARK_TAG = "gupt_bookmark";

export const BOOKMARK_EXPIRY_SECONDS = 3 * 365 * 24 * 60 * 60;
export const BOOKMARK_DELETE_EXPIRY_SECONDS = 10 * 365 * 24 * 60 * 60;
export const BOOKMARK_RENEW_WITHIN_MS = 30 * 24 * 60 * 60 * 1000;
export const BOOKMARK_RENEW_BATCH_LIMIT = 20;

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "si",
]);

function newId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Normalize URL for storage and dedupe. */
export function normalizeBookmarkUrl(raw) {
  const input = String(raw || "").trim();
  if (!input) return "";
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    try {
      parsed = new URL(`https://${input}`);
    } catch {
      return "";
    }
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.hostname.startsWith("www.")) {
    parsed.hostname = parsed.hostname.slice(4);
  }

  const keys = [...parsed.searchParams.keys()];
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
      parsed.searchParams.delete(key);
    }
  }

  let path = parsed.pathname || "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  parsed.pathname = path || "/";

  return parsed.toString();
}

export function bookmarkHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url || "";
  }
}

async function publishBookmarkEvent(privkeyHex, pubkeyHex, payload, expirySeconds) {
  const encryptedPayload = await encryptDm(privkeyHex, pubkeyHex, JSON.stringify(payload));
  const expiryTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;
  const event = finalizeEvent(
    {
      kind: BOOKMARK_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", pubkeyHex],
        ["t", BOOKMARK_TAG],
        [BOOKMARK_TAG, encryptedPayload],
        ["expiration", String(expiryTimestamp)],
      ],
      content: "Bookmark : https://github.com/besoeasy/gupt",
    },
    hexToBytes(privkeyHex),
  );

  const publishResponse = await publishToRelays([], event);
  const anyOk = Object.values(publishResponse).some((r) => r.ok);
  if (!anyOk) throw new Error("Failed to publish bookmark to relays.");

  void putRawEvent(event, "bookmarks").catch(() => {});
  return {
    ...payload,
    eventId: event.id,
    expiresAt: expiryTimestamp * 1000,
  };
}

async function decryptBookmarkEvents(privkeyHex, pubkeyHex, events) {
  const items = [];
  for (const event of events) {
    const encrypted = event.tags?.find((t) => t[0] === BOOKMARK_TAG)?.[1];
    if (!encrypted) continue;
    try {
      const plaintext = await decryptDm(privkeyHex, pubkeyHex, encrypted);
      const item = JSON.parse(plaintext);
      if (!item?.id) continue;
      item.eventId = event.id;
      const expiryTag = event.tags?.find((t) => t[0] === "expiration");
      if (expiryTag) {
        item.expiresAt = Number(expiryTag[1]) * 1000;
        if (item.expiresAt < Date.now()) continue;
      }
      items.push(item);
    } catch (err) {
      console.warn("Failed to decrypt a bookmark", err);
    }
  }
  return items;
}

/** Collapse stream: tombstone wins; else newest live by updatedAt. */
export function reduceBookmarks(items) {
  const deletedIds = new Set();
  const liveById = new Map();

  for (const item of items) {
    if (item.deleted === true) {
      deletedIds.add(item.id);
      liveById.delete(item.id);
      continue;
    }
    if (deletedIds.has(item.id)) continue;
    const prev = liveById.get(item.id);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) {
      liveById.set(item.id, item);
    }
  }

  return [...liveById.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getBookmarksCached(privkeyHex, pubkeyHex) {
  const rows = await getRawEventsByOrigin("bookmarks").catch(() => []);
  if (!rows.length) return null;
  const events = rows.map((r) => r.event);
  const decrypted = await decryptBookmarkEvents(privkeyHex, pubkeyHex, events);
  return { items: reduceBookmarks(decrypted), fresh: false };
}

export async function fetchBookmarks(privkeyHex, pubkeyHex) {
  const pubkey = normalizeNostrPubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid pubkey");

  const events = await query(
    [
      {
        kinds: [BOOKMARK_KIND],
        authors: [pubkey],
        "#p": [pubkey],
        "#t": [BOOKMARK_TAG],
      },
    ],
    5000,
  );

  const bookmarkEvents = events.filter((e) => e.kind === BOOKMARK_KIND);
  for (const event of bookmarkEvents) {
    void putRawEvent(event, "bookmarks").catch(() => {});
  }

  const decrypted = await decryptBookmarkEvents(privkeyHex, pubkeyHex, bookmarkEvents);
  return reduceBookmarks(decrypted);
}

/**
 * Create or update a bookmark. Same normalized URL renews existing id.
 */
export async function saveBookmark(privkeyHex, pubkeyHex, { title, url }, existingItems = null) {
  const normalizedUrl = normalizeBookmarkUrl(url);
  if (!normalizedUrl) throw new Error("A valid URL is required.");

  const items = existingItems || (await fetchBookmarks(privkeyHex, pubkeyHex));
  const existing = items.find((b) => b.url === normalizedUrl);
  const now = Date.now();
  const resolvedTitle = String(title || "").trim() || bookmarkHostname(normalizedUrl) || "Bookmark";

  if (existing) {
    const payload = {
      v: 1,
      id: existing.id,
      title: resolvedTitle,
      url: normalizedUrl,
      createdAt: existing.createdAt || now,
      updatedAt: now,
      prevEventId: existing.eventId || null,
    };
    return publishBookmarkEvent(privkeyHex, pubkeyHex, payload, BOOKMARK_EXPIRY_SECONDS);
  }

  const payload = {
    v: 1,
    id: newId(),
    title: resolvedTitle,
    url: normalizedUrl,
    createdAt: now,
    updatedAt: now,
    prevEventId: null,
  };
  return publishBookmarkEvent(privkeyHex, pubkeyHex, payload, BOOKMARK_EXPIRY_SECONDS);
}

/** Renew a live bookmark (same id, new expiry, prevEventId chain). */
export async function renewBookmark(privkeyHex, pubkeyHex, bookmark) {
  if (!bookmark?.id || !bookmark?.url) throw new Error("Invalid bookmark.");
  const now = Date.now();
  const payload = {
    v: 1,
    id: bookmark.id,
    title: bookmark.title || bookmarkHostname(bookmark.url) || "Bookmark",
    url: bookmark.url,
    createdAt: bookmark.createdAt || now,
    updatedAt: now,
    prevEventId: bookmark.eventId || null,
  };
  return publishBookmarkEvent(privkeyHex, pubkeyHex, payload, BOOKMARK_EXPIRY_SECONDS);
}

/** Delete via never-renewed tombstone (no Kind 5). */
export async function deleteBookmark(privkeyHex, pubkeyHex, bookmark) {
  if (!bookmark?.id) throw new Error("Invalid bookmark.");
  const now = Date.now();
  const payload = {
    v: 1,
    id: bookmark.id,
    deleted: true,
    createdAt: bookmark.createdAt || now,
    updatedAt: now,
    prevEventId: bookmark.eventId || null,
  };
  const result = await publishBookmarkEvent(
    privkeyHex,
    pubkeyHex,
    payload,
    BOOKMARK_DELETE_EXPIRY_SECONDS,
  );
  if (bookmark.eventId) {
    await deleteRawEvent(bookmark.eventId).catch(() => {});
  }
  return result;
}

export function needsRenewal(bookmark, now = Date.now()) {
  if (!bookmark?.expiresAt || bookmark.deleted) return false;
  return bookmark.expiresAt - now < BOOKMARK_RENEW_WITHIN_MS;
}

/** Renew near-expiry bookmarks (call on /bookmarks load). Returns updated list. */
export async function renewExpiringBookmarks(privkeyHex, pubkeyHex, items) {
  const due = items.filter((b) => needsRenewal(b)).slice(0, BOOKMARK_RENEW_BATCH_LIMIT);
  if (!due.length) return items;

  const byId = new Map(items.map((b) => [b.id, b]));
  for (const bookmark of due) {
    try {
      const renewed = await renewBookmark(privkeyHex, pubkeyHex, bookmark);
      byId.set(renewed.id, renewed);
    } catch (err) {
      console.warn("Failed to renew bookmark", bookmark.id, err);
    }
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
