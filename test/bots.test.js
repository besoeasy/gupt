import test from "node:test";
import assert from "node:assert/strict";

import { finalizeEvent } from "../src/lib/crypto.js";
import { verifyEvent } from "../src/lib/rabta/index.js";
import {
  BOT_COLLECTION,
  BOT_BEACON_TTL_SECONDS,
  BOT_MAX_NAME,
  collapseBots,
  normalizeBotWebsite,
  parseBotBeacon,
  recentBots,
  shortBotPubkey,
} from "../src/lib/bots.js";
import { botKnownDays, readBotSightings, recordBotSightings } from "../src/lib/botSightings.js";

const KEY_A = "11".repeat(32);
const KEY_B = "22".repeat(32);
const KEY_C = "33".repeat(32);
const KEY_D = "44".repeat(32);
const NOW = 1_800_000_000;

function beacon(privkeyHex, data, { createdAt = NOW, ttl = BOT_BEACON_TTL_SECONDS } = {}) {
  return finalizeEvent(
    {
      collection: BOT_COLLECTION,
      kind: 1,
      labels: [],
      created_at: createdAt,
      expires_at: createdAt + ttl,
      data: { v: 1, name: "bot", ...data },
    },
    privkeyHex,
  );
}

test("a signed beacon parses into directory fields", () => {
  const event = beacon(KEY_A, {
    name: "  poll-bot ",
    description: "Creates polls.\nTry /poll",
    owner: "Acme",
    website: "https://example.com/bot",
  });

  assert.equal(event.collection, BOT_COLLECTION);
  assert.equal(verifyEvent(event), true);
  assert.equal(event.expires_at - event.created_at, BOT_BEACON_TTL_SECONDS);

  const bot = parseBotBeacon(event);
  assert.ok(bot);
  assert.equal(bot.name, "poll-bot");
  assert.equal(bot.description, "Creates polls. Try /poll");
  assert.equal(bot.owner, "Acme");
  assert.equal(bot.website, "https://example.com/bot");
  assert.equal(bot.websiteHost, "example.com");
  assert.equal(bot.pubkey, event.owner.replace(/^ed25519:/, ""));
  assert.equal(bot.createdAt, NOW * 1000);
});

test("a bare host becomes https and unsafe schemes are dropped", () => {
  assert.deepEqual(normalizeBotWebsite("example.com/bot"), {
    website: "https://example.com/bot",
    websiteHost: "example.com",
  });
  assert.equal(normalizeBotWebsite("javascript:alert(1)").website, "");
  assert.equal(normalizeBotWebsite("data:text/html,hi").website, "");
  assert.equal(normalizeBotWebsite("ftp://example.com/file").website, "");
  assert.equal(normalizeBotWebsite("not a url").website, "");
});

test("tampered, unsigned, foreign, and versioned events are rejected", () => {
  const event = beacon(KEY_A, { name: "real-bot" });

  assert.equal(parseBotBeacon({ ...event, data: { ...event.data, name: "evil" } }), null);
  assert.equal(parseBotBeacon({ ...event, sig: "00".repeat(64) }), null);
  assert.equal(parseBotBeacon({ ...event, collection: "gupt/feed" }), null);
  assert.equal(parseBotBeacon(beacon(KEY_A, { name: "v2", v: 2 })), null);
});

test("a beacon without a name is not listed", () => {
  assert.equal(parseBotBeacon(beacon(KEY_A, { name: "   " })), null);
  assert.equal(parseBotBeacon(beacon(KEY_A, { name: "x".repeat(200) })).name.length, BOT_MAX_NAME);
});

test("one card per bot key, newest beacon wins, sorted by name", () => {
  const events = [
    beacon(KEY_A, { name: "Zulu" }, { createdAt: NOW }),
    beacon(KEY_A, { name: "Zulu renamed" }, { createdAt: NOW + 60 }),
    beacon(KEY_B, { name: "Alpha" }, { createdAt: NOW }),
  ];

  const bots = collapseBots(events);
  assert.equal(bots.length, 2);
  assert.equal(bots[0].name, "Alpha");
  assert.equal(bots[1].name, "Zulu renamed");
  assert.equal(bots[1].createdAt, (NOW + 60) * 1000);
});

test("only beacons from the last hour are listed and duplicate names collapse", () => {
  const nowMs = NOW * 1000;
  const events = [
    beacon(KEY_A, { name: "poll-bot" }, { createdAt: NOW - 10 * 60 }),
    beacon(KEY_B, { name: "Poll-Bot" }, { createdAt: NOW - 5 * 60 }),
    beacon(KEY_C, { name: "edge-bot" }, { createdAt: NOW - 60 * 60 }),
    beacon(KEY_D, { name: "old-bot" }, { createdAt: NOW - 61 * 60 }),
  ];

  const bots = recentBots(collapseBots(events), { now: nowMs });
  assert.deepEqual(bots.map((bot) => bot.name).sort(), ["Poll-Bot", "edge-bot"]);

  const poll = bots.find((bot) => bot.name === "Poll-Bot");
  assert.equal(poll.createdAt, (NOW - 5 * 60) * 1000);
  assert.equal(poll.description, "");
});

test("short pubkeys keep a recognisable prefix and suffix", () => {
  const hex = "ab".repeat(32);
  assert.equal(shortBotPubkey(hex), "abababab…ababab");
  assert.equal(shortBotPubkey(""), "");
});

test("the local sightings ledger keeps first seen and prunes stale bots", () => {
  const store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  });

  const day = 24 * 60 * 60 * 1000;
  recordBotSightings([{ pubkey: "a" }], NOW);
  recordBotSightings([{ pubkey: "a" }, { pubkey: "b" }], NOW + day);

  const sightings = readBotSightings();
  assert.equal(sightings.a.first, NOW);
  assert.equal(sightings.a.last, NOW + day);
  assert.equal(botKnownDays(sightings.a, NOW + 31 * day), 31);

  recordBotSightings([{ pubkey: "c" }], NOW + 130 * day);
  assert.equal(readBotSightings().a, undefined);
  assert.ok(readBotSightings().c);
});
