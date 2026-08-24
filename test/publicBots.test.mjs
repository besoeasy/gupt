import assert from "node:assert/strict";
import test from "node:test";

import { parsePublicBotEvent, reducePublicBots, shufflePublicBots } from "../src/lib/publicBots.js";

const now = Date.UTC(2026, 7, 24);
const later = Math.floor(now / 1000) + 60;
const pubkeyA = "a".repeat(64);
const pubkeyB = "b".repeat(64);

function listing({ pubkey, name, about, createdAt, extraTags = [], profile = null }) {
  return {
    id: `${pubkey}:${createdAt}`,
    kind: 1,
    pubkey,
    created_at: createdAt,
    tags: [
      ["t", "gupt-bot"],
      ["gupt-bot", JSON.stringify(profile || { name, about })],
      ["expiration", String(Math.floor(now / 1000) + 86_400)],
      ...extraTags,
    ],
    content: "GUPT bot : https://github.com/besoeasy/gupt",
  };
}

test("parses a public gupt-bot listing", () => {
  const bot = parsePublicBotEvent(
    listing({
      pubkey: pubkeyA,
      name: "Echo",
      about: "Repeats your message.",
      createdAt: Math.floor(now / 1000),
      extraTags: [["r", "wss://relay.damus.io"]],
    }),
    now,
  );
  assert.equal(bot.name, "Echo");
  assert.equal(bot.about, "Repeats your message.");
  assert.deepEqual(bot.relays, ["wss://relay.damus.io"]);
  assert.equal(bot.owner, "");
  assert.equal(bot.website, "");
});

test("parses optional owner and website on a public listing", () => {
  const owner = "c".repeat(64);
  const bot = parsePublicBotEvent(
    listing({
      pubkey: pubkeyA,
      name: "Echo",
      about: "Repeats your message.",
      createdAt: Math.floor(now / 1000),
      extraTags: [],
      profile: {
        name: "Echo",
        about: "Repeats your message.",
        owner,
        website: "https://example.com/echo",
      },
    }),
    now,
  );
  assert.equal(bot.owner, owner);
  assert.equal(bot.website, "https://example.com/echo");
});

test("ignores invalid optional owner and website without dropping the listing", () => {
  const bot = parsePublicBotEvent(
    listing({
      pubkey: pubkeyA,
      name: "Echo",
      about: "Repeats your message.",
      createdAt: Math.floor(now / 1000),
      profile: {
        name: "Echo",
        about: "Repeats your message.",
        owner: "not-a-key",
        website: "javascript:alert(1)",
      },
    }),
    now,
  );
  assert.equal(bot.name, "Echo");
  assert.equal(bot.owner, "");
  assert.equal(bot.website, "");
});

test("keeps the newest listing per pubkey", () => {
  const bots = reducePublicBots(
    [
      listing({
        pubkey: pubkeyA,
        name: "Old Echo",
        about: "stale",
        createdAt: Math.floor(now / 1000),
      }),
      listing({
        pubkey: pubkeyA,
        name: "Echo",
        about: "fresh",
        createdAt: later,
      }),
      listing({
        pubkey: pubkeyB,
        name: "Time",
        about: "UTC clock",
        createdAt: Math.floor(now / 1000),
      }),
      { kind: 4, pubkey: pubkeyA, tags: [["t", "gupt-dm"]] },
    ],
    now,
  );
  assert.deepEqual(
    bots.map((bot) => ({ pubkey: bot.pubkey, name: bot.name, about: bot.about })),
    [
      { pubkey: pubkeyA, name: "Echo", about: "fresh" },
      { pubkey: pubkeyB, name: "Time", about: "UTC clock" },
    ],
  );
});

test("drops expired and untagged events", () => {
  assert.equal(
    parsePublicBotEvent(
      {
        kind: 1,
        pubkey: pubkeyA,
        tags: [
          ["t", "gupt-bot"],
          ["gupt-bot", JSON.stringify({ name: "Echo", about: "gone" })],
          ["expiration", String(Math.floor(now / 1000) - 1)],
        ],
      },
      now,
    ),
    null,
  );
  assert.equal(
    parsePublicBotEvent({ kind: 1, pubkey: pubkeyA, tags: [["t", "gupt-dm"]] }, now),
    null,
  );
});

test("shuffles public bots without dropping entries", () => {
  const bots = reducePublicBots(
    [
      listing({
        pubkey: pubkeyA,
        name: "Echo",
        about: "fresh",
        createdAt: later,
      }),
      listing({
        pubkey: pubkeyB,
        name: "Time",
        about: "UTC clock",
        createdAt: Math.floor(now / 1000),
      }),
    ],
    now,
  );
  const shuffled = shufflePublicBots(bots);
  assert.equal(shuffled.length, bots.length);
  assert.deepEqual(
    [...shuffled].map((bot) => bot.pubkey).sort(),
    bots.map((bot) => bot.pubkey).sort(),
  );
});
