import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { gcm } from "@noble/ciphers/aes.js";
import { toSvg } from "jdenticon";

secp.hashes.sha256 = nobleSha256;
secp.hashes.hmacSha256 = (key, ...msgs) => hmac(nobleSha256, key, secp.etc.concatBytes(...msgs));

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
    pubkeyHex: secp.etc.bytesToHex(secp.schnorr.getPublicKey(privkey)),
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

  const bytes = argon2id(encoder.encode(password + "\0" + pin), appSalt, {
    t: 3,
    m: 65536,
    p: 1,
    dkLen: 32,
  });
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive a deterministic private key from any 3 to 5 brain memory factors.
 * Accepts { passphrase, pin, specialDate, secretPerson, favoriteCountry }
 * Uses Argon2id (memory-hard KDF, 64 MiB RAM, 3 iterations).
 */
export function derivePrivkeyFromBrainFactors({
  passphrase = "",
  pin = "",
  specialDate = "",
  secretPerson = "",
  favoriteCountry = "",
} = {}) {
  const p = String(passphrase || "").trim();
  const n = String(pin || "").trim();
  const d = String(specialDate || "").trim();
  const s = String(secretPerson || "")
    .trim()
    .toLowerCase();
  const c = String(favoriteCountry || "")
    .trim()
    .toLowerCase();

  const factors = [];
  if (p) factors.push(`p:${p}`);
  if (n) factors.push(`n:${n}`);
  if (d) factors.push(`d:${d}`);
  if (s) factors.push(`s:${s}`);
  if (c) factors.push(`c:${c}`);

  if (factors.length < 3) {
    if (p.length >= 8 && n.length >= 1) {
      const pinNum = parseInt(n, 10);
      if (Number.isInteger(pinNum) && pinNum >= 1 && pinNum <= 99999) {
        return derivePrivkeyFromPasswordPin(p, n);
      }
    }
    throw new Error(
      "Please provide at least 3 memory factors to generate sufficient brain entropy.",
    );
  }

  factors.sort();
  const payload = factors.join("\0");

  const encoder = new TextEncoder();
  const appSalt = encoder.encode("gupt-brain-kdf-v1");

  const bytes = argon2id(encoder.encode(payload), appSalt, {
    t: 3,
    m: 65536,
    p: 1,
    dkLen: 32,
  });

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive public key and identity hash from brain factors without storing private key.
 */
export function derivePubkeyAndHashFromBrainFactors(factors) {
  const privHex = derivePrivkeyFromBrainFactors(factors);
  const privBytes = secp.etc.hexToBytes(privHex);
  const pubkeyHex = secp.etc.bytesToHex(secp.schnorr.getPublicKey(privBytes));
  const hashHex = sha256Hex(pubkeyHex);
  return { privHex, pubkeyHex, hashHex };
}

export function normalizeNostrPubkey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(normalized)) return normalized;
  if (/^(02|03)[0-9a-f]{64}$/.test(normalized)) return normalized.slice(2);
  return null;
}

export async function dmRoomId(pubkeyA, pubkeyB) {
  const normalizedA = normalizeNostrPubkey(pubkeyA);
  const normalizedB = normalizeNostrPubkey(pubkeyB);
  if (!normalizedA || !normalizedB) throw new Error("Invalid public key");
  return sha256Hex([normalizedA, normalizedB].sort().join(""));
}

/**
 * Derives a 32-byte shared secret from a privkey and a schnorr pubkey.
 */
export function getDmSharedSecret(privkeyHex, pubkeyHex) {
  const privBytes = typeof privkeyHex === "string" ? secp.etc.hexToBytes(privkeyHex) : privkeyHex;
  const pubBytes = secp.etc.hexToBytes("02" + pubkeyHex);
  const sharedPoint = secp.getSharedSecret(privBytes, pubBytes);

  const sharedX = sharedPoint.subarray(1, 33);

  return nobleSha256(sharedX);
}

export async function encryptDm(privkeyHex, pubkeyHex, plaintext) {
  const secretKey = getDmSharedSecret(privkeyHex, pubkeyHex);

  return await aesEncrypt(secretKey, plaintext);
}

export async function decryptDm(privkeyHex, pubkeyHex, ciphertext) {
  const secretKey = getDmSharedSecret(privkeyHex, pubkeyHex);
  return await aesDecrypt(secretKey, ciphertext);
}

export async function aesEncrypt(keyBytes, plaintext) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = gcm(keyBytes, nonce).encrypt(new TextEncoder().encode(plaintext));
  return `v1:${bytesToBase64(nonce)}:${bytesToBase64(ciphertext)}`;
}

export async function aesDecrypt(keyBytes, blob) {
  const parts = blob.split(":");
  if (parts[0] !== "v1") throw new Error(`Unknown ciphertext version: ${parts[0]}`);
  const nonce = base64ToBytes(parts[1]);
  const ciphertext = base64ToBytes(parts[2]);
  const plain = gcm(keyBytes, nonce).decrypt(ciphertext);
  return new TextDecoder().decode(plain);
}

export function shortId(hex, start = 8, end = 4) {
  if (!hex) return "?";
  return `${hex.slice(0, start)}…${hex.slice(-end)}`;
}

export function roboHashUrl(pubkeyHex) {
  const seed = pubkeyHex ? String(pubkeyHex) : "anonymous";
  const svg = toSvg(seed, 128);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function roboHashGroupUrl(groupSeed) {
  const seed = groupSeed ? String(groupSeed) : "anonymous";
  const svg = toSvg(seed, 128);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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

  const a = parseInt(pubkeyHex.slice(2, 6), 16);
  const b = parseInt(pubkeyHex.slice(10, 14), 16);
  const c = parseInt(pubkeyHex.slice(20, 24), 16);
  const first = pick(NAME_ADJECTIVES, a);
  const second = pick(NAME_NOUNS, b);
  const num = String(Math.abs(c) % 1000).padStart(3, "0");
  return `${first}-${second}-${num}`;
}

export function finalizeEvent(eventTemplate, privkeyBytes) {
  const pubkeyHex = secp.etc.bytesToHex(secp.schnorr.getPublicKey(privkeyBytes));
  const event = {
    ...eventTemplate,
    pubkey: pubkeyHex,
    created_at: eventTemplate.created_at ?? Math.floor(Date.now() / 1000),
    tags: eventTemplate.tags || [],
    content: eventTemplate.content || "",
  };

  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);

  const idBytes = nobleSha256(new TextEncoder().encode(serialized));
  event.id = secp.etc.bytesToHex(idBytes);
  event.sig = secp.etc.bytesToHex(secp.schnorr.sign(idBytes, privkeyBytes));

  return event;
}

export function getPublicKey(privkeyBytes) {
  return secp.etc.bytesToHex(secp.schnorr.getPublicKey(privkeyBytes));
}
