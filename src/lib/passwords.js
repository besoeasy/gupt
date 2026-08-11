import { finalizeEvent } from "./crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { encryptDm, decryptDm, normalizeNostrPubkey } from "./crypto.js";
import { publishToRelays, query } from "./relay";
import { putRawEvent, getRawEventsByOrigin, deleteRawEvent } from "./idb";
import {
  normalizeBookmarkUrl,
  bookmarkHostname,
  normalizeBookmarkTags,
  parseBookmarkTagsInput,
} from "./bookmarks.js";
import { renewStreamItems, isUrgentExpiry } from "./streamRenewal.js";

const PASSWORD_KIND = 1;
const PASSWORD_TAG = "gupt_password";

export const PASSWORD_EXPIRY_SECONDS = 3 * 365 * 24 * 60 * 60;
export const PASSWORD_DELETE_EXPIRY_SECONDS = 10 * 365 * 24 * 60 * 60;

export const normalizePasswordUri = normalizeBookmarkUrl;
export const passwordHostname = bookmarkHostname;
export const normalizePasswordTags = normalizeBookmarkTags;
export const parsePasswordTagsInput = parseBookmarkTagsInput;

function newId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Normalize and dedupe URI list; primary is uris[0]. */
export function normalizePasswordUris(uris) {
  if (!Array.isArray(uris)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of uris) {
    const n = normalizePasswordUri(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Strip spaces/padding; keep Base32 alphabet uppercase. */
export function normalizeTotpSecret(raw) {
  const cleaned = String(raw || "")
    .replace(/\s+/g, "")
    .replace(/=+$/g, "")
    .toUpperCase();
  if (!cleaned) return "";
  if (!/^[A-Z2-7]+$/.test(cleaned)) return "";
  return cleaned;
}

function base32Decode(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret) {
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

/** Generate a 6-digit TOTP code (SHA-1, 30s). */
export async function generateTotpCode(secret, now = Date.now()) {
  const normalized = normalizeTotpSecret(secret);
  if (!normalized) return "";
  const keyBytes = base32Decode(normalized);
  if (!keyBytes.length) return "";

  const period = 30;
  const counter = Math.floor(Math.floor(now / 1000) / period);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // Write 64-bit big-endian counter (high bits unused for practical values)
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buf));
  const offset = sig[sig.length - 1] & 0xf;
  const bin =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

export function totpSecondsRemaining(now = Date.now()) {
  return 30 - (Math.floor(now / 1000) % 30);
}

function resolveTitle(title, uris) {
  const t = String(title || "").trim();
  if (t) return t;
  const primary = uris[0];
  if (primary) return passwordHostname(primary) || "Password";
  return "Password";
}

function sanitizeLiveFields({ title, username, email, password, uris, totp, notes, tags }) {
  const resolvedUris = normalizePasswordUris(uris);
  const resolvedPassword = String(password || "");
  if (!resolvedPassword) throw new Error("Password is required.");

  const totpRaw = String(totp || "").trim();
  const resolvedTotp = normalizeTotpSecret(totpRaw);
  if (totpRaw && !resolvedTotp) {
    throw new Error("Invalid TOTP secret — use a Base32 secret (A–Z, 2–7).");
  }

  return {
    title: resolveTitle(title, resolvedUris),
    username: String(username || "").trim(),
    email: String(email || "").trim(),
    password: resolvedPassword,
    uris: resolvedUris,
    totp: resolvedTotp,
    notes: String(notes || "").trim(),
    tags: normalizePasswordTags(tags),
  };
}

async function publishPasswordEvent(privkeyHex, pubkeyHex, payload, expirySeconds) {
  const encryptedPayload = await encryptDm(privkeyHex, pubkeyHex, JSON.stringify(payload));
  const expiryTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;
  const event = finalizeEvent(
    {
      kind: PASSWORD_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", pubkeyHex],
        ["t", PASSWORD_TAG],
        [PASSWORD_TAG, encryptedPayload],
        ["expiration", String(expiryTimestamp)],
      ],
      content: "Password : https://github.com/besoeasy/gupt",
    },
    hexToBytes(privkeyHex),
  );

  const publishResponse = await publishToRelays([], event);
  const anyOk = Object.values(publishResponse).some((r) => r.ok);
  if (!anyOk) throw new Error("Failed to publish password to relays.");

  void putRawEvent(event, "passwords").catch(() => {});
  return {
    ...payload,
    eventId: event.id,
    expiresAt: expiryTimestamp * 1000,
  };
}

async function decryptPasswordEvents(privkeyHex, pubkeyHex, events) {
  const items = [];
  for (const event of events) {
    const encrypted = event.tags?.find((t) => t[0] === PASSWORD_TAG)?.[1];
    if (!encrypted) continue;
    try {
      const plaintext = await decryptDm(privkeyHex, pubkeyHex, encrypted);
      const item = JSON.parse(plaintext);
      if (!item?.id) continue;
      item.eventId = event.id;
      if (!item.deleted) {
        item.uris = normalizePasswordUris(item.uris);
        item.tags = normalizePasswordTags(item.tags);
        item.totp = normalizeTotpSecret(item.totp);
        item.username = String(item.username || "");
        item.email = String(item.email || "");
        item.notes = String(item.notes || "");
        item.password = String(item.password || "");
        item.title = String(item.title || resolveTitle("", item.uris));
      }
      const expiryTag = event.tags?.find((t) => t[0] === "expiration");
      if (expiryTag) {
        item.expiresAt = Number(expiryTag[1]) * 1000;
        if (item.expiresAt < Date.now()) continue;
      }
      items.push(item);
    } catch (err) {
      console.warn("Failed to decrypt a password", err);
    }
  }
  return items;
}

/** Collapse stream: tombstone wins; else newest live by updatedAt. */
export function reducePasswords(items) {
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

export async function getPasswordsCached(privkeyHex, pubkeyHex) {
  const rows = await getRawEventsByOrigin("passwords").catch(() => []);
  if (!rows.length) return null;
  const events = rows.map((r) => r.event);
  const decrypted = await decryptPasswordEvents(privkeyHex, pubkeyHex, events);
  return { items: reducePasswords(decrypted), fresh: false };
}

export async function fetchPasswords(privkeyHex, pubkeyHex) {
  const pubkey = normalizeNostrPubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid pubkey");

  const events = await query(
    [
      {
        kinds: [PASSWORD_KIND],
        authors: [pubkey],
        "#p": [pubkey],
        "#t": [PASSWORD_TAG],
      },
    ],
    5000,
  );

  const passwordEvents = events.filter((e) => e.kind === PASSWORD_KIND);
  for (const event of passwordEvents) {
    void putRawEvent(event, "passwords").catch(() => {});
  }

  const decrypted = await decryptPasswordEvents(privkeyHex, pubkeyHex, passwordEvents);
  return reducePasswords(decrypted);
}

/**
 * Create or update a password entry. Pass `id` to update an existing item.
 * Tags / secrets stay inside ciphertext only.
 */
export async function savePassword(
  privkeyHex,
  pubkeyHex,
  fields,
  { id, existingItems } = {},
) {
  const items = existingItems || (await fetchPasswords(privkeyHex, pubkeyHex));
  const existing = id ? items.find((p) => p.id === id) : null;
  if (id && !existing) throw new Error("Password not found.");

  const now = Date.now();
  const live = sanitizeLiveFields({
    title: fields.title,
    username: fields.username !== undefined ? fields.username : existing?.username,
    email: fields.email !== undefined ? fields.email : existing?.email,
    password: fields.password !== undefined ? fields.password : existing?.password,
    uris: fields.uris !== undefined ? fields.uris : existing?.uris,
    totp: fields.totp !== undefined ? fields.totp : existing?.totp,
    notes: fields.notes !== undefined ? fields.notes : existing?.notes,
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
  return publishPasswordEvent(privkeyHex, pubkeyHex, payload, PASSWORD_EXPIRY_SECONDS);
}

/** Renew a live password (same id, new expiry, prevEventId chain). */
export async function renewPassword(privkeyHex, pubkeyHex, item) {
  if (!item?.id || !item?.password) throw new Error("Invalid password entry.");
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
  return publishPasswordEvent(privkeyHex, pubkeyHex, payload, PASSWORD_EXPIRY_SECONDS);
}

/** Delete via never-renewed tombstone (no Kind 5). */
export async function deletePassword(privkeyHex, pubkeyHex, item) {
  if (!item?.id) throw new Error("Invalid password entry.");
  const now = Date.now();
  const payload = {
    v: 1,
    id: item.id,
    deleted: true,
    createdAt: item.createdAt || now,
    updatedAt: now,
    prevEventId: item.eventId || null,
  };
  const result = await publishPasswordEvent(
    privkeyHex,
    pubkeyHex,
    payload,
    PASSWORD_DELETE_EXPIRY_SECONDS,
  );
  if (item.eventId) {
    await deleteRawEvent(item.eventId).catch(() => {});
  }
  return result;
}

export function needsRenewal(item, now = Date.now()) {
  return isUrgentExpiry(item, now);
}

/** Renew on /passwords load: urgent near-expiry items, else 50% oldest. */
export async function renewExpiringPasswords(privkeyHex, pubkeyHex, items) {
  return renewStreamItems(items, (item) => renewPassword(privkeyHex, pubkeyHex, item));
}
