import { gcm } from "@noble/ciphers/aes.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import * as secp from "@noble/secp256k1";
import { normalizeBitcoinAddress } from "./bitcoin.js";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, ...messages) => hmac(sha256, key, secp.etc.concatBytes(...messages));

export const DM_KIND = 4;
export const DM_TAG = "gupt-dm";
export const BOT_KIND = 1;
export const BOT_TAG = "gupt-bot";
export const PUBLIC_BOT_CONTENT = "GUPT bot : https://github.com/besoeasy/gupt";
export const PUBLIC_BOT_NAME_MAX = 80;
export const PUBLIC_BOT_ABOUT_MAX = 280;
export const PUBLIC_BOT_MAX_RELAY_TAGS = 8;
export const RETENTION_DAYS = 100;
export const MAX_EVENT_BYTES = 128 * 1024;
export const MAX_CONTENT_BYTES = 96 * 1024;

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function normalizeSecretHex(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!HEX_64.test(normalized)) throw new TypeError("secretHex must be 64 hexadecimal characters");
  const bytes = hexToBytes(normalized);
  if (!secp.utils.isValidSecretKey(bytes))
    throw new TypeError("secretHex is not a valid secp256k1 key");
  return normalized;
}

export function normalizePubkey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  const xOnly = /^(02|03)[0-9a-f]{64}$/.test(normalized) ? normalized.slice(2) : normalized;
  if (!HEX_64.test(xOnly)) throw new TypeError("pubkey must be 64 hexadecimal characters");
  return xOnly;
}

export function getPublicKey(secretHex) {
  return secp.etc.bytesToHex(secp.schnorr.getPublicKey(hexToBytes(normalizeSecretHex(secretHex))));
}

export function serializeEvent(event) {
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

export function computeEventId(event) {
  return secp.etc.bytesToHex(sha256(textEncoder.encode(serializeEvent(event))));
}

export function finalizeEvent(template, secretHex) {
  const secret = hexToBytes(normalizeSecretHex(secretHex));
  const event = {
    ...template,
    pubkey: secp.etc.bytesToHex(secp.schnorr.getPublicKey(secret)),
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
    tags: template.tags || [],
    content: template.content || "",
  };
  event.id = computeEventId(event);
  event.sig = secp.etc.bytesToHex(secp.schnorr.sign(hexToBytes(event.id), secret));
  return event;
}

export function verifyEventSignature(event) {
  try {
    if (!HEX_64.test(event?.id) || !HEX_64.test(event?.pubkey) || !HEX_128.test(event?.sig)) {
      return false;
    }
    if (computeEventId(event) !== event.id) return false;
    return secp.schnorr.verify(
      hexToBytes(event.sig),
      hexToBytes(event.id),
      hexToBytes(event.pubkey),
    );
  } catch {
    return false;
  }
}

export function assertDirectMessageEvent(event, recipientPubkey) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("Event must be an object");
  }
  if (event.kind !== DM_KIND) throw new TypeError("Unsupported event kind");
  if (!Number.isSafeInteger(event.created_at) || event.created_at <= 0) {
    throw new TypeError("Invalid event timestamp");
  }
  if (!HEX_64.test(event.id || "") || !HEX_64.test(event.pubkey || "")) {
    throw new TypeError("Invalid event identity");
  }
  if (!HEX_128.test(event.sig || "")) throw new TypeError("Invalid event signature");
  if (!Array.isArray(event.tags) || event.tags.length > 32) {
    throw new TypeError("Invalid event tags");
  }
  for (const tag of event.tags) {
    if (
      !Array.isArray(tag) ||
      tag.length === 0 ||
      tag.length > 4 ||
      tag.some((value) => typeof value !== "string" || value.length > 2048)
    ) {
      throw new TypeError("Invalid event tag");
    }
  }
  if (typeof event.content !== "string") throw new TypeError("Invalid event content");
  if (Buffer.byteLength(event.content, "utf8") > MAX_CONTENT_BYTES) {
    throw new TypeError("Event content is too large");
  }
  if (Buffer.byteLength(JSON.stringify(event), "utf8") > MAX_EVENT_BYTES) {
    throw new TypeError("Event is too large");
  }

  const self = normalizePubkey(recipientPubkey);
  const recipientTag = event.tags.find((tag) => tag[0] === "p" && tag[1] === self);
  if (!recipientTag) throw new TypeError("Event is not addressed to this bot");
  if (!event.tags.some((tag) => tag[0] === "t" && tag[1] === DM_TAG)) {
    throw new TypeError("Event is not a GUPT direct message");
  }

  return event;
}

export function getSenderRelayHint(event, recipientPubkey) {
  const self = normalizePubkey(recipientPubkey);
  const recipientTag = event?.tags?.find((tag) => tag[0] === "p" && tag[1] === self);
  return typeof recipientTag?.[2] === "string" ? recipientTag[2] : null;
}

export function getExpiryTimestampSec(now = Date.now()) {
  return Math.floor(now / 1000) + RETENTION_DAYS * 24 * 60 * 60;
}

export function isExpiredEvent(event, now = Date.now()) {
  const expiration = event?.tags?.find((tag) => tag[0] === "expiration")?.[1];
  if (expiration == null) return false;
  const expiresAt = Number(expiration);
  return !Number.isFinite(expiresAt) || expiresAt <= Math.floor(now / 1000);
}

export function getDmSharedSecret(secretHex, pubkey) {
  const secret = hexToBytes(normalizeSecretHex(secretHex));
  const compressedPubkey = hexToBytes(`02${normalizePubkey(pubkey)}`);
  return sha256(secp.getSharedSecret(secret, compressedPubkey).subarray(1, 33));
}

export function encryptDm(secretHex, pubkey, plaintext, options = {}) {
  const nonce = options.nonce
    ? Uint8Array.from(options.nonce)
    : globalThis.crypto.getRandomValues(new Uint8Array(12));
  if (nonce.length !== 12) throw new TypeError("AES-GCM nonce must contain 12 bytes");
  const ciphertext = gcm(getDmSharedSecret(secretHex, pubkey), nonce).encrypt(
    textEncoder.encode(String(plaintext)),
  );
  return `v1:${Buffer.from(nonce).toString("base64")}:${Buffer.from(ciphertext).toString("base64")}`;
}

export function decryptDm(secretHex, pubkey, blob) {
  const parts = String(blob || "").split(":");
  if (parts.length !== 3 || parts[0] !== "v1") throw new TypeError("Unsupported ciphertext format");
  const nonce = Buffer.from(parts[1], "base64");
  const ciphertext = Buffer.from(parts[2], "base64");
  if (nonce.length !== 12 || ciphertext.length < 16) throw new TypeError("Invalid ciphertext");
  const plaintext = gcm(getDmSharedSecret(secretHex, pubkey), nonce).decrypt(ciphertext);
  return textDecoder.decode(plaintext);
}

export function normalizePublicBotProfile(value) {
  if (value == null || value === false) return null;
  if (value === true || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("publicBot must be { name, about, owner?, website?, bitcoin? }");
  }
  const name = String(value.name || "").trim();
  const about = String(value.about || "").trim();
  if (!name) throw new TypeError("publicBot.name is required");
  if (!about) throw new TypeError("publicBot.about is required");
  if (name.length > PUBLIC_BOT_NAME_MAX) throw new TypeError("publicBot.name is too long");
  if (about.length > PUBLIC_BOT_ABOUT_MAX) throw new TypeError("publicBot.about is too long");
  const profile = { name, about };
  const ownerRaw = String(value.owner || "").trim();
  if (ownerRaw) profile.owner = normalizePubkey(ownerRaw);
  const websiteRaw = String(value.website || "").trim();
  if (websiteRaw) profile.website = normalizePublicBotWebsite(websiteRaw);
  const bitcoin = normalizeBitcoinAddress(value.bitcoin);
  if (bitcoin) profile.bitcoin = bitcoin;
  return profile;
}

function normalizePublicBotWebsite(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    try {
      parsed = new URL(`https://${value}`);
    } catch {
      throw new TypeError("publicBot.website must be an http(s) URL");
    }
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("publicBot.website must be an http(s) URL");
  }
  if (parsed.username || parsed.password) {
    throw new TypeError("publicBot.website must be an http(s) URL");
  }
  parsed.hash = "";
  return parsed.toString();
}

export function buildPublicBotEvent({
  secretHex,
  name,
  about,
  owner,
  website,
  bitcoin,
  relays = [],
  now = Date.now(),
}) {
  const profile = normalizePublicBotProfile({ name, about, owner, website, bitcoin });
  const tags = [
    ["t", BOT_TAG],
    [BOT_TAG, JSON.stringify(profile)],
    ["expiration", String(getExpiryTimestampSec(now))],
  ];
  const seen = new Set();
  for (const relay of relays) {
    if (tags.length >= 3 + PUBLIC_BOT_MAX_RELAY_TAGS) break;
    const url = String(relay || "").trim();
    if (!url.startsWith("wss://") || seen.has(url)) continue;
    seen.add(url);
    tags.push(["r", url]);
  }
  return finalizeEvent(
    {
      kind: BOT_KIND,
      created_at: Math.floor(now / 1000),
      tags,
      content: PUBLIC_BOT_CONTENT,
    },
    secretHex,
  );
}

export function buildDirectMessageEvent({
  secretHex,
  recipientPubkey,
  payload,
  relayHint = null,
  now = Date.now(),
}) {
  const recipient = normalizePubkey(recipientPubkey);
  const content = encryptDm(secretHex, recipient, JSON.stringify(payload));
  return finalizeEvent(
    {
      kind: DM_KIND,
      created_at: Math.floor(now / 1000),
      tags: [
        relayHint ? ["p", recipient, String(relayHint)] : ["p", recipient],
        ["t", DM_TAG],
        ["expiration", String(getExpiryTimestampSec(now))],
      ],
      content,
    },
    secretHex,
  );
}

export function decryptDirectMessage(event, secretHex, recipientPubkey) {
  assertDirectMessageEvent(event, recipientPubkey);
  const plaintext = decryptDm(secretHex, event.pubkey, event.content);
  const payload = JSON.parse(plaintext);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Invalid direct-message payload");
  }
  return payload;
}
