import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";

import {
  normalizeNostrPubkey,
  generateKeypair,
  aesEncrypt,
  aesDecrypt,
  finalizeEvent,
} from "@/lib/crypto";
import { publicAppBaseUrl } from "@/lib/runtime";
import {
  publishToRelays,
  queryMany,
  getKnownRelays,
  dedupeRelays,
  addHintRelay,
  QUERY_TIMEOUT_MS,
} from "@/lib/relay";
import { putRawEvent } from "@/lib/idb";

export const INVITE_TTL_OPTIONS = [
  { id: "1h", label: "1 hour", hours: 1 },
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 24 * 7 },
];

const INVITE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const INVITE_TOKEN_LENGTH = 12;
const TOKEN_RE = /^[A-Za-z0-9]{8,24}$/;
const KEY_CONTEXT = "gupt-invite-v1";
const REVOKE_TAG = "gupt_invite_revoked";
const MAX_INVITE_RELAY_HINTS = 3;

export function buildInviteUrl(inviteToken, inviteRelays = []) {
  const relays = dedupeRelays(inviteRelays).slice(0, MAX_INVITE_RELAY_HINTS);
  const base = `${publicAppBaseUrl()}/#/invite/${encodeURIComponent(inviteToken)}`;
  if (!relays.length) return base;
  return `${base}?r=${encodeURIComponent(relays.join(","))}`;
}

export function decodeInviteRelays(raw) {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const urls = [];
  for (const value of values) {
    let text = String(value ?? "").trim();
    if (text.includes("%")) {
      try {
        text = decodeURIComponent(text);
      } catch {}
    }
    if (text) urls.push(...text.split(","));
  }
  return dedupeRelays(urls);
}

export function formatInviteExpiry(expiresAtSec) {
  if (!expiresAtSec) return "never";
  const ms = expiresAtSec * 1000;
  const diff = ms - Date.now();
  if (diff <= 0) return "expired";

  const hours = Math.round(diff / 1000 / 3600);
  if (hours > 24) {
    return `${Math.round(hours / 24)} days`;
  }
  return `${Math.max(1, hours)} hours`;
}

export function generateInviteToken(length = INVITE_TOKEN_LENGTH) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let token = "";
  for (const b of bytes) token += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
  return token;
}

function inviteKey(token) {
  return sha256(new TextEncoder().encode(`${KEY_CONTEXT}:${token}`));
}

export async function createTempInvite(identity, { displayName = "", ttlHours = 24 * 7 } = {}) {
  const token = generateInviteToken();

  const payload = JSON.stringify({
    v: 1,
    p: identity.pubkeyHex,
    n: displayName || identity.profileName || "Unknown",
  });

  const ciphertext = await aesEncrypt(inviteKey(token), payload);

  const expiresAt = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["expiration", String(expiresAt)],
      ["t", `gupt_invite_${token}`],
      ["gupt_invite", ciphertext],
    ],
    content:
      "This private invite was securely shared end-to-end encrypted using Gupt. Protect your privacy at https://github.com/besoeasy/gupt",
  };

  // The ephemeral key is used to sign the event only and is then discarded, so
  // nobody — not even the URL holder — can sign new events as this identity.
  const ephemeral = generateKeypair();
  const event = finalizeEvent(eventTemplate, hexToBytes(ephemeral.privkeyHex));

  // Record which relays ack the publish so the invite URL can carry them; the
  // resolver then finds the event even on relays it has not configured.
  const targets = getKnownRelays();
  const response = await publishToRelays(targets, event);
  const relays = Object.keys(response)
    .filter((url) => response[url]?.ok)
    .slice(0, MAX_INVITE_RELAY_HINTS);

  return {
    inviteToken: token,
    inviteUrl: buildInviteUrl(token, relays),
    relays,
    expiresAt: expiresAt,
  };
}

export async function revokeTempInvite(token, { expiresAt = 0, relays = [] } = {}) {
  const expiration = expiresAt || Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["expiration", String(expiration)],
      ["t", `gupt_invite_${token}`],
      [REVOKE_TAG, ""],
    ],
    content: "",
  };

  // The tombstone must land on the same relays the invite lives on, otherwise
  // the resolver's "newest wins" logic cannot reject it. Sign with a fresh
  // ephemeral key (then discarded) so the resolving party's identity stays
  // hidden on relays.
  const ephemeral = generateKeypair();
  const event = finalizeEvent(eventTemplate, hexToBytes(ephemeral.privkeyHex));

  await publishToRelays(dedupeRelays([...getKnownRelays(), ...relays]), event);
  return event;
}

export async function resolveTempInvite(rawToken, inviteRelays = []) {
  const token = String(rawToken || "").trim();
  const relays = decodeInviteRelays(inviteRelays);

  if (!token) throw new Error("Invite link is missing its code.");
  if (!TOKEN_RE.test(token)) throw new Error("Invalid invite link format.");
  return resolveTokenInvite(token, relays);
}

async function resolveTokenInvite(token, inviteRelays = []) {
  const events = await queryMany(
    [{ kinds: [1], "#t": [`gupt_invite_${token}`], limit: 10 }],
    QUERY_TIMEOUT_MS,
    inviteRelays,
  );

  const now = Math.floor(Date.now() / 1000);
  const valid = (events || [])
    .filter((e) => !e.tags?.some((t) => t[0] === "expiration" && Number(t[1]) < now))
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

  const event = valid[0];
  if (!event) throw new Error("Invite not found or has expired.");
  if (event.tags?.some((t) => t[0] === REVOKE_TAG)) {
    throw new Error("Invite has already been used.");
  }

  for (const relay of inviteRelays) addHintRelay(relay);

  void putRawEvent(event, "invite").catch(() => {});
  try {
    const inviteTag = event.tags.find((t) => t[0] === "gupt_invite");
    if (!inviteTag) throw new Error("missing tag");

    const plaintext = await aesDecrypt(inviteKey(token), inviteTag[1]);
    const payload = JSON.parse(plaintext);

    const expiryTag = event.tags.find((t) => t[0] === "expiration");
    const expiresAt = expiryTag ? Number(expiryTag[1]) : null;

    return {
      pubkeyHex: normalizeNostrPubkey(payload.p),
      displayName: payload.n || "Unknown",
      eventId: event.id,
      expiresAt: expiresAt,
    };
  } catch (err) {
    throw new Error("Failed to decrypt invite.");
  }
}
