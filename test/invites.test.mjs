/**
 * Unit tests for the invite module's pure logic.
 *
 * Self-contained — no imports from the app source, because invites.js chains
 * to idb.js and the relay pool which use Vite's @/ alias (not resolvable in
 * Node). The constants and predicates tested here are copied from the source
 * to verify correctness of the algorithm, not the wiring.
 */

import test from "node:test";
import assert from "node:assert/strict";

const INVITE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const INVITE_TOKEN_LENGTH = 12;
const TOKEN_RE = /^[A-Za-z0-9]{8,24}$/;
const REVOKE_TAG = "gupt_invite_revoked";

function generateInviteToken(length = INVITE_TOKEN_LENGTH) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let token = "";
  for (const b of bytes) token += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
  return token;
}

function formatInviteExpiry(expiresAtSec) {
  if (!expiresAtSec) return "never";
  const ms = expiresAtSec * 1000;
  const diff = ms - Date.now();
  if (diff <= 0) return "expired";

  const hours = Math.round(diff / 1000 / 3600);
  if (hours > 24) {
    return `${Math.round(hours / 24)} days`;
  }
  return `${Math.max(1, hours)} hours`;
}

function selectNewestInvite(events, nowSec) {
  return (
    (events || [])
      .filter((e) => !e.tags?.some((t) => t[0] === "expiration" && Number(t[1]) < nowSec))
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0] ?? null
  );
}

function isRevoked(event) {
  return event?.tags?.some((t) => t[0] === REVOKE_TAG) ?? false;
}

function makeEvent(createdAt, expiresAt, revoked = false) {
  const tags = [];
  if (expiresAt != null) tags.push(["expiration", String(expiresAt)]);
  if (revoked) tags.push([REVOKE_TAG, ""]);
  return { id: `e-${createdAt}`, created_at: createdAt, tags };
}

test("invite tokens are 12 alphanumeric characters", () => {
  for (let i = 0; i < 50; i++) {
    const token = generateInviteToken();
    assert.equal(token.length, 12);
    assert.match(token, TOKEN_RE);
  }
});

test("formatInviteExpiry renders the three states", () => {
  assert.equal(formatInviteExpiry(null), "never");
  assert.equal(formatInviteExpiry(0), "never");
  assert.equal(formatInviteExpiry(Math.floor(Date.now() / 1000) - 10), "expired");

  const inTwoDays = Math.floor(Date.now() / 1000) + 48 * 3600;
  assert.equal(formatInviteExpiry(inTwoDays), "2 days");
  const inFiveHours = Math.floor(Date.now() / 1000) + 5 * 3600;
  assert.equal(formatInviteExpiry(inFiveHours), "5 hours");
});

test("selectNewestInvite skips expired events", () => {
  const now = 1000;
  const expired = makeEvent(100, 500);
  const live = makeEvent(900, 2000);
  assert.equal(selectNewestInvite([expired, live], now), live);
  assert.equal(selectNewestInvite([expired], now), null);
});

test("selectNewestInvite picks the newest live event regardless of order", () => {
  const now = 1000;
  const oldLive = makeEvent(800, 2000);
  const newLive = makeEvent(950, 2000);
  assert.equal(selectNewestInvite([oldLive, newLive], now), newLive);
  assert.equal(selectNewestInvite([newLive, oldLive], now), newLive);
});

test("selectNewestInvite treats missing expiration as live", () => {
  const now = 1000;
  const event = selectNewestInvite([makeEvent(900)], now);
  assert.equal(event.id, "e-900");
  assert.equal(event.created_at, 900);
  assert.deepEqual(event.tags, []);
});

test("a revocation tombstone published after the invite makes it unusable", () => {
  const now = 1000;
  const invite = makeEvent(500, 2000);
  const tombstone = makeEvent(900, 2000, true);
  const newest = selectNewestInvite([invite, tombstone], now);
  assert.equal(newest, tombstone);
  assert.equal(isRevoked(newest), true);
});

test("a revocation tombstone published before the invite is ignored", () => {
  const now = 1000;
  const oldTombstone = makeEvent(400, 2000, true);
  const newerInvite = makeEvent(800, 2000);
  const newest = selectNewestInvite([oldTombstone, newerInvite], now);
  assert.equal(newest, newerInvite);
  assert.equal(isRevoked(newest), false);
});

const MAX_INVITE_RELAY_HINTS = 5;

function rankInviteRelays(ackedRelays, ranking, max = MAX_INVITE_RELAY_HINTS) {
  const rankMap = new Map((ranking || []).map((r) => [r.relay, r.score ?? 0]));
  return [...ackedRelays]
    .sort((a, b) => (rankMap.get(b) ?? 0) - (rankMap.get(a) ?? 0))
    .slice(0, max);
}

test("rankInviteRelays orders acked relays by score and caps at five", () => {
  const acked = ["wss://c.relay", "wss://a.relay", "wss://b.relay"];
  const ranking = [
    { relay: "wss://a.relay", score: 0.9 },
    { relay: "wss://b.relay", score: 0.6 },
    { relay: "wss://c.relay", score: 0.75 },
  ];
  assert.deepEqual(rankInviteRelays(acked, ranking), [
    "wss://a.relay",
    "wss://c.relay",
    "wss://b.relay",
  ]);
});

test("rankInviteRelays caps the acked set at five and keeps unranked last", () => {
  const acked = [
    "wss://a.relay",
    "wss://b.relay",
    "wss://c.relay",
    "wss://d.relay",
    "wss://e.relay",
    "wss://f.relay",
  ];
  const ranking = [
    { relay: "wss://f.relay", score: 0.99 },
    { relay: "wss://e.relay", score: 0.9 },
    { relay: "wss://d.relay", score: 0.8 },
    { relay: "wss://c.relay", score: 0.7 },
    { relay: "wss://b.relay", score: 0.6 },
  ];
  const ranked = rankInviteRelays(acked, ranking);
  assert.equal(ranked.length, MAX_INVITE_RELAY_HINTS);
  assert.equal(ranked[0], "wss://f.relay");
  assert.equal(ranked[4], "wss://b.relay");
});

test("rankInviteRelays treats acked relays without stats as lowest priority", () => {
  const acked = ["wss://known.relay", "wss://fresh.relay"];
  const ranking = [{ relay: "wss://known.relay", score: 0.95 }];
  assert.deepEqual(rankInviteRelays(acked, ranking), ["wss://known.relay", "wss://fresh.relay"]);
});

function relayScore(existing) {
  if (!existing) return 0.5;
  const publish = existing.publishOkEwma || existing.connectOkEwma || 0;
  const query = existing.queryOkEwma || 0;
  if (publish && query) return Math.min(publish, query);
  if (publish) return publish;
  if (query) return query;
  return 0.5;
}

function mergeSeedScore(existing, target) {
  const seeded = Math.max(relayScore(existing), target);
  return {
    publishOkEwma: Math.max(existing?.publishOkEwma ?? 0, seeded),
    connectOkEwma: Math.max(existing?.connectOkEwma ?? 0, seeded),
    queryOkEwma: Math.max(existing?.queryOkEwma ?? 0, seeded),
  };
}

test("seedRelayScores bootstraps an unknown relay to 0.9", () => {
  assert.deepEqual(mergeSeedScore(null, 0.9), {
    publishOkEwma: 0.9,
    connectOkEwma: 0.9,
    queryOkEwma: 0.9,
  });
});

test("seedRelayScores never downgrades a relay that already ranks higher", () => {
  const existing = { publishOkEwma: 0.97, connectOkEwma: 0.97, queryOkEwma: 0.97 };
  assert.deepEqual(mergeSeedScore(existing, 0.9), {
    publishOkEwma: 0.97,
    connectOkEwma: 0.97,
    queryOkEwma: 0.97,
  });
});

function encodeInviteRelays(relays) {
  const hosts = relays
    .map((relay) => relay.replace(/^wss?:\/\//, ""))
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(",");
  if (!hosts) return "";
  return Buffer.from(hosts, "utf8").toString("base64url");
}

function decodeInviteRelays(raw) {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const hosts = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    try {
      const decoded = Buffer.from(text, "base64url").toString("utf8");
      hosts.push(...decoded.split(",").map((host) => `wss://${host}`));
    } catch {}
  }
  return [...new Set(hosts.map((relay) => relay.trim().replace(/\/+$/, "")))];
}

function normalize(relays) {
  return [...new Set(relays.map((relay) => relay.replace(/\/+$/, "")))];
}

test("encodeInviteRelays strips the wss:// prefix and is URL-safe base64url", () => {
  const encoded = encodeInviteRelays(["wss://relay.snort.social", "wss://relay.primal.net"]);
  assert.doesNotMatch(encoded, /wss:\/\//);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(encoded, /[+/=]/);
});

test("decodeInviteRelays round-trips an encoded relay list", () => {
  const relays = [
    "wss://relay.snort.social",
    "wss://relay.primal.net",
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
  ];
  const encoded = encodeInviteRelays(relays);
  assert.deepEqual(decodeInviteRelays(encoded), normalize(relays));
});

test("decodeInviteRelays returns empty for missing or empty input", () => {
  assert.deepEqual(decodeInviteRelays(null), []);
  assert.deepEqual(decodeInviteRelays(""), []);
  assert.deepEqual(decodeInviteRelays([]), []);
});
