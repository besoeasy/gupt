#!/usr/bin/env node
/**
 * relay-builder.js
 *
 * Reads relay URLs from relay.txt (one per line), tests each relay for
 * Kind 1 (public notes) and Kind 4 (encrypted DMs) support, then rewrites
 * DEFAULT_RELAYS in src/config/servers.js with only the working ones.
 *
 * Usage:
 *   node relay-builder.js [--relay-file path/to/relay.txt] [--timeout 5000] [--concurrency 5]
 *
 * Flags:
 *   --relay-file    Path to relay list file  (default: relay.txt)
 *   --timeout       Per-relay test timeout ms (default: 6000)
 *   --concurrency   Parallel relay tests      (default: 5)
 *   --dry-run       Print results but don't write servers.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ARGS = parseArgs(process.argv.slice(2));
const RELAY_FILE = ARGS["relay-file"] ?? path.join(__dirname, "relay.txt");
const TIMEOUT_MS = Number(ARGS["timeout"] ?? 6000);
const CONCURRENCY = Number(ARGS["concurrency"] ?? 5);
const DRY_RUN = "dry-run" in ARGS;
const SERVERS_JS = path.join(__dirname, "src", "config", "servers.js");

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

function ok(msg) {
  console.log(`  ${GREEN}✓${RESET} ${msg}`);
}
function fail(msg) {
  console.log(`  ${RED}✗${RESET} ${msg}`);
}
function info(msg) {
  console.log(`  ${CYAN}·${RESET} ${msg}`);
}

// ---------------------------------------------------------------------------
// Relay testing
// ---------------------------------------------------------------------------

/**
 * Open a WebSocket to a relay and run a single test subscription.
 * Resolves true if at least one EVENT or EOSE is received before timeout,
 * meaning the relay accepted the filter without closing with an error.
 *
 * @param {string}   url     wss:// relay URL
 * @param {object[]} filters Nostr REQ filters
 * @returns {Promise<{ ok: boolean, reason: string, latencyMs: number }>}
 */
function testFilter(url, filters) {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;

    function done(ok, reason) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch (_) {}
      resolve({ ok, reason, latencyMs: Date.now() - start });
    }

    const timer = setTimeout(() => done(false, "timeout"), TIMEOUT_MS);

    let ws;
    try {
      ws = new WebSocket(url, { handshakeTimeout: TIMEOUT_MS });
    } catch (err) {
      return done(false, `bad url: ${err.message}`);
    }

    ws.on("error", (err) => done(false, err.message));

    ws.on("open", () => {
      const subId = "rb_" + Math.random().toString(36).slice(2, 8);
      try {
        ws.send(JSON.stringify(["REQ", subId, ...filters]));
      } catch (err) {
        done(false, `send error: ${err.message}`);
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const type = msg[0];
        if (type === "EVENT" || type === "EOSE") {
          done(true, type === "EVENT" ? "received event" : "EOSE received");
        } else if (type === "NOTICE") {
          // Some relays send NOTICE on unsupported filters — treat as soft fail
          // but keep waiting for EOSE in case they still respond.
          // We don't resolve yet.
        } else if (type === "CLOSED") {
          done(false, `CLOSED: ${msg[2] ?? "no reason"}`);
        }
      } catch (_) {}
    });

    ws.on("close", () => {
      // If we closed before settling, the relay dropped us.
      done(false, "connection closed");
    });
  });
}

/**
 * Test a relay for Kind 1 and Kind 4 support.
 *
 * Kind 1 test: fetch up to 1 recent note (limit:1, since: 10 min ago)
 * Kind 4 test: subscribe to encrypted DMs to/from a well-known pubkey
 *              (we use a real active Nostr pubkey so there's likely traffic)
 */
async function testRelay(url) {
  const now = Math.floor(Date.now() / 1000);
  const tenMinutesAgo = now - 600;

  // Kind 1 — public notes (most relays always have these)
  const kind1 = await testFilter(url, [
    { kinds: [1], limit: 1, since: tenMinutesAgo },
  ]);

  // Kind 4 — encrypted DMs; most relays require author/recipient filter.
  // We use jb55's pubkey (prominent Nostr dev) as a known active participant.
  const kind4 = await testFilter(url, [
    {
      kinds: [4],
      limit: 1,
      since: now - 86400, // last 24 h
      authors: [
        "32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245",
      ],
    },
  ]);

  return { kind1, kind4 };
}

// ---------------------------------------------------------------------------
// Async concurrency pool
// ---------------------------------------------------------------------------

async function asyncPool(limit, items, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// servers.js patcher
// ---------------------------------------------------------------------------

/**
 * Replace the DEFAULT_RELAYS array in servers.js with `relays`.
 * Preserves all other content in the file exactly.
 */
function patchServersJs(relays) {
  const src = fs.readFileSync(SERVERS_JS, "utf8");

  // Match: export const DEFAULT_RELAYS = Object.freeze([ ... ]);
  const re = /export const DEFAULT_RELAYS = Object\.freeze\(\[[\s\S]*?\]\);/;

  if (!re.test(src)) {
    throw new Error(
      "Could not locate DEFAULT_RELAYS in servers.js — pattern not found."
    );
  }

  const entries = relays.map((r) => `  "${r}"`).join(",\n");
  const replacement = `export const DEFAULT_RELAYS = Object.freeze([\n${entries},\n]);`;

  const patched = src.replace(re, replacement);
  fs.writeFileSync(SERVERS_JS, patched, "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log();
  console.log(`${BOLD}relay-builder${RESET}  —  Nostr relay health checker`);
  console.log(`${DIM}${"─".repeat(52)}${RESET}`);
  console.log(`${DIM}relay file : ${RELAY_FILE}${RESET}`);
  console.log(`${DIM}timeout    : ${TIMEOUT_MS} ms per test${RESET}`);
  console.log(`${DIM}concurrency: ${CONCURRENCY} relays at a time${RESET}`);
  if (DRY_RUN) console.log(`${YELLOW}dry-run mode — servers.js will NOT be modified${RESET}`);
  console.log();

  // Read relay list
  if (!fs.existsSync(RELAY_FILE)) {
    console.error(
      `${RED}Error:${RESET} relay file not found: ${RELAY_FILE}\n` +
        `Create it with one wss:// URL per line.`
    );
    process.exit(1);
  }

  const rawLines = fs.readFileSync(RELAY_FILE, "utf8").split("\n");
  const relays = rawLines
    .map((l) => l.trim().replace(/\/+$/, ""))
    .filter((l) => /^wss?:\/\//i.test(l));

  if (relays.length === 0) {
    console.error(
      `${RED}Error:${RESET} No valid wss:// URLs found in ${RELAY_FILE}`
    );
    process.exit(1);
  }

  console.log(
    `${BOLD}Testing ${relays.length} relay${relays.length !== 1 ? "s" : ""}…${RESET}\n`
  );

  const passing = [];
  const failing = [];

  await asyncPool(CONCURRENCY, relays, async (url) => {
    process.stdout.write(`  ${DIM}${url}${RESET}\r`);

    let result;
    try {
      result = await testRelay(url);
    } catch (err) {
      result = {
        kind1: { ok: false, reason: err.message, latencyMs: 0 },
        kind4: { ok: false, reason: err.message, latencyMs: 0 },
      };
    }

    const { kind1, kind4 } = result;
    const bothOk = kind1.ok && kind4.ok;

    // Clear line
    process.stdout.write(" ".repeat(80) + "\r");

    console.log(
      `  ${bothOk ? GREEN + "✓" : RED + "✗"}${RESET} ${BOLD}${url}${RESET}`
    );
    console.log(
      `       kind:1  ${kind1.ok ? GREEN + "✓" : RED + "✗"}${RESET}` +
        `  ${kind1.reason}  ${DIM}(${kind1.latencyMs}ms)${RESET}`
    );
    console.log(
      `       kind:4  ${kind4.ok ? GREEN + "✓" : RED + "✗"}${RESET}` +
        `  ${kind4.reason}  ${DIM}(${kind4.latencyMs}ms)${RESET}`
    );

    if (bothOk) {
      passing.push({ url, kind1, kind4 });
    } else {
      failing.push({ url, kind1, kind4 });
    }
  });

  // Summary
  console.log();
  console.log(`${DIM}${"─".repeat(52)}${RESET}`);
  console.log(
    `${BOLD}Results:${RESET}  ` +
      `${GREEN}${passing.length} passing${RESET}  ` +
      `${RED}${failing.length} failing${RESET}  ` +
      `out of ${relays.length} total`
  );

  if (passing.length === 0) {
    console.log(
      `\n${YELLOW}Warning:${RESET} No relays passed both tests. servers.js will not be modified.`
    );
    process.exit(0);
  }

  // Sort by average latency (fastest first)
  passing.sort(
    (a, b) =>
      (a.kind1.latencyMs + a.kind4.latencyMs) / 2 -
      (b.kind1.latencyMs + b.kind4.latencyMs) / 2
  );

  const passingUrls = passing.map((r) => r.url);

  console.log(`\n${BOLD}Relays to write (sorted by latency):${RESET}`);
  for (const { url, kind1, kind4 } of passing) {
    const avg = Math.round((kind1.latencyMs + kind4.latencyMs) / 2);
    console.log(`  ${GREEN}✓${RESET}  ${url}  ${DIM}(avg ${avg}ms)${RESET}`);
  }

  if (DRY_RUN) {
    console.log(
      `\n${YELLOW}Dry run — skipping write to${RESET} ${SERVERS_JS}`
    );
    process.exit(0);
  }

  // Patch servers.js
  try {
    patchServersJs(passingUrls);
    console.log(
      `\n${GREEN}✓${RESET} ${BOLD}DEFAULT_RELAYS updated${RESET} in ${path.relative(process.cwd(), SERVERS_JS)}`
    );
  } catch (err) {
    console.error(`\n${RED}Error patching servers.js:${RESET} ${err.message}`);
    process.exit(1);
  }

  console.log();
}

main().catch((err) => {
  console.error(`\n${RED}Unhandled error:${RESET}`, err);
  process.exit(1);
});
