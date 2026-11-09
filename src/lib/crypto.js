import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { gcm } from "@noble/ciphers/aes.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { blobatarUri } from "blobatar/uri";
import {
  signEvent as signRabtaEvent,
  getSharedSecret as getRabtaSharedSecret,
} from "./rabta/index.js";

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

/**
 * `crypto.subtle.digest` buffers the whole input, so cap it well below the
 * point where a large video would blow up the tab. Any normal secret file is
 * orders of magnitude smaller than this.
 */
export const MAX_SECRET_FILE_BYTES = 100 * 1024 * 1024;

/**
 * Hash a local file into the secret string that derives an identity.
 *
 * The file is read in the browser and never uploaded — only its SHA-256 is
 * used, exactly like a passphrase. That makes the file a second way to carry
 * an identity for people who have a file nobody else has but would rather not
 * remember a password.
 *
 * The consequence to warn about: any edit to the file, including a sync client
 * re-saving it or an editor rewriting line endings, changes the hash and
 * produces a different identity.
 */
export async function hashSecretFile(file) {
  if (!file) throw new Error("Choose a file first.");
  if (file.size === 0) throw new Error("That file is empty. Pick one with content.");
  if (file.size > MAX_SECRET_FILE_BYTES) {
    const mb = Math.round(MAX_SECRET_FILE_BYTES / (1024 * 1024));
    throw new Error(`That file is too large. Pick one under ${mb} MB.`);
  }

  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}

// ─── Keypair ──────────────────────────────────────────────────────────────────

export function generateKeypair() {
  const { secretKey, publicKey } = ed25519.keygen();
  const privkeyHex = bytesToHex(secretKey);
  const pubkeyHex = bytesToHex(publicKey);
  return {
    privkeyHex,
    pubkeyHex,
    privkey: privkeyHex,
    pubkey: pubkeyHex,
  };
}

/**
 * One Argon2id pass over whatever the user typed.
 *
 * There is deliberately no raw-key branch: Gupt never exports private keys,
 * so there is no shape of input that can be assumed to already be a key. Any
 * secret produces its identity the same way, on every device, forever.
 *
 * The fixed app salt is what makes the same secret derive the same identity
 * on another device without storing anything. The trade-off is that identical
 * secrets produce identical keys for every user, so weak secrets are weak.
 */
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

// ─── File + PIN ───────────────────────────────────────────────────────────────
//
// Two factors, neither useful alone: the file is something you have, the PIN is
// something you remember. A copy of the file derives nothing without the PIN,
// and the PIN derives nothing without that exact file. The material is tagged
// and salted separately from every other method, so a file-only identity (or a
// pasted secret that happens to look like a hash) can never land on this key.

export const FILE_PIN_MIN_DIGITS = 4;
export const FILE_PIN_MAX_DIGITS = 8;

/**
 * Digits only. Pasted spaces, dashes and dots are treated as separators rather
 * than PIN characters, so "12 34" and "12-34" both mean 1234 — the same way a
 * phone reads a PIN. Leading zeros are preserved because the PIN is a string.
 */
export function normalizeFilePin(raw) {
  return String(raw ?? "").replace(/\D+/g, "");
}

export function isValidFilePin(pin) {
  const digits = normalizeFilePin(pin);
  return digits.length >= FILE_PIN_MIN_DIGITS && digits.length <= FILE_PIN_MAX_DIGITS;
}

/** log2(10) per digit: a 4-digit PIN is ~13 bits, an 8-digit PIN ~27 bits. */
export function filePinEntropyBits(pin) {
  return Math.round(normalizeFilePin(pin).length * Math.log2(10));
}

/**
 * Derive a private key from a file hash and a 4–8 digit PIN.
 *
 * `fileHash` must be the SHA-256 hex produced by hashSecretFile(), never the
 * file itself: the file is read locally and only its digest is used, exactly
 * like the file-only method.
 *
 * The extra Argon2id pass (t=4 vs t=3 elsewhere) matters because the PIN space
 * is small. It does not turn a 4-digit PIN into a strong secret — it only makes
 * each guess more expensive. If a device and its files are both seized, the PIN
 * is the remaining barrier, so the UI pushes people towards 8 digits.
 */
export function derivePrivkeyFromFileAndPin(fileHash, pin) {
  const hash = String(fileHash || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Choose a file first.");
  }

  const digits = normalizeFilePin(pin);
  if (digits.length < FILE_PIN_MIN_DIGITS) {
    throw new Error(`Enter a PIN of ${FILE_PIN_MIN_DIGITS} to ${FILE_PIN_MAX_DIGITS} digits.`);
  }
  if (digits.length > FILE_PIN_MAX_DIGITS) {
    throw new Error(`That PIN is too long. Use at most ${FILE_PIN_MAX_DIGITS} digits.`);
  }

  const encoder = new TextEncoder();
  const bytes = argon2id(
    encoder.encode(`gupt-file-pin-v1\0${hash}\0${digits}`),
    encoder.encode("gupt-file-pin-kdf-v1"),
    { t: 4, m: 65536, p: 1, dkLen: 32 },
  );

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
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^ed25519:/, "");
  if (/^[0-9a-f]{64}$/.test(normalized)) return normalized;
  return null;
}

export async function dmRoomId(pubkeyA, pubkeyB) {
  const normalizedA = normalizeNostrPubkey(pubkeyA);
  const normalizedB = normalizeNostrPubkey(pubkeyB);
  if (!normalizedA || !normalizedB) throw new Error("Invalid public key");
  return sha256Hex([normalizedA, normalizedB].sort().join(""));
}

/**
 * Derives a 32-byte shared secret from a privkey and peer pubkey using X25519 ECDH.
 */
export function getDmSharedSecret(privkeyHex, pubkeyHex) {
  return getRabtaSharedSecret(privkeyHex, pubkeyHex);
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

/**
 * Deterministic generated avatars.
 *
 * blobatar is pinned to an exact version in package.json because its
 * silhouette thresholds partition one range: a release that adds a shape
 * reshuffles every existing one, so each user's avatar would change. The
 * pinned output is covered by fixed digests in test/avatars.test.js — if a
 * dependency bumps the rendering anyway, that test fails instead of the
 * avatars silently drifting.
 *
 * Only the offline string API is used. Never the blobatar.dev HTTP endpoint:
 * the seed here is a pubkey, and fetching it from a third party would hand
 * them the whole contact graph.
 */
const ANONYMOUS_SEED = "anonymous";

function generatedAvatarUrl(seed) {
  return blobatarUri(seed ? String(seed) : ANONYMOUS_SEED);
}

export function roboHashUrl(pubkeyHex) {
  return generatedAvatarUrl(pubkeyHex);
}

export function roboHashGroupUrl(groupSeed) {
  return generatedAvatarUrl(groupSeed);
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
  const bytes = typeof privkeyBytes === "string" ? hexToBytes(privkeyBytes) : privkeyBytes;
  const pubkeyHex = bytesToHex(ed25519.getPublicKey(bytes));
  const owner = `ed25519:${pubkeyHex}`;

  let collection = eventTemplate.collection;
  let labels = eventTemplate.labels ? [...eventTemplate.labels] : [];
  let blobs = eventTemplate.blobs ? [...eventTemplate.blobs] : [];

  if (!collection) {
    if (eventTemplate.kind === 4) {
      collection = "chat/dm";
    } else if (eventTemplate.kind === 1) {
      const tTag = eventTemplate.tags?.find((t) => t[0] === "t")?.[1];
      if (tTag?.startsWith("gupt_note")) collection = "vault/notes";
      else if (tTag?.startsWith("gupt_password")) collection = "vault/passwords";
      else if (tTag?.startsWith("gupt_bookmark")) collection = "vault/bookmarks";
      else if (tTag?.startsWith("gupt_feed")) collection = "feed";
      else collection = "vault/items";
    } else if (eventTemplate.kind === 0) {
      collection = "profiles";
    } else if (eventTemplate.kind === 20004) {
      collection = "calls/signal";
    } else if (eventTemplate.kind === 21004) {
      collection = "chat/typing";
    } else {
      collection = "events";
    }
  }

  if (!labels.length && Array.isArray(eventTemplate.tags)) {
    for (const t of eventTemplate.tags) {
      if (!Array.isArray(t) || !t[1]) continue;
      if (t[0] === "t" || t[0] === "p" || t[0] === "d") {
        const val = String(t[1]).slice(0, 64);
        if (/^[A-Za-z0-9:_.\-+/]{1,64}$/.test(val)) {
          labels.push(val);
        }
      }
    }
  }
  labels = [
    ...new Set(labels.filter((l) => typeof l === "string" && /^[A-Za-z0-9:_.\-+/]{1,64}$/.test(l))),
  ].slice(0, 10);

  collection = String(collection || "events")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]/g, "")
    .slice(0, 32);
  if (!collection) collection = "events";

  blobs = [
    ...new Set(blobs.filter((b) => typeof b === "string" && /^[a-f0-9]{64}$/.test(b))),
  ].slice(0, 8);

  const now = Math.floor(Date.now() / 1000);
  const createdAt = eventTemplate.created_at || now;
  const maxExpiry = createdAt + 300 * 24 * 60 * 60;

  let expiresAt = eventTemplate.expires_at;
  if (!expiresAt) {
    const expTag = eventTemplate.tags?.find((t) => t[0] === "expiration")?.[1];
    expiresAt = expTag ? Number(expTag) : createdAt + 30 * 24 * 60 * 60;
  }
  if (expiresAt <= createdAt) {
    expiresAt = createdAt + 30 * 24 * 60 * 60;
  } else if (expiresAt > maxExpiry) {
    expiresAt = maxExpiry;
  }

  const data = eventTemplate.data || {};
  if (eventTemplate.content && !data.content && !data.ciphertext) {
    data.content = eventTemplate.content;
  }
  if (eventTemplate.kind !== undefined) {
    data.kind = eventTemplate.kind;
  }
  if (eventTemplate.tags) {
    data.tags = eventTemplate.tags;
  }

  const envelope = {
    blobs,
    collection,
    created_at: createdAt,
    data,
    expires_at: expiresAt,
    labels,
    owner,
  };

  const signed = signRabtaEvent(envelope, bytes);

  signed.pubkey = pubkeyHex;
  signed.content = eventTemplate.content || "";
  signed.tags = eventTemplate.tags || [];
  signed.kind = eventTemplate.kind;
  return signed;
}

export function getPublicKey(privkeyBytes) {
  const bytes = typeof privkeyBytes === "string" ? hexToBytes(privkeyBytes) : privkeyBytes;
  return bytesToHex(ed25519.getPublicKey(bytes));
}
