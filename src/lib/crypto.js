import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { npubEncode } from "nostr-tools/nip19";
import { getPublicKey as getNostrPublicKey } from "nostr-tools/pure";
import { createAvatar } from "@dicebear/core";
import * as botttsNeutral from "@dicebear/bottts-neutral";

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

function sha256Hex(str) {
  const bytes = nobleSha256(new TextEncoder().encode(str));
  return Array.from(bytes)
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

export function npubFromPubkey(value) {
  const normalized = normalizeNostrPubkey(value);
  if (!normalized) return null;
  return npubEncode(normalized);
}

// ─── Room IDs ─────────────────────────────────────────────────────────────────

export async function dmRoomId(pubkeyA, pubkeyB) {
  const normalizedA = normalizeNostrPubkey(pubkeyA);
  const normalizedB = normalizeNostrPubkey(pubkeyB);
  if (!normalizedA || !normalizedB) throw new Error("Invalid public key");
  return sha256Hex([normalizedA, normalizedB].sort().join(""));
}


import { encrypt as nip04Encrypt, decrypt as nip04Decrypt } from "nostr-tools/nip04";

/**
 * Derives a 32-byte shared secret from a privkey and a schnorr pubkey.
 */
function getDmSharedSecret(privkeyHex, pubkeyHex) {
  // NIP-04 explicitly uses 02 prefixed pubkey to force even Y coordinate
  const sharedPoint = secp.getSharedSecret(privkeyHex, "02" + pubkeyHex);
  // We use the first 32 bytes of the sha256 hash of the shared point as our AES key
  return nobleSha256(sharedPoint);
}

export async function encryptDm(privkeyHex, pubkeyHex, plaintext) {
  const secretKey = getDmSharedSecret(privkeyHex, pubkeyHex);
  // Our custom AES-GCM encryption with v1: prefix
  return await aesEncrypt(secretKey, plaintext);
}

export async function decryptDm(privkeyHex, pubkeyHex, ciphertext) {
  if (ciphertext.startsWith("v1:")) {
    const secretKey = getDmSharedSecret(privkeyHex, pubkeyHex);
    return await aesDecrypt(secretKey, ciphertext);
  }
  // Legacy backward compatibility for standard NIP-04 AES-CBC messages
  return nip04Decrypt(privkeyHex, pubkeyHex, ciphertext);
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

// ─── Utils ────────────────────────────────────────────────────────────────────

export function shortId(hex, start = 8, end = 4) {
  if (!hex) return "?";
  return `${hex.slice(0, start)}…${hex.slice(-end)}`;
}

export function roboHashUrl(pubkeyHex) {
  const seed = pubkeyHex ? String(pubkeyHex) : "anonymous";
  const avatar = createAvatar(botttsNeutral, { seed });
  return avatar.toDataUri();
}

export function roboHashGroupUrl(groupSeed) {
  const seed = groupSeed ? String(groupSeed) : "anonymous";
  const avatar = createAvatar(botttsNeutral, { seed });
  return avatar.toDataUri();
}

const NAME_ADJECTIVES = [
  "able",
  "active",
  "agile",
  "alert",
  "ancient",
  "aqua",
  "arctic",
  "atomic",
  "awake",
  "azure",
  "balanced",
  "bare",
  "basic",
  "beaming",
  "best",
  "big",
  "binary",
  "black",
  "blazing",
  "blue",
  "bold",
  "brass",
  "brave",
  "bright",
  "brisk",
  "bronze",
  "calm",
  "careful",
  "casual",
  "celestial",
  "central",
  "champion",
  "charming",
  "cheerful",
  "chief",
  "chill",
  "classic",
  "clean",
  "clear",
  "clever",
  "cloudy",
  "coastal",
  "cold",
  "colorful",
  "comic",
  "cool",
  "cosmic",
  "crimson",
  "crisp",
  "crystal",
  "curious",
  "daring",
  "dark",
  "dawn",
  "deep",
  "deluxe",
  "dense",
  "direct",
  "divine",
  "double",
  "dreamy",
  "dry",
  "dynamic",
  "eager",
  "early",
  "earthy",
  "eastern",
  "easy",
  "electric",
  "elegant",
  "elite",
  "emerald",
  "endless",
  "epic",
  "even",
  "exact",
  "expert",
  "fair",
  "faithful",
  "famous",
  "fast",
  "fearless",
  "fiery",
  "final",
  "firm",
  "first",
  "flashy",
  "flying",
  "focused",
  "formal",
  "free",
  "fresh",
  "friendly",
  "frosty",
  "full",
  "funny",
  "gentle",
  "giant",
  "glad",
  "global",
  "glorious",
  "glowing",
  "golden",
  "good",
  "grand",
  "great",
  "green",
  "happy",
  "hardy",
  "harmonic",
  "heroic",
  "hidden",
  "high",
  "honest",
  "humble",
  "hybrid",
  "icy",
  "ideal",
  "infinite",
  "inner",
  "instant",
  "iron",
  "jolly",
  "joyful",
  "keen",
  "kind",
  "large",
  "last",
  "leading",
  "light",
  "lively",
  "local",
  "lone",
  "long",
  "lucky",
  "lunar",
  "magic",
  "major",
  "marine",
  "massive",
  "mellow",
  "metallic",
  "midnight",
  "mighty",
  "modern",
  "mystic",
  "narrow",
  "native",
  "navy",
  "neat",
  "new",
  "nimble",
  "noble",
  "north",
  "northern",
  "nova",
  "oceanic",
  "odd",
  "olive",
  "open",
  "optimal",
  "orange",
  "orbital",
  "organic",
  "original",
  "outer",
  "patient",
  "peaceful",
  "perfect",
  "pink",
  "plain",
  "playful",
  "polar",
  "polished",
  "positive",
  "precise",
  "prime",
  "proud",
  "pure",
  "quick",
  "quiet",
  "radiant",
  "rapid",
  "rare",
  "real",
  "red",
  "regal",
  "rich",
  "rising",
  "river",
  "robust",
  "rocky",
  "royal",
  "ruby",
  "rustic",
  "sacred",
  "safe",
  "sage",
  "scarlet",
  "secret",
  "serene",
  "sharp",
  "shining",
  "silent",
  "silver",
  "simple",
  "single",
  "sky",
  "smart",
  "smooth",
  "snowy",
  "solar",
  "solid",
  "southern",
  "sparkling",
  "speedy",
  "spicy",
  "spiral",
  "spring",
  "stable",
  "stellar",
  "steady",
  "steel",
  "stormy",
  "strong",
  "summer",
  "sunny",
  "super",
  "swift",
  "tactical",
  "tall",
  "teal",
  "tidal",
  "tiny",
  "top",
  "tough",
  "tranquil",
  "true",
  "ultimate",
  "ultra",
  "united",
  "urban",
  "vast",
  "velvet",
  "vibrant",
  "vivid",
  "warm",
  "western",
  "white",
  "wild",
  "windy",
  "winter",
  "wise",
  "wooden",
  "yellow",
  "young",
  "zesty",
];

const NAME_NOUNS = [
  "anchor",
  "apple",
  "arch",
  "arrow",
  "asteroid",
  "atlas",
  "atom",
  "aurora",
  "badger",
  "banner",
  "bay",
  "beacon",
  "beam",
  "bear",
  "bird",
  "blade",
  "blossom",
  "boat",
  "bolt",
  "branch",
  "breeze",
  "bridge",
  "brook",
  "buffer",
  "canyon",
  "castle",
  "cave",
  "cedar",
  "center",
  "channel",
  "chart",
  "circle",
  "citadel",
  "cliff",
  "cloud",
  "cluster",
  "coast",
  "comet",
  "compass",
  "coral",
  "core",
  "cove",
  "crown",
  "crystal",
  "current",
  "cycle",
  "delta",
  "desert",
  "diamond",
  "dock",
  "dragon",
  "dream",
  "dune",
  "eagle",
  "echo",
  "ember",
  "engine",
  "falcon",
  "farm",
  "feather",
  "field",
  "fire",
  "fjord",
  "flare",
  "flower",
  "forest",
  "forge",
  "fort",
  "fox",
  "galaxy",
  "garden",
  "gate",
  "gem",
  "glacier",
  "glade",
  "glow",
  "grove",
  "harbor",
  "harmony",
  "hawk",
  "heart",
  "hill",
  "horizon",
  "island",
  "jewel",
  "journey",
  "jungle",
  "kernel",
  "key",
  "king",
  "knight",
  "lake",
  "lantern",
  "leaf",
  "legend",
  "library",
  "light",
  "lighthouse",
  "lion",
  "lotus",
  "machine",
  "map",
  "market",
  "matrix",
  "meadow",
  "meteor",
  "mirror",
  "mission",
  "mist",
  "moon",
  "mountain",
  "nebula",
  "nest",
  "network",
  "node",
  "nova",
  "oasis",
  "ocean",
  "orbit",
  "orchard",
  "owl",
  "panda",
  "path",
  "peak",
  "pearl",
  "phoenix",
  "pine",
  "planet",
  "portal",
  "prairie",
  "pulse",
  "quartz",
  "quest",
  "rabbit",
  "ranger",
  "reef",
  "resonance",
  "ridge",
  "river",
  "road",
  "rocket",
  "root",
  "rose",
  "sail",
  "satellite",
  "scale",
  "scene",
  "shadow",
  "shield",
  "shore",
  "signal",
  "sky",
  "snow",
  "socket",
  "song",
  "spark",
  "sphere",
  "spire",
  "spring",
  "square",
  "star",
  "station",
  "steam",
  "stone",
  "storm",
  "stream",
  "summit",
  "sun",
  "system",
  "temple",
  "thread",
  "throne",
  "thunder",
  "tiger",
  "tower",
  "trail",
  "treasure",
  "tree",
  "valley",
  "vault",
  "vector",
  "vessel",
  "violet",
  "vision",
  "voyage",
  "wave",
  "whale",
  "wind",
  "wing",
  "wolf",
  "wood",
  "world",
  "zenith",
  "zone",
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
