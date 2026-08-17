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

export function sha256Hex(str) {
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

export function normalizePastedPrivkeyHex(value) {
  const compact = String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return /^[0-9a-f]{64}$/.test(compact) ? compact : null;
}

/**
 * Hex keys and Gupt backup JSON restore as-is. Anything else is a secret for one Argon2id pass.
 */
export function classifyPastedIdentitySecret(raw) {
  const text = String(raw || "").trim();
  if (!text) return { kind: "empty" };

  const hex = normalizePastedPrivkeyHex(text);
  if (hex) return { kind: "hex", value: hex };

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const candidate = normalizePastedPrivkeyHex(
        parsed.privkeyHex || parsed.privateKey || parsed.secretKey || "",
      );
      if (candidate) return { kind: "hex", value: candidate };
      return { kind: "invalid-backup" };
    }
  } catch {}

  return { kind: "secret", value: text };
}

export function derivePrivkeyFromSecret(secret) {
  const text = String(secret || "").trim();
  if (!text) throw new Error("Paste a secret first.");

  const encoder = new TextEncoder();
  const appSalt = encoder.encode("gupt-secret-kdf-v1");
  const bytes = argon2id(encoder.encode(text), appSalt, {
    t: 3,
    m: 65536,
    p: 1,
    dkLen: 32,
  });
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const BRAIN_FACTOR_DEFS = [
  { key: "favoriteCountry", label: "Country", compact: true },
  { key: "specialDate", label: "Date", compact: true },
  { key: "pin", label: "PIN", compact: true },
  { key: "passphrase", label: "Password", compact: false },
  { key: "secretPerson", label: "Memory", compact: true },
  { key: "firstPet", label: "Pet", compact: true },
  { key: "firstCar", label: "Car", compact: true },
];

/**
 * Password keeps trim-only. Every other factor is lowercased with whitespace stripped.
 */
export function normalizeBrainFactorValue(raw, compact = true) {
  const value = String(raw || "").trim();
  if (!compact) return value;
  return value.toLowerCase().replace(/\s+/g, "");
}

/**
 * Hash each non-empty value with SHA-256 (no tags), drop duplicate digests,
 * and sort A→Z so slot order cannot change the identity.
 */
export function canonicalizeBrainFactors(factors = {}) {
  const seen = new Set();
  const items = [];
  for (const def of BRAIN_FACTOR_DEFS) {
    const value = normalizeBrainFactorValue(factors[def.key], def.compact);
    if (!value) continue;
    const hash = sha256Hex(value);
    if (seen.has(hash)) continue;
    seen.add(hash);
    items.push({
      key: def.key,
      label: def.label,
      value,
      hash,
    });
  }

  items.sort((a, b) => a.hash.localeCompare(b.hash));
  return items;
}

export function brainFactorsMasterHash(items) {
  if (!items.length) return "";
  return sha256Hex(items.map((item) => item.hash).join("\0"));
}

/**
 * Derive a deterministic private key from any 2 to 7 distinct brain anchors.
 * Accepts { passphrase, pin, specialDate, secretPerson, favoriteCountry, firstPet, firstCar }
 * SHA-256 hashes are sorted into a master digest, then Argon2id (64 MiB, 3 iterations).
 */
export function derivePrivkeyFromBrainFactors(factors = {}) {
  const items = canonicalizeBrainFactors(factors);

  if (items.length < 2) {
    throw new Error(
      "Please provide at least 2 distinct memory anchors to reach 80+ bits of brain entropy.",
    );
  }

  const masterHash = brainFactorsMasterHash(items);
  const encoder = new TextEncoder();
  const appSalt = encoder.encode("gupt-brain-kdf-v4");

  const bytes = argon2id(encoder.encode(masterHash), appSalt, {
    t: 3,
    m: 65536,
    p: 1,
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
