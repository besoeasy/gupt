import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent, normalizeNostrPubkey } from "./crypto.js";
import { aesDecrypt, aesEncrypt } from "./crypto.js";
import { publishLocal } from "./engine";
import { fetchEvent, verifyEvent } from "./rabta/index.js";
import { dedupeRelays, getKnownRelays } from "@/lib/relay";
import { decodeInviteRelays, encodeInviteRelays } from "./relayInvite";
import { publicAppBaseUrl } from "./runtime";

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

export function buildTempInviteUrl(eventId, keyHex, relays = []) {
  const base = `${publicAppBaseUrl()}/#/inin/${eventId}/${keyHex}`;
  const encoded = encodeInviteRelays(relays);
  return encoded ? `${base}/${encoded}` : base;
}

export function parseTempInvite(rawId, rawKey, rawRelays) {
  const eventId = String(rawId || "").toLowerCase();
  const keyHex = String(rawKey || "").toLowerCase();
  if (!HEX_RE.test(eventId) || !HEX_RE.test(keyHex)) {
    throw new Error("This invite link is invalid.");
  }
  return { eventId, keyHex, relays: decodeInviteRelays(rawRelays) };
}

/**
 * Encrypts the inviter's identity and relay set under a one-off key, then
 * publishes a signed event that relays can drop at `expiresAt`.
 */
export async function publishTempInvite({ privkeyHex, pubkeyHex, name, seconds }) {
  const pubkey = normalizeNostrPubkey(pubkeyHex);
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
      kind: 1,
      tags: [
        ["t", "gupt_invite"],
        ["expiration", String(expiresAt)],
      ],
      content: "Temporary invite : https://github.com/besoeasy/gupt",
    },
    hexToBytes(privkeyHex),
  );

  await publishLocal(event, { origin: "invites" });

  return {
    eventId: event.id,
    keyHex,
    url: buildTempInviteUrl(event.id, keyHex, relays),
    expiresAt: expiresAtMs,
    payload,
  };
}

/**
 * Fetches a temporary invite, verifies its signature and expiry, and decrypts
 * the inviter's identity with the key carried in the link.
 */
export async function openTempInvite({ eventId, keyHex, relays = [] }) {
  if (!HEX_RE.test(eventId) || !HEX_RE.test(keyHex)) {
    throw new Error("This invite link is invalid.");
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
    throw new Error("This invite link is invalid.");
  }

  const owner = normalizeNostrPubkey(event.owner);
  const inviter = normalizeNostrPubkey(payload?.pubkey);
  if (
    !owner ||
    !inviter ||
    owner !== inviter ||
    payload?.v !== 1 ||
    payload?.type !== TEMP_INVITE_TYPE
  ) {
    throw new Error("This invite link is invalid.");
  }

  return {
    eventId: event.id,
    expiresAt,
    profile: {
      pubkey: inviter,
      name: String(payload.name || "").slice(0, 80),
      relays: dedupeRelays(Array.isArray(payload.relays) ? payload.relays : []),
    },
  };
}
