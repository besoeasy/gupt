import { finalizeEvent } from "./crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { encryptDm, decryptDm, normalizeNostrPubkey } from "./crypto.js";
import { publishToRelays, query } from "./relay";
import { putRawEvent, getRawEventsByOrigin, deleteRawEvent } from "./idb";
import { normalizeBookmarkTags, parseBookmarkTagsInput } from "./bookmarks.js";
import { renewStreamItems, isUrgentExpiry } from "./streamRenewal.js";
import { enqueuePublish } from "./sendQueue";

const NOTE_KIND = 1;
const NOTE_TAG = "gupt_note";

export const NOTE_EXPIRY_SECONDS = 3 * 365 * 24 * 60 * 60;
export const NOTE_DELETE_EXPIRY_SECONDS = 10 * 365 * 24 * 60 * 60;

export const normalizeNoteTags = normalizeBookmarkTags;
export const parseNoteTagsInput = parseBookmarkTagsInput;

function newId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function firstLineTitle(body) {
  const line = String(body || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  if (!line) return "Note";
  return line.slice(0, 80);
}

function resolveTitle(title, body) {
  const t = String(title || "").trim();
  if (t) return t;
  return firstLineTitle(body);
}

function sanitizeLiveFields({ title, body, tags }) {
  const resolvedBody = String(body || "");
  if (!resolvedBody.trim() && !String(title || "").trim()) {
    throw new Error("Title or body is required.");
  }
  return {
    title: resolveTitle(title, resolvedBody),
    body: resolvedBody,
    tags: normalizeNoteTags(tags),
  };
}

async function publishNoteEvent(privkeyHex, pubkeyHex, payload, expirySeconds) {
  const encryptedPayload = await encryptDm(privkeyHex, pubkeyHex, JSON.stringify(payload));
  const expiryTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;
  const event = finalizeEvent(
    {
      kind: NOTE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", pubkeyHex],
        ["t", NOTE_TAG],
        [NOTE_TAG, encryptedPayload],
        ["expiration", String(expiryTimestamp)],
      ],
      content: "Note : https://github.com/besoeasy/gupt",
    },
    hexToBytes(privkeyHex),
  );

  return enqueuePublish({
    id: event.id,
    kind: "note",
    result: { ...payload, eventId: event.id, expiresAt: expiryTimestamp * 1000 },
    fn: async () => {
      const publishResponse = await publishToRelays([], event);
      const anyOk = Object.values(publishResponse).some((r) => r.ok);
      if (!anyOk) throw new Error("Failed to publish note to relays.");
      void putRawEvent(event, "notes").catch(() => {});
    },
  });
}

async function decryptNoteEvents(privkeyHex, pubkeyHex, events) {
  const items = [];
  for (const event of events) {
    const encrypted = event.tags?.find((t) => t[0] === NOTE_TAG)?.[1];
    if (!encrypted) continue;
    try {
      const plaintext = await decryptDm(privkeyHex, pubkeyHex, encrypted);
      const item = JSON.parse(plaintext);
      if (!item?.id) continue;
      item.eventId = event.id;
      if (!item.deleted) {
        item.title = String(item.title || resolveTitle("", item.body));
        item.body = String(item.body || "");
        item.tags = normalizeNoteTags(item.tags);
      }
      const expiryTag = event.tags?.find((t) => t[0] === "expiration");
      if (expiryTag) {
        item.expiresAt = Number(expiryTag[1]) * 1000;
        if (item.expiresAt < Date.now()) continue;
      }
      items.push(item);
    } catch (err) {
      console.warn("Failed to decrypt a note", err);
    }
  }
  return items;
}

/** Collapse stream: tombstone wins; else newest live by updatedAt. */
export function reduceNotes(items) {
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

export async function getNotesCached(privkeyHex, pubkeyHex) {
  const rows = await getRawEventsByOrigin("notes").catch(() => []);
  if (!rows.length) return null;
  const events = rows.map((r) => r.event);
  const decrypted = await decryptNoteEvents(privkeyHex, pubkeyHex, events);
  return { items: reduceNotes(decrypted), fresh: false };
}

export async function fetchNotes(privkeyHex, pubkeyHex) {
  const pubkey = normalizeNostrPubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid pubkey");

  const events = await query(
    [
      {
        kinds: [NOTE_KIND],
        authors: [pubkey],
        "#p": [pubkey],
        "#t": [NOTE_TAG],
      },
    ],
    5000,
  );

  const noteEvents = events.filter((e) => e.kind === NOTE_KIND);
  for (const event of noteEvents) {
    void putRawEvent(event, "notes").catch(() => {});
  }

  const decrypted = await decryptNoteEvents(privkeyHex, pubkeyHex, noteEvents);
  return reduceNotes(decrypted);
}

/**
 * Create or update a note. Pass `id` to update an existing item.
 * Tags stay inside ciphertext only.
 */
export async function saveNote(privkeyHex, pubkeyHex, fields, { id, existingItems } = {}) {
  const items = existingItems || (await fetchNotes(privkeyHex, pubkeyHex).catch(() => []));
  const existing = id ? items.find((n) => n.id === id) : null;
  if (id && !existing) throw new Error("Note not found.");

  const now = Date.now();
  const live = sanitizeLiveFields({
    title: fields.title !== undefined ? fields.title : existing?.title,
    body: fields.body !== undefined ? fields.body : existing?.body,
    tags: fields.tags !== undefined ? fields.tags : existing?.tags || [],
  });

  const payload = {
    v: 1,
    id: existing?.id || newId(),
    ...live,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    prevEventId: existing?.eventId || null,
  };
  return publishNoteEvent(privkeyHex, pubkeyHex, payload, NOTE_EXPIRY_SECONDS);
}

export async function renewNote(privkeyHex, pubkeyHex, item) {
  if (!item?.id) throw new Error("Invalid note.");
  const now = Date.now();
  const live = sanitizeLiveFields(item);
  const payload = {
    v: 1,
    id: item.id,
    ...live,
    createdAt: item.createdAt || now,
    updatedAt: now,
    prevEventId: item.eventId || null,
  };
  return publishNoteEvent(privkeyHex, pubkeyHex, payload, NOTE_EXPIRY_SECONDS);
}

/** Delete via never-renewed tombstone (no Kind 5). */
export async function deleteNote(privkeyHex, pubkeyHex, item) {
  if (!item?.id) throw new Error("Invalid note.");
  const now = Date.now();
  const payload = {
    v: 1,
    id: item.id,
    deleted: true,
    createdAt: item.createdAt || now,
    updatedAt: now,
    prevEventId: item.eventId || null,
  };
  const result = await publishNoteEvent(privkeyHex, pubkeyHex, payload, NOTE_DELETE_EXPIRY_SECONDS);
  if (item.eventId) {
    await deleteRawEvent(item.eventId).catch(() => {});
  }
  return result;
}

export function needsRenewal(item, now = Date.now()) {
  return isUrgentExpiry(item, now);
}

/** Renew on /notes load: urgent near-expiry items, else 50% oldest. */
export async function renewExpiringNotes(privkeyHex, pubkeyHex, items) {
  return renewStreamItems(items, (item) => renewNote(privkeyHex, pubkeyHex, item));
}

/** Plain-text preview snippet from markdown body. */
export function notePreview(body, maxLen = 120) {
  const plain = String(body || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen - 1)}…`;
}
