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
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { gcm } from "@noble/ciphers/aes.js";
import { webcrypto } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_KEY_FILE = path.join(homedir(), ".gupt", "notify", "device-key");
const EXPIRY_DAYS = 30;

const HELP = `gupt-notify — message the user's gupt inbox, end-to-end encrypted.

Usage:
  gupt-notify --relay <url> --key <gupt pubkey> "message text"
  cat output.log | gupt-notify --relay <url> --key <gupt pubkey>

Flags:
  --relay <url>       Rabta relay base URL (or $GUPT_RELAY)
  --key <hex>         Admin gupt public key, 64 hex chars (or $GUPT_ADMIN_KEY)
  --key-file <path>   Device key file (default: ~/.gupt/notify/device-key,
                      or $GUPT_NOTIFY_KEY_FILE)
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

// ─── Send ────────────────────────────────────────────────────────────────────

async function send({ relay, target, text, source }, device) {
  const privBytes = hexToBytes(device.privkeyHex);

  // gupt's DM payload shape: type/text/ts is what the chat UI renders.
  const payload = JSON.stringify({ type: "text", text, ts: Date.now(), source });

  const key = getSharedSecret(privBytes, target);
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = gcm(key, nonce).encrypt(new TextEncoder().encode(payload));
  const nonceB64 = toBase64(nonce);
  const cipherB64 = toBase64(ciphertext);

  const now = Math.floor(Date.now() / 1000);
  const expires = now + EXPIRY_DAYS * 24 * 60 * 60;
  const envelope = {
    blobs: [],
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

  const res = await fetch(`${relay}/api/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));

  return {
    ok: res.ok,
    id: data.id || event.id,
    status: res.status,
    error: res.ok ? undefined : data.error || `Relay returned ${res.status}`,
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { relay: "", key: "", keyFile: "", source: "notify", json: false, text: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--relay":
      case "--key":
      case "--key-file":
      case "--source": {
        const value = argv[++i];
        if (value === undefined) throw new Error(`${arg} needs a value`);
        opts[{
          "--relay": "relay",
          "--key": "key",
          "--key-file": "keyFile",
          "--source": "source",
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let text = opts.text;
  if (!text && !process.stdin.isTTY) text = (await readStdin()).trim();

  const relay = (opts.relay || process.env.GUPT_RELAY || "").trim().replace(/\/+$/, "");
  const target = normalizePubkey(opts.key || process.env.GUPT_ADMIN_KEY || "");

  if (!relay) throw new Error("no relay: pass --relay or set GUPT_RELAY");
  if (!target) throw new Error("no admin key: pass --key (64 hex chars) or set GUPT_ADMIN_KEY");
  if (!text) throw new Error("nothing to send: pass text as an argument or pipe it on stdin");

  const device = await loadDeviceKey(opts.keyFile);
  const result = await send({ relay, target, text, source: opts.source }, device);

  if (!result.ok) throw new Error(result.error || `Relay returned ${result.status}`);

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, id: result.id, sender: device.pubkeyHex, to: target, relay }));
  } else {
    console.log(`sent ${result.id.slice(0, 12)}… → ${relay}`);
    if (device.created) console.log(`device key created at ${device.file} (pubkey ${device.pubkeyHex})`);
  }
}

main().catch((err) => {
  console.error(`gupt-notify: ${err?.message || err}`);
  process.exit(1);
});
