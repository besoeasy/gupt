#!/usr/bin/env node
// gupt-bot-beacon — announce a public bot on Rabta relays every 24 hours.
//
// Usage:
//   node docs/gupt-bot-beacon.mjs --name poll-bot \
//     --description "Creates polls in group chats" \
//     --owner "Acme" --website https://example.com/poll-bot \
//     --relay https://rabta.gupt.app --once
//
// Run without --once to keep beating every 24 hours (± jitter). The key is
// generated once at ~/.gupt/bot/key and is the bot's whole identity: keep it,
// or the bot comes back as a stranger. Protocol reference: docs/bots.md.

import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const COLLECTION = "gupt/bot/beacon";
const TTL_SECONDS = 30 * 60 * 60;
const BEAT_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const JITTER_MS = 5 * 60 * 1000;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 280;
const MAX_OWNER = 80;
const MAX_WEBSITE = 300;
const DEFAULT_RELAYS = ["https://rabta.gupt.app", "https://1.rabta.space"];
const DEFAULT_KEY_FILE =
  process.env.GUPT_BOT_KEY_FILE || path.join(homedir(), ".gupt", "bot", "key");

const HELP = `gupt-bot-beacon — list a bot in gupt's /bots directory.

Usage:
  gupt-bot-beacon --name <name> [options]

Flags:
  --relay <url>        Relay base URL(s), comma-separated (or $GUPT_RELAY).
                       Default: ${DEFAULT_RELAYS.join(",")}
  --name <text>        Bot name, 1-${MAX_NAME} chars (required)
  --description <text> What the bot does, 0-${MAX_DESCRIPTION} chars
  --owner <text>       Who runs it, 0-${MAX_OWNER} chars (a claim, not proof)
  --website <url>      http(s) link, 0-${MAX_WEBSITE} chars
  --key-file <path>    Bot key file (default: ~/.gupt/bot/key,
                       or $GUPT_BOT_KEY_FILE)
  --once               Publish one beacon and exit (cron/systemd mode)
  --json               Print one JSON line per beat
  -h, --help           This help

Without --once the script stays running and publishes every 24 hours.
Each beacon lives 30 hours, so a bot stays listed through a late beat.
Keep the key file: the bot's public key is its identity.`;

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeWebsite(value) {
  const raw = cleanText(value, MAX_WEBSITE);
  if (!raw) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`--website is not a URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("--website must be http:// or https://");
  }
  return url.href;
}

function parseRelays(value) {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map((relay) => relay.trim().replace(/\/+$/, ""))
        .filter(Boolean),
    ),
  ];
}

async function loadBotKey(keyFile) {
  const file = keyFile || DEFAULT_KEY_FILE;
  let raw = "";
  try {
    raw = (await readFile(file, "utf8")).trim();
  } catch {
    raw = "";
  }
  if (/^[0-9a-f]{64}$/.test(raw)) {
    return {
      privkeyHex: raw,
      pubkeyHex: bytesToHex(ed25519.getPublicKey(hexToBytes(raw))),
      file,
      created: false,
    };
  }
  if (raw) throw new Error(`bot key at ${file} is not a 64-char hex ed25519 key`);

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

function buildBeacon({ name, description, owner, website }, key) {
  const now = Math.floor(Date.now() / 1000);
  const envelope = {
    blobs: [],
    collection: COLLECTION,
    created_at: now,
    data: { v: 1, name, description, owner, website },
    expires_at: now + TTL_SECONDS,
    labels: [],
    owner: `ed25519:${key.pubkeyHex}`,
  };
  const digest = sha256(new TextEncoder().encode(canonical(envelope)));
  return {
    ...envelope,
    id: bytesToHex(digest),
    sig: bytesToHex(ed25519.sign(digest, hexToBytes(key.privkeyHex))),
  };
}

async function publish(relays, event) {
  const settled = await Promise.allSettled(
    relays.map(async (relay) => {
      const res = await fetch(`${relay}/api/v1/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return { relay, ok: true, duplicate: data.status === "duplicate" };
    }),
  );

  const results = settled.map((item, index) =>
    item.status === "fulfilled"
      ? item.value
      : { relay: relays[index], ok: false, error: item.reason?.message || "publish failed" },
  );
  return { ok: results.some((r) => r.ok), results };
}

function parseArgs(argv) {
  const opts = {
    relay: "",
    name: "",
    description: "",
    owner: "",
    website: "",
    keyFile: "",
    once: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--relay":
      case "--name":
      case "--description":
      case "--owner":
      case "--website":
      case "--key-file": {
        const value = argv[++i];
        if (value === undefined) throw new Error(`${arg} needs a value`);
        opts[
          {
            "--relay": "relay",
            "--name": "name",
            "--description": "description",
            "--owner": "owner",
            "--website": "website",
            "--key-file": "keyFile",
          }[arg]
        ] = value;
        break;
      }
      case "--once":
        opts.once = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "-h":
      case "--help":
        console.log(HELP);
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument ${arg} (see --help)`);
    }
  }
  return opts;
}

async function beat(opts, key) {
  const beacon = buildBeacon(
    {
      name: cleanText(opts.name, MAX_NAME),
      description: cleanText(opts.description, MAX_DESCRIPTION),
      owner: cleanText(opts.owner, MAX_OWNER),
      website: normalizeWebsite(opts.website),
    },
    key,
  );
  const relays = parseRelays(opts.relay || process.env.GUPT_RELAY);
  const targets = relays.length ? relays : DEFAULT_RELAYS;
  const result = await publish(targets, beacon);

  if (opts.json) {
    console.log(
      JSON.stringify({
        ok: result.ok,
        id: beacon.id,
        bot: `ed25519:${key.pubkeyHex}`,
        expiresAt: beacon.expires_at,
        relays: result.results,
      }),
    );
  } else if (result.ok) {
    const delivered = result.results.filter((r) => r.ok).length;
    console.log(
      `beacon ${beacon.id.slice(0, 12)}… → ${delivered}/${targets.length} relay(s); ` +
        `bot ed25519:${key.pubkeyHex}`,
    );
  } else {
    for (const r of result.results) {
      console.error(`  ${r.relay}: ${r.error}`);
    }
    console.error(`beacon ${beacon.id.slice(0, 12)}… failed on every relay`);
  }
  return result.ok;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  opts.name = cleanText(opts.name, MAX_NAME);
  if (!opts.name) throw new Error("no bot name: pass --name (see --help)");

  const key = await loadBotKey(opts.keyFile);
  if (key.created && !opts.json) {
    console.log(`bot key created at ${key.file}`);
    console.log(`bot pubkey: ed25519:${key.pubkeyHex}`);
  }

  for (;;) {
    const ok = await beat(opts, key);
    if (opts.once) process.exit(ok ? 0 : 1);
    const delay = ok ? BEAT_MS + (Math.random() * 2 - 1) * JITTER_MS : RETRY_MS;
    if (!opts.json) {
      console.log(`next beat in ${Math.round(delay / 60000)} min`);
    }
    await sleep(delay);
  }
}

main().catch((err) => {
  console.error(`gupt-bot-beacon: ${err?.message || err}`);
  process.exit(1);
});
