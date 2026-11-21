import { finalizeEvent } from "./crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { encryptDm, decryptDm, normalizePubkey } from "./crypto.js";
import { getRawEventsByOrigin, deleteRawEvent } from "./idb.js";
import { publishLocal, requestEngineSync } from "./engine/index.js";
import { normalizeBookmarkTags, parseBookmarkTagsInput } from "./bookmarks.js";
import { renewStreamItems } from "./streamRenewal.js";
import { STREAM_EXPIRY_SECONDS, STREAM_DELETE_EXPIRY_SECONDS } from "../config/retention.js";

import {
  CONTACT_COLLECTION,
  CONTACT_TAG,
  CONTACT_MAX_CUSTOM_FIELDS,
  CONTACT_MAX_FIELD_KEY_CHARS,
  CONTACT_MAX_FIELD_VALUE_CHARS,
  CONTACT_MAX_EMAILS,
  CONTACT_MAX_PHONES,
  normalizeContactEmails,
  normalizeContactPhones,
  normalizeContactFields,
  normalizeContactLocation,
  reduceContacts,
  contactSearchText,
  contactDisplaySubtitle,
  findContactByPubkey,
} from "./contactFields.js";

export {
  CONTACT_COLLECTION,
  CONTACT_TAG,
  CONTACT_MAX_CUSTOM_FIELDS,
  CONTACT_MAX_FIELD_KEY_CHARS,
  CONTACT_MAX_FIELD_VALUE_CHARS,
  CONTACT_MAX_EMAILS,
  CONTACT_MAX_PHONES,
  normalizeContactEmails,
  normalizeContactPhones,
  normalizeContactFields,
  normalizeContactLocation,
  reduceContacts,
  contactSearchText,
  contactDisplaySubtitle,
  findContactByPubkey,
};

const CONTACT_KIND = 1;

export const normalizeContactTags = normalizeBookmarkTags;
export const parseContactTagsInput = parseBookmarkTagsInput;

function newId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function resolveName(name, emails, phones) {
  const t = String(name || "")
    .trim()
    .slice(0, 120);
  if (t) return t;
  if (emails?.[0]) return emails[0];
  if (phones?.[0]) return phones[0];
  return "Contact";
}

function sanitizeLiveFields({ name, pubkey, emails, phones, location, fields, notes, tags }) {
  const resolvedEmails = normalizeContactEmails(emails);
  const resolvedPhones = normalizeContactPhones(phones);
  const resolvedFields = normalizeContactFields(fields);
  const resolvedLocation = normalizeContactLocation(location);
  const linked = normalizePubkey(pubkey) || "";
  const resolvedName = resolveName(name, resolvedEmails, resolvedPhones);
  if (
    !resolvedName ||
    (!String(name || "").trim() &&
      !resolvedEmails.length &&
      !resolvedPhones.length &&
      !resolvedFields.length &&
      !resolvedLocation &&
      !String(notes || "").trim())
  ) {
    throw new Error("Add a name, email, phone, location or custom field first.");
  }
  return {
    name: resolvedName,
    pubkey: linked,
    emails: resolvedEmails,
    phones: resolvedPhones,
    location: resolvedLocation,
    fields: resolvedFields,
    notes: String(notes || "")
      .trim()
      .slice(0, 2000),
    tags: normalizeContactTags(tags),
  };
}

async function publishContactEvent(privkeyHex, pubkeyHex, payload, expirySeconds) {
  const encryptedPayload = await encryptDm(privkeyHex, pubkeyHex, JSON.stringify(payload));
  const expiryTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;
  const event = finalizeEvent(
    {
      collection: CONTACT_COLLECTION,
      labels: [CONTACT_TAG, pubkeyHex],
      data: {
        v: 1,
        nonce: encryptedPayload.nonce,
        ciphertext: encryptedPayload.ciphertext,
      },
      created_at: Math.floor(Date.now() / 1000),
      expires_at: expiryTimestamp,
      kind: CONTACT_KIND,
      tags: [
        ["p", pubkeyHex],
        ["t", CONTACT_TAG],
        [CONTACT_TAG, String(encryptedPayload)],
        ["expiration", String(expiryTimestamp)],
      ],
      content: "Contact : https://github.com/besoeasy/gupt",
    },
    hexToBytes(privkeyHex),
  );

  await publishLocal(event, { origin: "contacts" });
  return { ...payload, eventId: event.id, expiresAt: expiryTimestamp * 1000 };
}

function repairDecrypted(item) {
  if (item.deleted) return item;
  return {
    ...item,
    name: String(item.name || resolveName("", item.emails, item.phones)),
    pubkey: normalizePubkey(item.pubkey) || "",
    emails: normalizeContactEmails(item.emails),
    phones: normalizeContactPhones(item.phones),
    location: normalizeContactLocation(item.location),
    fields: normalizeContactFields(item.fields),
    notes: String(item.notes || ""),
    tags: normalizeContactTags(item.tags),
  };
}

async function decryptContactEvents(privkeyHex, pubkeyHex, events) {
  const items = [];
  for (const event of events) {
    const encrypted = event.data?.ciphertext
      ? event.data
      : event.tags?.find((t) => t[0] === CONTACT_TAG)?.[1] || event.data?.content || event.content;
    if (!encrypted) continue;
    try {
      const plaintext = await decryptDm(privkeyHex, pubkeyHex, encrypted);
      const item = JSON.parse(plaintext);
      if (!item?.id) continue;
      item.eventId = event.id;
      const repaired = repairDecrypted(item);
      Object.assign(item, repaired);
      const expiryTag = event.tags?.find((t) => t[0] === "expiration");
      if (expiryTag) {
        item.expiresAt = Number(expiryTag[1]) * 1000;
        if (item.expiresAt < Date.now()) continue;
      }
      items.push(item);
    } catch (err) {
      console.warn("Failed to decrypt a contact", err);
    }
  }
  return items;
}

export async function getContactsCached(privkeyHex, pubkeyHex) {
  const rows = await getRawEventsByOrigin("contacts").catch(() => []);
  if (!rows.length) return null;
  const events = rows.map((r) => r.event);
  const decrypted = await decryptContactEvents(privkeyHex, pubkeyHex, events);
  return { items: reduceContacts(decrypted), fresh: false };
}

export async function fetchContacts(privkeyHex, pubkeyHex) {
  const pubkey = normalizePubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid pubkey");

  await requestEngineSync();
  const cached = await getContactsCached(privkeyHex, pubkeyHex);
  return cached?.items || [];
}

/**
 * Create or update a contact. Pass `id` to update an existing item.
 * `fields` is the endless part: [{ key, value }] with label/name aliases.
 * Everything stays inside ciphertext only.
 */
export async function saveContact(privkeyHex, pubkeyHex, input, { id, existingItems } = {}) {
  const items =
    existingItems ||
    (await getContactsCached(privkeyHex, pubkeyHex).catch(() => null))?.items ||
    [];
  const existing = id ? items.find((c) => c.id === id) : null;
  if (id && !existing) throw new Error("Contact not found.");

  const merged = {
    name: input.name !== undefined ? input.name : existing?.name,
    pubkey: input.pubkey !== undefined ? input.pubkey : existing?.pubkey,
    emails: input.emails !== undefined ? input.emails : existing?.emails,
    phones: input.phones !== undefined ? input.phones : existing?.phones,
    location: input.location !== undefined ? input.location : existing?.location,
    fields: input.fields !== undefined ? input.fields : existing?.fields,
    notes: input.notes !== undefined ? input.notes : existing?.notes,
    tags: input.tags !== undefined ? input.tags : existing?.tags || [],
  };

  const now = Date.now();
  const live = sanitizeLiveFields(merged);

  const payload = {
    v: 1,
    id: existing?.id || newId(),
    ...live,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    prevEventId: existing?.eventId || null,
  };
  return publishContactEvent(privkeyHex, pubkeyHex, payload, STREAM_EXPIRY_SECONDS);
}

/** The saved contact for a peer key, or null — used by the DM header. */
export async function getContactForPeer(privkeyHex, pubkeyHex, peerPubkey) {
  const cached = await getContactsCached(privkeyHex, pubkeyHex).catch(() => null);
  return findContactByPubkey(cached?.items || [], peerPubkey);
}

/**
 * One-tap save for a DM peer: name + pubkey now, email/phone/fields later from
 * the Contacts screen. Returns the existing contact instead of duplicating.
 */
export async function addPeerContact(privkeyHex, pubkeyHex, { pubkey, name } = {}) {
  const peer = normalizePubkey(pubkey);
  if (!peer) throw new Error("Invalid contact key.");
  const cached = await getContactsCached(privkeyHex, pubkeyHex).catch(() => null);
  const existing = findContactByPubkey(cached?.items || [], peer);
  if (existing) return existing;
  return saveContact(
    privkeyHex,
    pubkeyHex,
    { name: String(name || "").trim(), pubkey: peer, tags: ["dm"] },
    { existingItems: cached?.items || [] },
  );
}

/** Renew a live contact (same id, new expiry, prevEventId chain). */
export async function renewContact(privkeyHex, pubkeyHex, item) {
  if (!item?.id) throw new Error("Invalid contact.");
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
  return publishContactEvent(privkeyHex, pubkeyHex, payload, STREAM_EXPIRY_SECONDS);
}

/** Delete via never-renewed tombstone (no Kind 5). */
export async function deleteContact(privkeyHex, pubkeyHex, item) {
  if (!item?.id) throw new Error("Invalid contact.");
  const now = Date.now();
  const payload = {
    v: 1,
    id: item.id,
    deleted: true,
    createdAt: item.createdAt || now,
    updatedAt: now,
    prevEventId: item.eventId || null,
  };
  const result = await publishContactEvent(
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
export async function renewExpiringContacts(privkeyHex, pubkeyHex, items, opts = {}) {
  return renewStreamItems(items, (item) => renewContact(privkeyHex, pubkeyHex, item), opts);
}
