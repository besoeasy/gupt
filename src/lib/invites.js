import { hexToBytes } from "@noble/hashes/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { finalizeEvent } from "nostr-tools/pure";

import { initRelays, publishEventToRelays, queryNostrEvents } from "@/lib/api";
import { aesDecrypt, aesEncrypt, normalizeNostrPubkey } from "@/lib/crypto";

function sha256Hex(value) {
  const bytes = nobleSha256(new TextEncoder().encode(value));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Parameterized replaceable kind for short-lived DM invites (NIP-33 range). */
export const INVITE_KIND = 30520;
export const INVITE_CLIENT_TAG = "gupt";
const INVITE_CACHE_KEY = "gupt_invite_cache_v1";

const INVITE_KDF_INFO = "gupt-invite-v1";

export const INVITE_TTL_OPTIONS = [
  { id: "1h", label: "1 hour", hours: 1 },
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 24 * 7 },
];

function signedEvent(privkeyHex, template) {
  return finalizeEvent(template, hexToBytes(privkeyHex));
}

function randomInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function inviteLookupId(inviteCode) {
  return sha256Hex(String(inviteCode || "").trim());
}

function inviteKeyBytes(inviteCode) {
  return hkdf(
    nobleSha256,
    new TextEncoder().encode(String(inviteCode || "").trim()),
    undefined,
    new TextEncoder().encode(INVITE_KDF_INFO),
    32,
  );
}

function toUrlSafeBlob(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromUrlSafeBlob(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(normalized + pad);
}

function buildInviteToken(inviteCode, encryptedContent) {
  return `${inviteCode}.${toUrlSafeBlob(encryptedContent)}`;
}

export function parseInviteToken(rawToken) {
  const token = decodeURIComponent(String(rawToken || "").trim());
  const dot = token.indexOf(".");
  if (dot <= 0) {
    return { inviteCode: token, encryptedContent: null, token };
  }
  return {
    inviteCode: token.slice(0, dot),
    encryptedContent: fromUrlSafeBlob(token.slice(dot + 1)),
    token,
  };
}

function parseExpirationTag(event) {
  const tag = event?.tags?.find(([name]) => name === "expiration");
  if (!tag?.[1]) return null;
  const value = Number(tag[1]);
  return Number.isFinite(value) ? value : null;
}

function isExpiredAt(expiresAtSec, nowSec = Math.floor(Date.now() / 1000)) {
  return expiresAtSec !== null && expiresAtSec <= nowSec;
}

function isExpiredEvent(event, nowSec = Math.floor(Date.now() / 1000)) {
  return isExpiredAt(parseExpirationTag(event), nowSec);
}

function readInviteCache() {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(INVITE_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeInviteCache(map) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(INVITE_CACHE_KEY, JSON.stringify(map));
}

function cacheInviteLocally(entry) {
  const map = readInviteCache();
  map[entry.lookupId] = entry;
  writeInviteCache(map);
}

function getCachedInvite(lookupId) {
  const entry = readInviteCache()[lookupId];
  if (!entry) return null;
  if (isExpiredAt(entry.expiresAt)) {
    const map = readInviteCache();
    delete map[lookupId];
    writeInviteCache(map);
    return null;
  }
  return entry;
}

async function decryptInvitePayload(inviteCode, encryptedContent) {
  const plain = await aesDecrypt(inviteKeyBytes(inviteCode), encryptedContent);
  const payload = JSON.parse(plain);
  const pubkeyHex = normalizeNostrPubkey(payload?.p);
  if (!pubkeyHex) throw new Error("Invite payload is missing a public key.");
  const expiresAt = Number(payload?.e) || null;
  if (isExpiredAt(expiresAt)) {
    throw new Error("This invite has expired.");
  }
  return {
    pubkeyHex,
    displayName: String(payload?.n || "").trim(),
    expiresAt,
  };
}

const PUBLIC_INVITE_ORIGIN = "https://gupt.app";

function inviteLinkBase() {
  if (typeof window === "undefined") return PUBLIC_INVITE_ORIGIN;
  if (window.location.protocol === "http:") return PUBLIC_INVITE_ORIGIN;
  return `${window.location.origin}${window.location.pathname}`;
}

export function buildInviteUrl(inviteToken) {
  return `${inviteLinkBase().replace(/\/$/, "")}/#/invite/${encodeURIComponent(inviteToken)}`;
}

export function formatInviteExpiry(expiresAtSec) {
  const diffMs = expiresAtSec * 1000 - Date.now();
  if (diffMs <= 0) return "expired";
  const mins = Math.ceil(diffMs / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.ceil(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

async function publishInviteEvent(identity, { inviteCode, lookupId, expiresAt, content }) {
  const event = signedEvent(identity.privkeyHex, {
    kind: INVITE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", lookupId],
      ["expiration", String(expiresAt)],
      ["client", INVITE_CLIENT_TAG],
      ["single", "1"],
    ],
    content,
  });

  await publishEventToRelays(null, event);
  return event;
}

/**
 * Create a self-contained temporary invite.
 * The URL carries an encrypted payload so redemption works even when relay
 * queries fail (localhost, offline, or restrictive networks).
 */
export async function createTempInvite(identity, { ttlHours = 24, displayName = "" } = {}) {
  const privkeyHex = identity?.privkeyHex;
  const pubkeyHex = normalizeNostrPubkey(identity?.pubkeyHex);
  if (!privkeyHex || !pubkeyHex) throw new Error("Identity is not ready.");

  const hours = Math.max(1, Math.min(24 * 30, Number(ttlHours) || 24));
  const inviteCode = randomInviteCode();
  const lookupId = inviteLookupId(inviteCode);
  const expiresAt = Math.floor(Date.now() / 1000) + hours * 3600;

  const payload = JSON.stringify({
    v: 1,
    p: pubkeyHex,
    n: String(displayName || identity?.profileName || "").trim(),
    e: expiresAt,
  });
  const encryptedContent = await aesEncrypt(inviteKeyBytes(inviteCode), payload);
  const inviteToken = buildInviteToken(inviteCode, encryptedContent);

  cacheInviteLocally({
    lookupId,
    inviteCode,
    inviteToken,
    encryptedContent,
    expiresAt,
    eventId: null,
  });

  try {
    await initRelays();
    const event = await publishInviteEvent(identity, {
      inviteCode,
      lookupId,
      expiresAt,
      content: encryptedContent,
    });
    cacheInviteLocally({
      lookupId,
      inviteCode,
      inviteToken,
      encryptedContent,
      expiresAt,
      eventId: event.id,
    });
  } catch {
    // Relay publish is optional once the URL contains the encrypted payload.
  }

  return {
    inviteCode: inviteToken,
    inviteToken,
    inviteUrl: buildInviteUrl(inviteToken),
    expiresAt,
    lookupId,
  };
}

async function resolveFromEncryptedContent(inviteCode, encryptedContent, authorPubkey = null) {
  const resolved = await decryptInvitePayload(inviteCode, encryptedContent);
  if (authorPubkey && resolved.pubkeyHex !== normalizeNostrPubkey(authorPubkey)) {
    throw new Error("Invite signature does not match its payload.");
  }
  return {
    ...resolved,
    eventId: null,
    authorPubkey: resolved.pubkeyHex,
  };
}

async function resolveFromRelay(inviteCode) {
  const lookupId = inviteLookupId(inviteCode);
  await initRelays();

  const events = await queryNostrEvents(
    { kinds: [INVITE_KIND], "#d": [lookupId], limit: 10 },
    8000,
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const event = events
    .filter((entry) => entry.kind === INVITE_KIND)
    .filter((entry) => entry.tags?.some(([name, value]) => name === "d" && value === lookupId))
    .filter((entry) => !isExpiredEvent(entry, nowSec))
    .sort((a, b) => b.created_at - a.created_at)[0];

  if (!event) return null;

  const resolved = await resolveFromEncryptedContent(inviteCode, event.content, event.pubkey);
  return {
    ...resolved,
    eventId: event.id,
    authorPubkey: resolved.pubkeyHex,
  };
}

/**
 * Resolve an invite token from the URL, local cache, or Nostr relays.
 */
export async function resolveTempInvite(rawToken) {
  const { inviteCode, encryptedContent } = parseInviteToken(rawToken);
  if (!inviteCode) throw new Error("Invite link is missing its code.");

  if (encryptedContent) {
    return resolveFromEncryptedContent(inviteCode, encryptedContent);
  }

  const cached = getCachedInvite(inviteLookupId(inviteCode));
  if (cached?.encryptedContent) {
    return resolveFromEncryptedContent(cached.inviteCode, cached.encryptedContent);
  }

  const relayResolved = await resolveFromRelay(inviteCode);
  if (relayResolved) return relayResolved;

  throw new Error("This invite is invalid, expired, or has already been used.");
}

/** Best-effort single-use cleanup via NIP-09 deletion request. */
export async function revokeTempInvite(identity, eventId) {
  const privkeyHex = identity?.privkeyHex;
  const id = String(eventId || "").trim();
  if (!privkeyHex || !id) return;

  try {
    await initRelays();
    const deletion = signedEvent(privkeyHex, {
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", id]],
      content: "invite redeemed",
    });
    await publishEventToRelays(null, deletion);
  } catch {
    // Revocation is best-effort; expiry still limits replay.
  }
}
