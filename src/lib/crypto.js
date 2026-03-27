import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { nip19 } from "nostr-tools";
import { getPublicKey as getNostrPublicKey } from "nostr-tools/pure";
import { createAvatar } from "@dicebear/core";
import * as adventurerStyle from "@dicebear/adventurer";
import { adventurer as collectionStyle, botttsNeutral } from "@dicebear/collection";

// secp256k1 v3 requires these set explicitly (no Web Crypto fallback in some environments)
secp.hashes.sha256 = nobleSha256;
secp.hashes.hmacSha256 = (key, ...msgs) => hmac(nobleSha256, key, secp.etc.concatBytes(...msgs));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bytesToBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Keypair ──────────────────────────────────────────────────────────────────

export function generateKeypair() {
  const privkey = secp.utils.randomSecretKey();
  return {
    privkeyHex: secp.etc.bytesToHex(privkey),
    pubkeyHex: getNostrPublicKey(privkey),
  };
}

/**
 * Derive a deterministic private key from a password and numeric PIN.
 *
 * Uses Argon2id — a memory-hard KDF that is highly resistant to GPU/ASIC brute-force.
 * Parameters follow OWASP recommendations: 3 passes, 64 MiB RAM, 1 thread.
 *
 * The account is recoverable from memory alone (password + PIN).
 * A fixed app-specific salt is used since no per-user salt can be stored
 * in a zero-knowledge, server-less design.
 */
export function derivePrivkeyFromPasswordPin(password, pin) {
  const n = parseInt(pin, 10);
  if (!Number.isInteger(n) || n < 1 || n > 99999) {
    throw new Error("PIN must be a whole number between 1 and 99999.");
  }
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const encoder = new TextEncoder();
  const appSalt = encoder.encode("gupt-kdf-v1");
  // Separate password and pin with a null byte so "abc1"+"234" ≠ "abc"+"1234"
  const bytes = argon2id(encoder.encode(password + "\0" + pin), appSalt, {
    t: 3, // 3 passes
    m: 65536, // 64 MiB RAM — kills GPU parallelism
    p: 1, // 1 thread
    dkLen: 32,
  });
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeNostrPubkey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(normalized)) return normalized;
  if (/^(02|03)[0-9a-f]{64}$/.test(normalized)) return normalized.slice(2);
  return null;
}

export function isValidNostrPubkey(value) {
  return !!normalizeNostrPubkey(value);
}

export function npubFromPubkey(value) {
  const normalized = normalizeNostrPubkey(value);
  if (!normalized) return null;
  return nip19.npubEncode(normalized);
}

// ─── Room IDs ─────────────────────────────────────────────────────────────────

export async function dmRoomId(pubkeyA, pubkeyB) {
  const normalizedA = normalizeNostrPubkey(pubkeyA);
  const normalizedB = normalizeNostrPubkey(pubkeyB);
  if (!normalizedA || !normalizedB) throw new Error("Invalid public key");
  return sha256Hex([normalizedA, normalizedB].sort().join(""));
}

export async function groupRoomId(adminPubkey, groupName) {
  return sha256Hex(adminPubkey + groupName);
}

// ─── AES-256-GCM ──────────────────────────────────────────────────────────────

export async function aesEncrypt(keyBytes, plaintext) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  );
  return `v1:${bytesToBase64(nonce)}:${bytesToBase64(new Uint8Array(cipherBuf))}`;
}

export async function aesDecrypt(keyBytes, blob) {
  const parts = blob.split(":");
  if (parts[0] !== "v1") throw new Error(`Unknown ciphertext version: ${parts[0]}`);
  const nonce = base64ToBytes(parts[1]);
  const ciphertext = base64ToBytes(parts[2]);
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, ciphertext);
  return new TextDecoder().decode(plain);
}

// ─── ECIES (secp256k1 ECDH + HKDF + AES-256-GCM) ─────────────────────────────

export async function eciesEncrypt(recipientPubkeyHex, plaintext) {
  const ephPriv = secp.utils.randomSecretKey();
  const ephPub = secp.getPublicKey(ephPriv, true);
  const recipientPub = secp.etc.hexToBytes(recipientPubkeyHex);
  const shared = secp.getSharedSecret(ephPriv, recipientPub);
  const aesKey = hkdf(
    nobleSha256,
    shared,
    undefined,
    new TextEncoder().encode("gupt-ecies-v1"),
    32,
  );
  const enc = await aesEncrypt(aesKey, plaintext);
  return btoa(JSON.stringify({ eph: secp.etc.bytesToHex(ephPub), enc }));
}

export async function eciesDecrypt(privkeyHex, blob) {
  const { eph, enc } = JSON.parse(atob(blob));
  const privBytes = secp.etc.hexToBytes(privkeyHex);
  const ephPub = secp.etc.hexToBytes(eph);
  const shared = secp.getSharedSecret(privBytes, ephPub);
  const aesKey = hkdf(
    nobleSha256,
    shared,
    undefined,
    new TextEncoder().encode("gupt-ecies-v1"),
    32,
  );
  return aesDecrypt(aesKey, enc);
}

// ─── Session key ──────────────────────────────────────────────────────────────

export function randomSessionKeyHex() {
  return secp.etc.bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function sessionKeyBytes(hex) {
  return secp.etc.hexToBytes(hex);
}

// ─── Signing (for admin operations) ──────────────────────────────────────────

export function signMessage(privkeyHex, message) {
  const hash = nobleSha256(new TextEncoder().encode(message));
  const privBytes = secp.etc.hexToBytes(privkeyHex);
  // Use Schnorr (BIP-340): sign returns a Uint8Array directly and is compatible
  // with 32-byte x-only Nostr public keys used in verifyMessage.
  const sig = secp.schnorr.sign(hash, privBytes);
  return secp.etc.bytesToHex(sig);
}

export function verifyMessage(pubkeyHex, message, sigHex) {
  const hash = nobleSha256(new TextEncoder().encode(message));
  // ECDSA secp.verify returns false for 32-byte x-only Nostr pubkeys; use
  // Schnorr (BIP-340) which natively supports 32-byte x-only public keys.
  const pubBytes = secp.etc.hexToBytes(pubkeyHex);
  const sigBytes = secp.etc.hexToBytes(sigHex);
  return secp.schnorr.verify(sigBytes, hash, pubBytes);
}

// ─── Utils ────────────────────────────────────────────────────────────────────

export function shortId(hex, start = 8, end = 4) {
  if (!hex) return "?";
  return `${hex.slice(0, start)}…${hex.slice(-end)}`;
}

export function roboHashUrl(pubkeyHex) {
  const seed = pubkeyHex ? String(pubkeyHex) : "anonymous";
  const avatar = createAvatar(adventurerStyle, { seed });
  return avatar.toDataUri();
}

export function roboHashGroupUrl(groupSeed) {
  const seed = groupSeed ? String(groupSeed) : "anonymous";
  const avatar = createAvatar(botttsNeutral, { seed });
  return avatar.toDataUri();
}

const NAME_ADJECTIVES = [
  "chup",
  "naram",
  "tez",
  "chamakdar",
  "sona",
  "chandi",
  "laal",
  "neela",
  "hara",
  "safed",
  "sohna",
  "pyara",
  "shant",
  "bahadur",
  "diler",
  "sacha",
  "wafaadar",
  "mehnati",
  "hoshiyaar",
  "chalak",

  "purana",
  "nava",
  "tezra",
  "mazboot",
  "thanda",
  "garam",
  "roshan",
  "chhupa",
  "khulla",
  "raazdaar",
  "pavittar",
  "anant",
  "beant",
  "udda",
  "girda",
  "uthda",
  "ghumda",
  "toofani",
  "hawadaar",
  "barsaati",

  "barfili",
  "mitti",
  "pathri",
  "lakdi",
  "loh",
  "heera",
  "moti",
  "panna",
  "sona",
  "tamba",
  "fauladi",
  "chamakda",
  "zinda",
  "khush",
  "soya",
  "sapnewala",
  "shaant",
  "sabrwala",
  "nidar",
  "jigyasu",

  "samajhdaar",
  "phusphusda",
  "gaanda",
  "chamkda",
  "door",
  "kol",
  "amar",
  "kahaniwala",
  "dantkatha",
  "taarawala",
  "asmaani",
  "brahmandi",
  "bijliwala",
  "chumbki",
  "taakatwar",
  "zinda",
  "komal",
  "sakht",
  "lachakdar",
  "jhukda",

  "rangila",
  "dhuandaar",
  "kohra",
  "barfila",
  "aggwala",
  "retla",
  "hariyali",
  "phooldaar",
  "pattidaar",
  "khushbudar",
  "meetha",
  "tikha",
  "khara",
  "dharti",
  "dhuaandaar",
  "kurkura",
  "naram",
  "sakht",
  "lamba",
  "chhota",

  "udda",
  "tairda",
  "uddta",
  "phisalda",
  "chalda",
  "daudda",
  "chhalang",
  "ghumda",
  "mudda",
  "behta",
  "vadhta",
  "murjhanda",
  "khilda",
  "pakda",
  "buddha",
  "nava",
  "jagda",
  "dekhda",
  "intezar",
  "jaagda",

  "sacha",
  "imaandaar",
  "garvwala",
  "narmdil",
  "dayalu",
  "vinamra",
  "sabrwala",
  "dheema",
  "tez",
  "joshila",
  "himmatwala",
  "veer",
  "ujla",
  "mahaan",
  "shandaar",
  "roshan",
  "chamakila",
  "shahi",
  "rajwada",
  "badshahi",
];

const NAME_NOUNS = [
  "hawa",
  "nadi",
  "pathar",
  "agg",
  "saaya",
  "badal",
  "tara",
  "chand",
  "sooraj",
  "lehar",
  "jangal",
  "pahad",
  "samundar",
  "ghati",
  "registan",
  "maidan",
  "tapoo",
  "ghati",
  "barf",
  "dhumketu",

  "goonj",
  "chingaari",
  "lehar",
  "phool",
  "pala",
  "toofan",
  "savera",
  "shaam",
  "dhund",
  "bijli",
  "bagh",
  "pul",
  "minar",
  "bandargah",
  "lantern",
  "aaina",
  "disha",
  "langar",
  "nishaan",
  "angara",

  "hawa",
  "dhaara",
  "jharna",
  "nala",
  "chattan",
  "ridge",
  "choti",
  "maidan",
  "khet",
  "ban",
  "reef",
  "lagoon",
  "khadi",
  "delta",
  "raasta",
  "pagdandi",
  "sadak",
  "darwaza",
  "mandir",
  "qila",

  "shehar",
  "bazaar",
  "dera",
  "fasal",
  "par",
  "pankh",
  "ghonsla",
  "kinara",
  "chakkar",
  "grah",
  "akashganga",
  "nebula",
  "pathar",
  "upgrah",
  "deepak",
  "lighthouse",
  "burj",
  "engine",
  "gear",
  "circuit",

  "network",
  "portal",
  "khazana",
  "library",
  "scroll",
  "naksha",
  "chart",
  "hisab",
  "dhadkan",
  "vector",
  "matrix",
  "kernel",
  "thread",
  "node",
  "cluster",
  "stream",
  "channel",
  "vault",
  "lohshala",
  "hathoda",

  "dhaal",
  "barchha",
  "taj",
  "takht",
  "jhanda",
  "signal",
  "flare",
  "beam",
  "roshni",
  "chamak",
  "saaya",
  "pratibimb",
  "tasveer",
  "aakar",
  "pattern",
  "nishaan",
  "mohr",
  "chinh",
  "chakra",
  "gola",
];

function pick(arr, seed) {
  return arr[((seed % arr.length) + arr.length) % arr.length];
}

export function pubkeyName(pubkeyHex) {
  if (!pubkeyHex) return "anonymous";
  // Use 3 non-overlapping 2-byte windows from the pubkey
  const a = parseInt(pubkeyHex.slice(2, 6), 16);
  const b = parseInt(pubkeyHex.slice(10, 14), 16);
  const c = parseInt(pubkeyHex.slice(20, 24), 16);
  const first = pick(NAME_ADJECTIVES, a);
  const second = pick(NAME_NOUNS, b);
  const num = String(Math.abs(c) % 1000).padStart(3, "0");
  return `${first}-${second}-${num}`;
}
