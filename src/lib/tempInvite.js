import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent, normalizePubkey } from "./crypto.js";
import { aesDecrypt, aesEncrypt } from "./crypto.js";
import { publishLocal } from "./engine/index.js";
import { fetchEvent, verifyEvent } from "./rabta/index.js";
import { dedupeRelays, getKnownRelays } from "./relay/index.js";
import { decodeInviteRelays, encodeInviteRelays } from "./relayInvite.js";

export const TEMP_INVITE_COLLECTION = "gupt/invites";
export const TEMP_INVITE_TYPE = "gupt:temp-invite";

const HEX_RE = /^[0-9a-f]{64}$/;

export const TEMP_INVITE_DURATIONS = [
  { id: "1h", label: "1 hour", seconds: 60 * 60 },
  { id: "4h", label: "4 hours", seconds: 4 * 60 * 60 },
  { id: "24h", label: "24 hours", seconds: 24 * 60 * 60 },
  { id: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { id: "30d", label: "30 days", seconds: 30 * 24 * 60 * 60 },
];

export function buildTempInviteString(eventId, keyHex, relays = []) {
  const encoded = encodeInviteRelays(relays);
  return encoded
    ? `gupt:invite:${eventId}:${keyHex}:${encoded}`
    : `gupt:invite:${eventId}:${keyHex}`;
}

export function parseTempInvite(rawId, rawKey, rawRelays) {
  const eventId = String(rawId || "").toLowerCase();
  const keyHex = String(rawKey || "").toLowerCase();
  if (!HEX_RE.test(eventId) || !HEX_RE.test(keyHex)) {
    throw new Error("This invite code is invalid.");
  }
  return { eventId, keyHex, relays: decodeInviteRelays(rawRelays) };
}

/**
 * Universal invite parser: handles string codes or delimited segments.
 * Returns { eventId, keyHex, relays } or null if input is not an invite.
 */
export function parseInviteInput(input) {
  const str = String(input || "").trim();
  if (!str) return null;

  // Matches gupt:invite:<eventId>:<keyHex>[:<relays>] or raw <eventId>:<keyHex>[:<relays>]
  const match = str.match(
    /^(?:gupt[:_-]invite[:_-])?([0-9a-fA-F]{64})[:/_-]([0-9a-fA-F]{64})(?:[:/_-]([a-zA-Z0-9_-]+))?$/i,
  );
  if (match) {
    return {
      eventId: match[1].toLowerCase(),
      keyHex: match[2].toLowerCase(),
      relays: decodeInviteRelays(match[3] || ""),
    };
  }

  return null;
}

/**
 * Encrypts the inviter's identity and relay set under a one-off key, then
 * publishes a signed event that relays can drop at `expiresAt`.
 */
export async function publishTempInvite({ privkeyHex, pubkeyHex, name, seconds }) {
  const pubkey = normalizePubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid identity.");

  const relays = getKnownRelays();
  const createdAt = Math.floor(Date.now() / 1000);
  const expiresAt = createdAt + Math.max(60, Number(seconds) || 0);
  const expiresAtMs = expiresAt * 1000;

  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const keyHex = bytesToHex(keyBytes);
  const payload = {
    v: 1,
    type: TEMP_INVITE_TYPE,
    pubkey,
    name: String(name || "").slice(0, 80),
    relays,
    createdAt: Date.now(),
    expiresAt: expiresAtMs,
  };
  const encrypted = await aesEncrypt(keyBytes, JSON.stringify(payload));

  const event = finalizeEvent(
    {
      collection: TEMP_INVITE_COLLECTION,
      labels: ["gupt_invite"],
      data: {
        v: 1,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
      },
      created_at: createdAt,
      expires_at: expiresAt,
    },
    privkeyHex,
  );

  await publishLocal(event, { origin: "invites" });

  return {
    eventId: event.id,
    keyHex,
    code: buildTempInviteString(event.id, keyHex, relays),
    expiresAt: expiresAtMs,
    payload,
  };
}

/**
 * Fetches a temporary invite, verifies its signature and expiry, and decrypts
 * the inviter's identity with the key carried in the invite code.
 */
export async function openTempInvite({ eventId, keyHex, relays = [] }) {
  if (!HEX_RE.test(eventId) || !HEX_RE.test(keyHex)) {
    throw new Error("This invite code is invalid.");
  }

  const targets = dedupeRelays([...relays, ...getKnownRelays()]).slice(0, 8);
  const results = await Promise.allSettled(
    targets.map((relay) => fetchEvent(eventId, [relay], 6000)),
  );
  const event = results.find((result) => result.status === "fulfilled" && result.value)?.value;
  if (!event) throw new Error("This invite could not be found. It may have expired.");
  if (!verifyEvent(event)) throw new Error("This invite could not be verified.");
  if (String(event.collection || "").toLowerCase() !== TEMP_INVITE_COLLECTION) {
    throw new Error("This invite could not be verified.");
  }

  const expiresAt = Number(event.expires_at) * 1000;
  if (!expiresAt || expiresAt <= Date.now()) {
    throw new Error("This invite has expired.");
  }

  let payload;
  try {
    payload = JSON.parse(await aesDecrypt(hexToBytes(keyHex), event.data));
  } catch {
    throw new Error("This invite code is invalid.");
  }

  const owner = normalizePubkey(event.owner);
  const inviter = normalizePubkey(payload?.pubkey);
  if (
    !owner ||
    !inviter ||
    owner !== inviter ||
    payload?.v !== 1 ||
    payload?.type !== TEMP_INVITE_TYPE
  ) {
    throw new Error("This invite code is invalid.");
  }

  return {
    eventId: event.id,
    expiresAt,
    profile: {
      pubkey: inviter,
      name: payload.name || "",
      relays: Array.isArray(payload.relays) ? payload.relays : [],
    },
  };
}
