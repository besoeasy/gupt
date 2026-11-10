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

// ─── Secret + PIN ─────────────────────────────────────────────────────────────
//
// Two factors mixed into one key: the secret (text pasted, or a file's SHA-256)
// is something you know or have, the PIN is something you remember. A leaked
// secret or a copied photo alone derives nothing without the PIN. The material
// is tagged so a pinless identity can never reach this key.

export const PIN_MIN_CHARS = 6;

export function normalizeSecretPin(raw) {
  return String(raw ?? "").trim();
}

export function isValidSecretPin(pin) {
  return normalizeSecretPin(pin).length >= PIN_MIN_CHARS;
}

/**
 * Entropy of the PIN as actually typed: each character class (digits, lower,
 * upper, symbols) adds to the alphabet size. A lower bound — repeated patterns
 * are always weaker than this estimate, which is why 6 is the floor, not the
 * ideal use.
 */
export function secretPinEntropyBits(pin) {
  const value = normalizeSecretPin(pin);
  if (!value) return 0;
  let alphabet = 0;
  if (/[0-9]/.test(value)) alphabet += 10;
  if (/[a-z]/.test(value)) alphabet += 26;
  if (/[A-Z]/.test(value)) alphabet += 26;
  if (/[^0-9a-zA-Z]/.test(value)) alphabet += 33;
  if (alphabet === 0) alphabet = 10;
  return Math.round(value.length * Math.log2(alphabet));
}

/**
 * One Argon2id pass over the tagged secret + PIN material.
 *
 * `secret` is whatever the user typed on /welcome/secret, or the SHA-256
 * produced by hashSecretFile() on /welcome/file — both are opaque text here.
 * The PIN must be at least 6 characters, letters or digits. It is what
 * survives the compromise of the secret itself.
 *
 * t=4 (instead of the t=3 of the old standalone methods) because the PIN
 * space can be small: the extra iteration makes each guess costlier. It does
 * not turn a weak PIN into a strong one — it only makes guessing expensive.
 */
export function derivePrivkeyFromSecretAndPin(secret, pin) {
  const text = String(secret || "").trim();
  if (!text) throw new Error("Paste a secret or choose a file first.");

  const code = normalizeSecretPin(pin);
  if (code.length < PIN_MIN_CHARS) {
    throw new Error(`Enter a PIN of at least ${PIN_MIN_CHARS} letters or digits.`);
  }

  const encoder = new TextEncoder();
  const bytes = argon2id(
    encoder.encode(`gupt-secret-pin-v1\0${text}\0${code}`),
    encoder.encode("gupt-secret-pin-kdf-v1"),
    { t: 4, m: 65536, p: 1, dkLen: 32 },
  );

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizePubkey(value) {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^(ed25519|x25519):/, "");
  if (/^[0-9a-f]{64}$/.test(normalized)) return normalized;
  return null;
}

export const normalizeNostrPubkey = normalizePubkey;

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
  const nonceB64 = bytesToBase64(nonce);
  const cipherB64 = bytesToBase64(ciphertext);
  return {
    v: 1,
    nonce: nonceB64,
    ciphertext: cipherB64,
    toString() {
      return `v1:${nonceB64}:${cipherB64}`;
    },
  };
}

export async function aesDecrypt(keyBytes, input) {
  let nonceBytes;
  let ciphertextBytes;

  if (typeof input === "string") {
    const parts = input.split(":");
    if (parts[0] !== "v1") throw new Error(`Unknown ciphertext version: ${parts[0]}`);
    nonceBytes = base64ToBytes(parts[1]);
    ciphertextBytes = base64ToBytes(parts[2]);
  } else if (input && typeof input === "object") {
    const obj = input.data && typeof input.data === "object" ? input.data : input;
    if (obj.ciphertext && obj.nonce) {
      if (obj.v !== undefined && obj.v !== 1) {
        throw new Error(`Unknown ciphertext version: ${obj.v}`);
      }
      nonceBytes = typeof obj.nonce === "string" ? base64ToBytes(obj.nonce) : obj.nonce;
      ciphertextBytes =
        typeof obj.ciphertext === "string" ? base64ToBytes(obj.ciphertext) : obj.ciphertext;
    } else if (typeof obj.content === "string") {
      return aesDecrypt(keyBytes, obj.content);
    } else {
      throw new Error("Invalid encrypted payload object");
    }
  } else {
    throw new Error("Invalid ciphertext input");
  }

  const plain = gcm(keyBytes, nonceBytes).decrypt(ciphertextBytes);
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
      collection = "gupt/chat/dm";
    } else if (eventTemplate.kind === 1) {
      const tTag = eventTemplate.tags?.find((t) => t[0] === "t")?.[1];
      if (tTag?.startsWith("gupt_note")) collection = "gupt/vault/notes";
      else if (tTag?.startsWith("gupt_password")) collection = "gupt/vault/passwords";
      else if (tTag?.startsWith("gupt_bookmark")) collection = "gupt/vault/bookmarks";
      else if (tTag?.startsWith("gupt_feed")) collection = "gupt/feed";
      else collection = "gupt/vault/items";
    } else if (eventTemplate.kind === 0) {
      collection = "gupt/profiles";
    } else if (eventTemplate.kind === 20004) {
      collection = "gupt/calls/signal";
    } else {
      collection = "gupt/events";
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

  const isShortLived = collection === "gupt/calls/signal";
  const defaultTtlSeconds = isShortLived ? 24 * 60 * 60 : 30 * 24 * 60 * 60;

  let expiresAt = eventTemplate.expires_at;
  if (!expiresAt) {
    const expTag = eventTemplate.tags?.find((t) => t[0] === "expiration")?.[1];
    expiresAt = expTag ? Number(expTag) : createdAt + defaultTtlSeconds;
  }
  if (isShortLived) {
    expiresAt = Math.min(expiresAt, createdAt + 24 * 60 * 60);
  }
  if (expiresAt <= createdAt) {
    expiresAt = createdAt + defaultTtlSeconds;
  } else if (expiresAt > maxExpiry) {
    expiresAt = maxExpiry;
  }

  let data;
  if (eventTemplate.data && typeof eventTemplate.data === "object") {
    data = { ...eventTemplate.data };
  } else if (eventTemplate.content && typeof eventTemplate.content === "object") {
    data = { ...eventTemplate.content };
  } else if (typeof eventTemplate.content === "string") {
    if (eventTemplate.content.startsWith("v1:")) {
      const parts = eventTemplate.content.split(":");
      data = {
        v: 1,
        nonce: parts[1],
        ciphertext: parts[2],
      };
    } else {
      data = { content: eventTemplate.content };
    }
  } else {
    data = {};
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
  signed.content =
    data.ciphertext && data.nonce
      ? `v1:${data.nonce}:${data.ciphertext}`
      : typeof data.content === "string"
        ? data.content
        : "";
  signed.tags = eventTemplate.tags || [];
  signed.kind = eventTemplate.kind;
  return signed;
}

export function getPublicKey(privkeyBytes) {
  const bytes = typeof privkeyBytes === "string" ? hexToBytes(privkeyBytes) : privkeyBytes;
  return bytesToHex(ed25519.getPublicKey(bytes));
}
