import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent, normalizePubkey } from "./crypto.js";
import { aesDecrypt, aesEncrypt } from "./crypto.js";
import { publishLocal } from "./engine/index.js";
import { fetchEvent, verifyEvent } from "./rabta/index.js";
import { dedupeRelays, getKnownRelays } from "./relay/index.js";
import { decodeInviteRelays, encodeInviteRelays } from "./relayInvite.js";

export const TEMP_INVITE_COLLECTION = "gupt/invites";
export const TEMP_INVITE_TYPE = "match:lobby";

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
    ? `match:lobby:${eventId}:${keyHex}:${encoded}`
    : `match:lobby:${eventId}:${keyHex}`;
}

export function parseTempInvite(rawId, rawKey, rawRelays) {
  const eventId = String(rawId || "").toLowerCase();
  const keyHex = String(rawKey || "").toLowerCase();
  if (!HEX_RE.test(eventId) || !HEX_RE.test(keyHex)) {
    throw new Error("This lobby code is invalid.");
  }
  return { eventId, keyHex, relays: decodeInviteRelays(rawRelays) };
}

/**
 * Match lobby parser: parses match:lobby:<eventId>:<keyHex>[:<relays>]
 * Returns { eventId, keyHex, relays } or null if input is not a match lobby code.
 * Strictly requires the match:lobby prefix with NO fallback.
 */
export function parseInviteInput(input) {
  const str = String(input || "").trim();
  if (!str) return null;

  // Strictly extracts match:lobby:<eventId>:<keyHex>[:<relays>] whether pasted bare or inside a game invite message
  const match = str.match(
    /\bmatch[:_-]lobby[:_-]([0-9a-fA-F]{64})[:/_-]([0-9a-fA-F]{64})(?:[:/_-]([a-zA-Z0-9_-]+))?\b/i,
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
    v: 2,
    type: TEMP_INVITE_TYPE,
    player_id: pubkey,
    gamertag: String(name || "").slice(0, 80),
    regions: relays,
    createdAt: Date.now(),
    expiresAt: expiresAtMs,
  };
  const encrypted = await aesEncrypt(keyBytes, JSON.stringify(payload));

  const event = finalizeEvent(
    {
      collection: TEMP_INVITE_COLLECTION,
      labels: ["match_lobby"],
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
 * Fetches a temporary match lobby invite, verifies its signature and expiry, and decrypts
 * the inviter's identity with the key carried in the lobby code.
 */
export async function openTempInvite({ eventId, keyHex, relays = [] }) {
  if (!HEX_RE.test(eventId) || !HEX_RE.test(keyHex)) {
    throw new Error("This lobby code is invalid.");
  }

  const targets = dedupeRelays([...relays, ...getKnownRelays()]).slice(0, 8);
  const results = await Promise.allSettled(
    targets.map((relay) => fetchEvent(eventId, [relay], 6000)),
  );
  const event = results.find((result) => result.status === "fulfilled" && result.value)?.value;
  if (!event) throw new Error("This match lobby could not be found. It may have expired.");
  if (!verifyEvent(event)) throw new Error("This match lobby could not be verified.");
  if (String(event.collection || "").toLowerCase() !== TEMP_INVITE_COLLECTION) {
    throw new Error("This match lobby could not be verified.");
  }

  const expiresAt = Number(event.expires_at) * 1000;
  if (!expiresAt || expiresAt <= Date.now()) {
    throw new Error("This match lobby has expired.");
  }

  let payload;
  try {
    payload = JSON.parse(await aesDecrypt(hexToBytes(keyHex), event.data));
  } catch {
    throw new Error("This lobby code is invalid.");
  }

  const owner = normalizePubkey(event.owner);
  const inviter = normalizePubkey(payload?.player_id);
  if (
    !owner ||
    !inviter ||
    owner !== inviter ||
    payload?.v !== 2 ||
    payload?.type !== TEMP_INVITE_TYPE
  ) {
    throw new Error("This lobby code is invalid.");
  }

  return {
    eventId: event.id,
    expiresAt,
    profile: {
      pubkey: inviter,
      name: payload.gamertag || "",
      relays: Array.isArray(payload.regions) ? payload.regions : [],
    },
  };
}
