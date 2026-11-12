// NotifyGupt — drop-in browser logging that lands in a gupt inbox.
//
// A single function any web app can call: it encrypts a log line to a gupt
// public key, signs it with a random per-browser device key (kept in
// localStorage so one browser is one stable "log device"), and posts the
// signed event to a Rabta relay. gupt picks it up like any other direct
// message — the log shows up in the inbox, encrypted end-to-end.
//
// Dependencies (same crypto stack gupt ships):
//   npm i @noble/curves @noble/hashes @noble/ciphers
//
// Usage:
//   import { NotifyGupt } from "./notify.js";
//   await NotifyGupt("https://rabta.t3nk.com", "<gupt pubkey>", "[myapp] booted");
//
// The relay and target key arguments are optional: they are pre-filled with
// gupt's default relay and, when NotifyGupt runs inside gupt itself, with the
// current account's public key.

import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { gcm } from "@noble/ciphers/aes.js";

/** Where log events are published — gupt's default Rabta relay. */
export const NOTIFY_RELAY = "https://rabta.t3nk.com";

/** localStorage slot for this browser's notify device key. */
export const NOTIFY_KEY_STORAGE = "gupt-notify-device-key";

/**
 * Defaults used when NotifyGupt's arguments are omitted. In gupt itself the
 * integrations page calls setNotifyDefaults() with the signed-in account's
 * public key, so NotifyGupt(text) sends to that inbox.
 */
export const NOTIFY_DEFAULTS = {
  relay: NOTIFY_RELAY,
  pubkey: "",
};

export function setNotifyDefaults({ relay, pubkey } = {}) {
  if (typeof relay === "string" && relay.trim()) NOTIFY_DEFAULTS.relay = relay.trim();
  if (typeof pubkey === "string" && isValidPubkey(pubkey))
    NOTIFY_DEFAULTS.pubkey = normalizePubkey(pubkey);
}

// ─── Small helpers (kept inline so this file is copy-pasteable) ──────────────

function normalizePubkey(value) {
  const hex = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^(ed25519|x25519):/, "");
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

function isValidPubkey(value) {
  return normalizePubkey(value) !== null;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Deterministic canonical JSON — the same serialization rabta signs with. */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}

// ─── Device key (localStorage, generated on first use) ───────────────────────

/**
 * This browser's notify identity. Generated once, persisted in localStorage,
 * so every log from this browser is signed by the same key and gupt can
 * recognize the sender as one stable contact.
 */
export function getNotifyDeviceKey() {
  let privkeyHex = "";
  try {
    privkeyHex = localStorage.getItem(NOTIFY_KEY_STORAGE) || "";
  } catch {
    privkeyHex = "";
  }
  if (!/^[0-9a-f]{64}$/.test(privkeyHex)) {
    privkeyHex = bytesToHex(ed25519.keygen().secretKey);
    try {
      localStorage.setItem(NOTIFY_KEY_STORAGE, privkeyHex);
    } catch {
      // Private mode or blocked storage: the key still works for this session.
    }
  }
  return {
    privkeyHex,
    pubkeyHex: bytesToHex(ed25519.getPublicKey(hexToBytes(privkeyHex))),
  };
}

/** Forget this browser's notify identity; the next send generates a new one. */
export function clearNotifyDeviceKey() {
  try {
    localStorage.removeItem(NOTIFY_KEY_STORAGE);
  } catch {
    // Nothing to forget.
  }
}

// ─── Crypto (identical wire format to gupt DMs) ──────────────────────────────

function ed25519PrivToX25519(edPriv) {
  const bytes = typeof edPriv === "string" ? hexToBytes(edPriv) : edPriv;
  const hash = sha512(bytes);
  const scalar = new Uint8Array(hash.subarray(0, 32));
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  return scalar;
}

function ed25519PubToX25519(edPub) {
  const hex = String(edPub || "").replace(/^ed25519:/i, "");
  const point = ed25519.Point.fromHex(hex);
  const Fp = ed25519.Point.Fp;
  const one = 1n;
  return Fp.toBytes(Fp.mul(Fp.add(one, point.y), Fp.inv(Fp.sub(one, point.y))));
}

/** Shared secret with the inbox owner: X25519 ECDH + SHA-256, as gupt does. */
function getSharedSecret(privBytes, peerPubkeyHex) {
  const shared = x25519.getSharedSecret(
    ed25519PrivToX25519(privBytes),
    ed25519PubToX25519(peerPubkeyHex),
  );
  return sha256(shared);
}

// ─── The function ────────────────────────────────────────────────────────────

/**
 * Send a log line to a gupt inbox.
 *
 * @param {string} [rabtaRelay]    Relay URL. Default: gupt's default relay.
 * @param {string} [guptPublicKey] Target inbox pubkey (64 hex chars). Default:
 *                                 the account configured via
 *                                 setNotifyDefaults() — inside gupt that is
 *                                 the signed-in account.
 * @param {string} text            The log line.
 * @returns {Promise<{ok: boolean, id: string, sender: string, status: number,
 *                    error?: string}>}
 */
export async function NotifyGupt(
  rabtaRelay = NOTIFY_DEFAULTS.relay,
  guptPublicKey = NOTIFY_DEFAULTS.pubkey,
  text = "",
) {
  const relay = String(rabtaRelay || NOTIFY_DEFAULTS.relay || NOTIFY_RELAY)
    .trim()
    .replace(/\/+$/, "");
  const target = normalizePubkey(guptPublicKey);
  if (!relay) throw new Error("NotifyGupt: no Rabta relay configured");
  if (!target) throw new Error("NotifyGupt: no valid target gupt public key");
  if (!String(text).trim()) throw new Error("NotifyGupt: nothing to send");

  const device = getNotifyDeviceKey();
  const privBytes = hexToBytes(device.privkeyHex);

  // gupt's DM payload shape: type/text/ts is what the chat UI renders.
  const payload = JSON.stringify({
    type: "text",
    text: String(text),
    ts: Date.now(),
    source: "notify",
  });

  const key = getSharedSecret(privBytes, target);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = gcm(key, nonce).encrypt(new TextEncoder().encode(payload));
  const nonceB64 = bytesToBase64(nonce);
  const cipherB64 = bytesToBase64(ciphertext);

  const now = Math.floor(Date.now() / 1000);
  const owner = `ed25519:${device.pubkeyHex}`;
  const envelope = {
    blobs: [],
    collection: "gupt/chat/dm",
    created_at: now,
    data: { v: 1, nonce: nonceB64, ciphertext: cipherB64 },
    expires_at: now + 30 * 24 * 60 * 60,
    labels: ["gupt-dm", target],
    owner,
  };

  const digest = sha256(new TextEncoder().encode(canonical(envelope)));
  const event = {
    ...envelope,
    id: bytesToHex(digest),
    sig: bytesToHex(ed25519.sign(digest, privBytes)),
    pubkey: device.pubkeyHex,
    content: `v1:${nonceB64}:${cipherB64}`,
    kind: 4,
    tags: [
      ["p", target],
      ["t", "gupt-dm"],
      ["expiration", String(envelope.expires_at)],
    ],
  };

  const res = await fetch(`${relay}/api/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  const data = await res.json().catch(() => ({}));

  return {
    ok: res.ok,
    id: data.id || event.id,
    sender: device.pubkeyHex,
    status: res.status,
    error: res.ok ? undefined : data.error || `Relay returned ${res.status}`,
  };
}
