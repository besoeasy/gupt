#!/usr/bin/env node
/**
 * usage-fetch — gupt active-user counts read straight off the default relays.
 *
 * gupt marks every event it publishes with a `t` tag (see src/lib/api.js,
 * notes.js, bookmarks.js, passwords.js, share.js, feed.js), so a plain NIP-01
 * query over those tags is enough to tell who is using the app without
 * reading any encrypted content.
 *
 * Usage:
 *   node bin/usage-fetch.js            human-readable table
 *   node bin/usage-fetch.js --json     machine-readable report
 *
 * Counts are a floor, not exact: relays cap query results, so the 30d window
 * can silently miss older events. The script only asks for tag/relation data,
 * never decrypts or stores anything.
 */

import { setTimeout as delay } from "node:timers/promises";

// Mirrors src/config/servers.js — keep in sync.
const DEFAULT_RELAYS = Object.freeze([
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
  "wss://offchain.pub",
  "wss://purplerelay.com",
]);

// Mirrors src/lib/{api,notes,bookmarks,passwords,share,feed}.js — keep in sync.
const MESSAGING_TAGS = Object.freeze(["gupt-dm", "gupt:group-msg"]);
const VAULT_FEED_TAGS = Object.freeze([
  "gupt_note",
  "gupt_bookmark",
  "gupt_password",
  "gupt_share",
  "gupt_feed",
  "gupt_feed_comment",
  "gupt_feed_reaction",
]);
const ALL_TAGS = new Set([...MESSAGING_TAGS, ...VAULT_FEED_TAGS]);

const SUB_ID = "gupt-usage";
const CONNECT_TIMEOUT_MS = 5_000;
const MAX_WAIT_MS = 10_000;
const PER_FILTER_LIMIT = 500;
const LOOKBACK_SECONDS = 30 * 24 * 60 * 60;

const WINDOWS = Object.freeze([
  Object.freeze(["1h", 60 * 60]),
  Object.freeze(["24h", 24 * 60 * 60]),
  Object.freeze(["7d", 7 * 24 * 60 * 60]),
  Object.freeze(["30d", 30 * 24 * 60 * 60]),
]);

const asJson = process.argv.includes("--json");
const sinceSec = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;

function filters() {
  return [
    { kinds: [4], "#t": [...MESSAGING_TAGS], since: sinceSec, limit: PER_FILTER_LIMIT },
    { kinds: [1], "#t": [...VAULT_FEED_TAGS], since: sinceSec, limit: PER_FILTER_LIMIT },
  ];
}

/**
 * Query one relay until EOSE (or the global cap). Resolves with whatever it
 * managed to receive — a relay that closes early still contributes.
 */
function fetchFromRelay(relay) {
  return new Promise((resolve) => {
    const received = [];
    let settled = false;
    /** @type {WebSocket | null} */
    let ws = null;
    /** @type {NodeJS.Timeout | null} */
    let capTimer = null;

    const finish = (ok, error = null) => {
      if (settled) return;
      settled = true;
      if (capTimer) clearTimeout(capTimer);
      try {
        ws?.close();
      } catch {}
      resolve({ relay, ok, events: received, error });
    };

    try {
      ws = new WebSocket(relay);
    } catch (err) {
      finish(false, String(err?.message || err));
      return;
    }

    onnext(ws, "open", () => {
      try {
        ws.send(JSON.stringify(["REQ", SUB_ID, ...filters()]));
      } catch (err) {
        finish(false, String(err?.message || err));
      }
    });

    onnext(ws, "message", (msg) => {
      if (typeof msg?.data !== "string") return;
      let parsed;
      try {
        parsed = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (!Array.isArray(parsed) || parsed[1] !== SUB_ID) return;

      if (parsed[0] === "EVENT" && parsed[2]?.id) {
        received.push(parsed[2]);
      } else if (parsed[0] === "EOSE") {
        finish(true);
      } else if (parsed[0] === "CLOSED" || parsed[0] === "NOTICE") {
        finish(false, String(parsed[2] || "closed by relay"));
      }
    });

    onnext(ws, "error", (err) => {
      if (received.length) finish(true, "socket error");
      else finish(false, err?.message || "connection error");
    });

    onnext(ws, "close", () => {
      if (received.length) finish(true, "closed before EOSE");
      else finish(false, "closed before any event");
    });

    // Alive-but-silent sockets: the cap is the real timeout for the query,
    // plus a beat for the handshake itself.
    capTimer = setTimeout(() => finish(false, "timed out"), CONNECT_TIMEOUT_MS + MAX_WAIT_MS);
  });
}

function onnext(target, type, handler) {
  target.addEventListener(type, handler);
}

function aggregate(relayResults) {
  const seenIds = new Set();
  const lastActive = new Map(); // pubkey -> latest created_at (sec)
  const byTag = new Map();
  const byRelay = [];

  for (const result of relayResults) {
    let counted = 0;
    for (const event of result.events) {
      if (seenIds.has(event.id)) continue;
      seenIds.add(event.id);
      counted++;

      const createdAt = Number(event.created_at) || 0;
      lastActive.set(event.pubkey, Math.max(lastActive.get(event.pubkey) || 0, createdAt));

      const matched = new Set();
      for (const tag of event.tags || []) {
        if (tag[0] === "t" && ALL_TAGS.has(tag[1])) matched.add(tag[1]);
      }
      if (!matched.size) matched.add("(untagged)");
      for (const tag of matched) byTag.set(tag, (byTag.get(tag) || 0) + 1);
    }
    byRelay.push({ ...result, received: result.events.length, counted });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const windows = {};
  for (const [label, seconds] of WINDOWS) {
    const cutoff = nowSec - seconds;
    let count = 0;
    for (const lastSeen of lastActive.values()) {
      if (lastSeen >= cutoff) count++;
    }
    windows[label] = count;
  }

  return {
    windows,
    byTag: [...byTag.entries()].sort((a, b) => b[1] - a[1]),
    byRelay,
    totals: { events: seenIds.size, users: lastActive.size },
  };
}

function formatNumber(value) {
  return value.toLocaleString("en-US");
}

function renderReport(report) {
  const lines = [];
  const now = new Date();

  lines.push(`🔒 gupt usage — ${now.toISOString().replace("T", " ").slice(0, 16)} UTC`);
  lines.push("");
  for (const [label] of WINDOWS) {
    lines.push(`  active last ${label.padEnd(3)} : ${formatNumber(report.windows[label])}`);
  }
  lines.push("");
  lines.push("  events by tag (30d window):");
  for (const [tag, count] of report.byTag) {
    lines.push(`    ${tag.padEnd(22)} ${formatNumber(count)}`);
  }
  lines.push("");
  lines.push("  relays:");
  for (const relay of report.byRelay) {
    const note = relay.ok ? "" : ` — ${relay.error || "failed"}`;
    lines.push(
      `    ${relay.relay.padEnd(32)} ${formatNumber(relay.received)} raw · ${formatNumber(relay.counted)} new${note}`,
    );
  }
  lines.push("");
  lines.push(
    `  total: ${formatNumber(report.totals.events)} events · ${formatNumber(report.totals.users)} distinct users`,
  );
  lines.push(`  window: since=${new Date(sinceSec * 1000).toISOString()}`);
  lines.push("  counts are a floor — relays cap results.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  if (!asJson) console.error(`⏳ querying ${DEFAULT_RELAYS.length} default relays…`);

  const relayResults = await Promise.all(DEFAULT_RELAYS.map(fetchFromRelay));
  await delay(0);

  if (!relayResults.some((r) => r.ok || r.events.length)) {
    const details = relayResults.map((r) => `${r.relay}: ${r.error || "failed"}`).join("\n  ");
    if (asJson) console.log(JSON.stringify({ error: "all relays unavailable", details }, null, 2));
    else console.error(`\n❌ could not reach any relay:\n  ${details}`);
    process.exit(1);
  }

  const report = aggregate(relayResults);
  if (asJson) {
    const payload = {
      fetchedAt: new Date().toISOString(),
      sinceSec,
      windows: report.windows,
      byTag: Object.fromEntries(report.byTag),
      byRelay: report.byRelay.map(({ relay, ok, received, counted, error }) => ({
        relay,
        ok,
        received,
        counted,
        ...(error ? { error } : {}),
      })),
      totals: report.totals,
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(renderReport(report));
  }
}

main().catch((err) => {
  console.error("❌", err?.message || err);
  process.exit(1);
});
