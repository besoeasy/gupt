#!/usr/bin/env node
// gupt-notify — send one end-to-end encrypted line to a gupt inbox via a Rabta relay.
//
// Usage:
//   node scripts/gupt-notify.mjs --relay <url> --key <gupt pubkey> "[myapp] booted"
//   echo "text" | node scripts/gupt-notify.mjs --relay <url> --key <gupt pubkey>
//
// The device key used for signing is generated once and persisted at
// ~/.gupt/notify/device-key (or --key-file / GUPT_NOTIFY_KEY_FILE), so every
// message from this machine comes from the same contact in the user's inbox.
//
// Full agent instructions live in SKILL.md at the repo root.

import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { gcm } from "@noble/ciphers/aes.js";
import { webcrypto } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_KEY_FILE = path.join(homedir(), ".gupt", "notify", "device-key");
const EXPIRY_DAYS = 30;

const HELP = `gupt-notify — message the user's gupt inbox, end-to-end encrypted.

Usage:
  gupt-notify --relay <url> --key <gupt pubkey> "message text"
  cat output.log | gupt-notify --relay <url> --key <gupt pubkey>
  gupt-notify --relay <url> --key <gupt pubkey> --attach report.pdf "see attached"

Flags:
  --relay <url>       Rabta relay base URL(s), comma-separated (or $GUPT_RELAY).
                      Events and blobs are published to every listed relay.
  --key <hex>         Admin gupt public key, 64 hex chars (or $GUPT_ADMIN_KEY)
  --key-file <path>   Device key file (default: ~/.gupt/notify/device-key,
                      or $GUPT_NOTIFY_KEY_FILE)
  --attach <path>     Encrypt and attach a file; it renders in the chat
  --source <tag>      Payload source label, default "notify"
  --json              Print the result as JSON
  -h, --help          This help

Ask the user for the relay and their public key; never guess them.`;

// ─── Small helpers ───────────────────────────────────────────────────────────

function normalizePubkey(value) {
  const hex = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^(ed25519|x25519):/, "");
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
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

// ─── Device key (generated once, persisted on disk) ──────────────────────────

async function loadDeviceKey(keyFile) {
  const file = keyFile || process.env.GUPT_NOTIFY_KEY_FILE || DEFAULT_KEY_FILE;
  let raw = "";
  try {
    raw = (await readFile(file, "utf8")).trim();
  } catch {
    raw = "";
  }
  if (/^[0-9a-f]{64}$/.test(raw)) {
    const privkeyHex = raw;
    return {
      privkeyHex,
      pubkeyHex: bytesToHex(ed25519.getPublicKey(hexToBytes(privkeyHex))),
      file,
      created: false,
    };
  }
  if (raw) {
    throw new Error(`device key at ${file} is not a 64-char hex ed25519 key`);
  }
  const privkeyHex = bytesToHex(ed25519.keygen().secretKey);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${privkeyHex}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  return {
    privkeyHex,
    pubkeyHex: bytesToHex(ed25519.getPublicKey(hexToBytes(privkeyHex))),
    file,
    created: true,
  };
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

function getSharedSecret(privBytes, peerPubkeyHex) {
  const shared = x25519.getSharedSecret(
    ed25519PrivToX25519(privBytes),
    ed25519PubToX25519(peerPubkeyHex),
  );
  return sha256(shared);
}

// ─── Attachments (RABTA1-sealed files, rendered by the chat) ─────────────────

const MIME_BY_EXT = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain",
  log: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "video/webm",
  mp4: "video/mp4",
};

function guessMime(name) {
  const ext = String(name).split(".").pop()?.toLowerCase() || "";
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

/**
 * Seal bytes into a RABTA1 container — identical format to gupt's sealBlob:
 * "RABTA1"(6B) | ver(1)=1 | salt(16B) | ciphertext(min 25B) | tag(16B).
 * Key and nonce are derived with HKDF-SHA256(info "rabta/blob/v1", 44 bytes).
 */
function sealRabta1(plaintext, secretBytes) {
  let plain = plaintext;
  if (plain.length < 25) {
    const padded = new Uint8Array(25);
    padded.set(plain, 0);
    plain = padded;
  }
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const km = hkdf(sha256, secretBytes, salt, new TextEncoder().encode("rabta/blob/v1"), 44);
  const encrypted = gcm(km.subarray(0, 32), km.subarray(32, 44)).encrypt(plain);

  const out = new Uint8Array(7 + salt.length + encrypted.length);
  out.set(new TextEncoder().encode("RABTA1"), 0);
  out.set([1], 6);
  out.set(salt, 7);
  out.set(encrypted, 7 + salt.length);
  return out;
}

/** Upload a sealed container to every relay; blobs are content-addressed sha256. */
async function uploadBlob(relays, bytes) {
  const settled = await Promise.allSettled(
    relays.map(async (relay) => {
      const res = await fetch(`${relay}/api/v1/blobs`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.hash) {
        throw new Error(data.error || `Blob upload failed (${res.status})`);
      }
      return data.hash;
    }),
  );
  const hashes = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!hashes.length) {
    throw new Error(settled[0]?.reason?.message || "Blob upload failed on every relay");
  }
  return hashes[0];
}

/**
 * Split plaintext into up to 8 equal parts so no blob outgrows a relay's
 * blob size limit; small files stay a single part. Mirrors gupt's
 * BLOB_SPLIT_THRESHOLD (2MB) / BLOB_MAX_PARTS (8).
 */
function splitParts(bytes, partCount) {
  const parts = Math.max(1, Math.min(Math.floor(partCount), Math.max(1, Math.floor(bytes.length / 25))));
  if (parts <= 1 || bytes.length === 0) return [bytes];
  const per = Math.ceil(bytes.length / parts);
  const out = [];
  for (let start = 0; start < bytes.length; start += per) {
    out.push(bytes.subarray(start, Math.min(start + per, bytes.length)));
  }
  return out;
}

/** Build the DM plaintext: type/text/ts is what the chat UI renders. */
function buildPayload({ text, source, media }) {
  return JSON.stringify(
    media
      ? { type: "media", text, ts: Date.now(), source, media, durationMs: 0 }
      : { type: "text", text, ts: Date.now(), source },
  );
}

// ─── Send ────────────────────────────────────────────────────────────────────

async function send({ relays, target, payload, blobHashes = [] }, device) {
  const privBytes = hexToBytes(device.privkeyHex);

  const key = getSharedSecret(privBytes, target);
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = gcm(key, nonce).encrypt(new TextEncoder().encode(payload));
  const nonceB64 = toBase64(nonce);
  const cipherB64 = toBase64(ciphertext);

  const now = Math.floor(Date.now() / 1000);
  const expires = now + EXPIRY_DAYS * 24 * 60 * 60;
  const envelope = {
    blobs: [...new Set(blobHashes.map((h) => String(h).toLowerCase()))],
    collection: "gupt/chat/dm",
    created_at: now,
    data: { v: 1, nonce: nonceB64, ciphertext: cipherB64 },
    expires_at: expires,
    labels: ["gupt-dm", target],
    owner: `ed25519:${device.pubkeyHex}`,
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
      ["expiration", String(expires)],
    ],
  };

  const settled = await Promise.allSettled(
    relays.map(async (relay) => {
      const res = await fetch(`${relay}/api/v1/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Relay returned ${res.status}`);
      return data.id || event.id;
    }),
  );
  const ids = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!ids.length) {
    return {
      ok: false,
      id: event.id,
      status: 0,
      error: settled[0]?.reason?.message || `Publish failed on every relay`,
    };
  }
  return { ok: true, id: ids[0] };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { relay: "", key: "", keyFile: "", source: "notify", attach: "", json: false, text: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--relay":
      case "--key":
      case "--key-file":
      case "--source":
      case "--attach": {
        const value = argv[++i];
        if (value === undefined) throw new Error(`${arg} needs a value`);
        opts[{
          "--relay": "relay",
          "--key": "key",
          "--key-file": "keyFile",
          "--source": "source",
          "--attach": "attach",
        }[arg]] = value;
        break;
      }
      case "--json":
        opts.json = true;
        break;
      case "-h":
      case "--help":
        console.log(HELP);
        process.exit(0);
        break;
      default:
        if (arg.startsWith("--")) throw new Error(`unknown flag ${arg} (see --help)`);
        opts.text.push(arg);
    }
  }
  return { ...opts, text: opts.text.join(" ") };
}

function readStdin() {
  return new Promise((resolve) => {
    let out = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (out += chunk));
    process.stdin.on("end", () => resolve(out));
  });
}

/** GUPT_RELAY accepts one URL or a comma-separated list of them. */
function parseRelays(value) {
  return String(value || "")
    .split(",")
    .map((r) => r.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let text = opts.text;
  if (!text && !process.stdin.isTTY) text = (await readStdin()).trim();

  const relays = parseRelays(opts.relay || process.env.GUPT_RELAY);
  const target = normalizePubkey(opts.key || process.env.GUPT_ADMIN_KEY || "");

  if (!relays.length) throw new Error("no relay: pass --relay or set GUPT_RELAY");
  if (!target) throw new Error("no admin key: pass --key (64 hex chars) or set GUPT_ADMIN_KEY");
  if (!text && !opts.attach) {
    throw new Error("nothing to send: pass text as an argument or pipe it on stdin");
  }

  const device = await loadDeviceKey(opts.keyFile);

  let payload;
  let blobHashes = [];
  if (opts.attach) {
    // Encrypt the file under its own key, upload the sealed containers, and
    // reference every part from the event — the chat pulls, verifies and
    // renders it. Files over 2MB are split into 8 equal parts, each sealed
    // as its own RABTA1 container under the same mediaKey (per-part salt).
    const fileBytes = new Uint8Array(await readFile(opts.attach));
    const name = basename(opts.attach);
    const mediaKey = webcrypto.getRandomValues(new Uint8Array(32));
    const mediaNonce = webcrypto.getRandomValues(new Uint8Array(12));
    const partCount = fileBytes.byteLength > 2 * 1024 * 1024 ? 8 : 1;
    const parts = [];
    for (const chunk of splitParts(fileBytes, partCount)) {
      parts.push(await uploadBlob(relays, sealRabta1(chunk, mediaKey)));
    }
    payload = buildPayload({
      text: text || name,
      source: opts.source,
      media: {
        key: toBase64(mediaKey),
        nonce: toBase64(mediaNonce),
        mime: guessMime(name),
        name,
        size: fileBytes.byteLength,
        parts,
      },
    });
    blobHashes = parts;
  } else {
    payload = buildPayload({ text, source: opts.source });
  }

  const result = await send({ relays, target, payload, blobHashes }, device);

  if (!result.ok) throw new Error(result.error || `Relay returned ${result.status}`);

  if (opts.json) {
    const out = { ok: true, id: result.id, sender: device.pubkeyHex, to: target, relay: relays.join(",") };
    if (blobHashes.length) out.blobs = blobHashes;
    console.log(JSON.stringify(out));
  } else {
    console.log(`sent ${result.id.slice(0, 12)}… → ${relays.join(", ")}`);
    if (blobHashes.length) console.log(`attached ${blobHashes.length} blob(s), first ${blobHashes[0].slice(0, 12)}…`);
    if (device.created) console.log(`device key created at ${device.file} (pubkey ${device.pubkeyHex})`);
  }
}

main().catch((err) => {
  console.error(`gupt-notify: ${err?.message || err}`);
  process.exit(1);
});
