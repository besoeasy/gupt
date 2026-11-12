import { finalizeEvent } from "./crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { encryptDm, decryptDm, normalizePubkey } from "./crypto.js";
import { getRawEventsByOrigin, deleteRawEvent } from "./idb";
import { publishLocal, requestEngineSync } from "./engine";
import { normalizeBookmarkTags, parseBookmarkTagsInput } from "./bookmarks.js";
import { renewStreamItems } from "./streamRenewal.js";
import { STREAM_EXPIRY_SECONDS, STREAM_DELETE_EXPIRY_SECONDS } from "@/config/retention";

const NOTE_KIND = 1;
const NOTE_TAG = "gupt_note";

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
      collection: "gupt/vault/notes",
      labels: [NOTE_TAG, pubkeyHex],
      data: {
        v: 1,
        nonce: encryptedPayload.nonce,
        ciphertext: encryptedPayload.ciphertext,
      },
      created_at: Math.floor(Date.now() / 1000),
      expires_at: expiryTimestamp,
      kind: NOTE_KIND,
      tags: [
        ["p", pubkeyHex],
        ["t", NOTE_TAG],
        [NOTE_TAG, String(encryptedPayload)],
        ["expiration", String(expiryTimestamp)],
      ],
      content: "Note : https://github.com/besoeasy/gupt",
    },
    hexToBytes(privkeyHex),
  );

  await publishLocal(event, { origin: "notes" });
  return { ...payload, eventId: event.id, expiresAt: expiryTimestamp * 1000 };
}

async function decryptNoteEvents(privkeyHex, pubkeyHex, events) {
  const items = [];
  for (const event of events) {
    const encrypted = event.data?.ciphertext
      ? event.data
      : event.tags?.find((t) => t[0] === NOTE_TAG)?.[1] || event.data?.content || event.content;
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
  const pubkey = normalizePubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid pubkey");

  await requestEngineSync();
  const cached = await getNotesCached(privkeyHex, pubkeyHex);
  return cached?.items || [];
}

/**
 * Create or update a note. Pass `id` to update an existing item.
 * Tags stay inside ciphertext only.
 */
export async function saveNote(privkeyHex, pubkeyHex, fields, { id, existingItems } = {}) {
  const items =
    existingItems || (await getNotesCached(privkeyHex, pubkeyHex).catch(() => null))?.items || [];
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
  return publishNoteEvent(privkeyHex, pubkeyHex, payload, STREAM_EXPIRY_SECONDS);
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
  return publishNoteEvent(privkeyHex, pubkeyHex, payload, STREAM_EXPIRY_SECONDS);
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
  const result = await publishNoteEvent(
    privkeyHex,
    pubkeyHex,
    payload,
    STREAM_DELETE_EXPIRY_SECONDS,
  );
  if (item.eventId) {
    await deleteRawEvent(item.eventId).catch(() => {});
  }
  return result;
}

/** Renew stream items via the shared policy (see streamRenewal.js). */
export async function renewExpiringNotes(privkeyHex, pubkeyHex, items, opts = {}) {
  return renewStreamItems(items, (item) => renewNote(privkeyHex, pubkeyHex, item), opts);
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
