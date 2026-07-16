import {
  normalizeNostrPubkey,
  generateKeypair,
  encryptDm,
  decryptDm,
  finalizeEvent,
} from "@/lib/crypto";
import { publicAppBaseUrl } from "@/lib/runtime";
import { publishToRelays, query, getKnownRelays } from "@/lib/relay";
import { hexToBytes } from "@noble/hashes/utils.js";
import * as secp from "@noble/secp256k1";

export const INVITE_TTL_OPTIONS = [
  { id: "1h", label: "1 hour", hours: 1 },
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 24 * 7 },
];

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

export function buildInviteUrl(inviteToken) {
  return `${publicAppBaseUrl()}/#/invite/${encodeURIComponent(inviteToken)}`;
}

export function formatInviteExpiry(expiresAtSec) {
  if (!expiresAtSec) return "never";
  const ms = expiresAtSec * 1000;
  const diff = ms - Date.now();
  if (diff <= 0) return "expired";

  const hours = Math.floor(diff / 1000 / 3600);
  if (hours > 24) {
    return `${Math.floor(hours / 24)} days`;
  }
  return `${Math.max(1, hours)} hours`;
}

export async function createTempInvite(identity, { displayName = "", ttlHours = 24 * 7 } = {}) {
  // 1. Generate temp keypair
  const tempKeys = generateKeypair();

  // 2. Prepare payload
  const payload = JSON.stringify({
    p: identity.pubkeyHex,
    n: displayName || identity.profileName || "Unknown",
  });

  // 3. Encrypt payload to self (TempPub)
  const ciphertext = await encryptDm(tempKeys.privkeyHex, tempKeys.pubkeyHex, payload);

  // 4. Create Kind 1 event
  const expiresAt = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const eventTemplate = {
    kind: 1, // Public Note
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["expiration", String(expiresAt)],
      ["gupt_invite", ciphertext],
    ],
    content:
      "This private invite was securely shared end-to-end encrypted using Gupt. Protect your privacy at https://github.com/besoeasy/gupt",
  };

  // Sign event with TempPriv
  const event = finalizeEvent(eventTemplate, hexToBytes(tempKeys.privkeyHex));

  // 5. Publish to relays
  await publishToRelays(getKnownRelays(), event);

  return {
    inviteToken: tempKeys.privkeyHex, // Share private key in URL
    inviteUrl: buildInviteUrl(tempKeys.privkeyHex),
    expiresAt: expiresAt, // in seconds
  };
}

export async function resolveTempInvite(rawToken) {
  const token = String(rawToken || "").trim();

  // Backwards compatibility for old invite links
  if (!token.match(/^[0-9a-f]{64}$/i)) {
    try {
      const json = fromUrlSafeBlob(decodeURIComponent(token));
      const payload = JSON.parse(json);
      if (!payload.p) throw new Error();
      return {
        pubkeyHex: normalizeNostrPubkey(payload.p),
        displayName: payload.n || "Unknown",
      };
    } catch {
      throw new Error("Invalid invite link format.");
    }
  }

  // It's a hex string. Is it a raw pubkey or a temp privkey?
  // Let's assume it's a temp privkey, derive pubkey and query for the event.
  let tempPubkey;
  try {
    tempPubkey = generateKeypairFromPrivkey(token);
  } catch {
    // If it's just a raw pubkey being passed, fallback
    const hex = normalizeNostrPubkey(token);
    if (hex) return { pubkeyHex: hex, displayName: "Unknown" };
    throw new Error("Invalid invite key.");
  }

  const events = await query({
    kinds: [1, 4], // 1 for new invites, 4 for backwards compatibility with the previous flow
    authors: [tempPubkey],
    limit: 1,
  });

  if (!events || events.length === 0) {
    throw new Error("Invite not found or has expired.");
  }

  const event = events[0];
  try {
    let ciphertext = event.content;
    if (event.kind === 1) {
      const inviteTag = event.tags.find((t) => t[0] === "gupt_invite");
      if (inviteTag) ciphertext = inviteTag[1];
    }

    const plaintext = await decryptDm(token, tempPubkey, ciphertext);
    const payload = JSON.parse(plaintext);

    // Extract expiration from event tags
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

function generateKeypairFromPrivkey(privkeyHex) {
  const privkey = hexToBytes(privkeyHex);
  return secp.etc.bytesToHex(secp.schnorr.getPublicKey(privkey));
}

export async function revokeTempInvite(identity, eventId) {
  // Can't easily revoke since we don't have the temp privkey anymore, but it auto-expires.
}
