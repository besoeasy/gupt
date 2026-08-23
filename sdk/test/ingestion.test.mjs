import assert from "node:assert/strict";
import test from "node:test";

import {
  FUTURE_SKEW_MS,
  IngestionPipeline,
  RECENCY_WINDOW_MS,
  SeenEventTracker,
} from "../src/ingestion.js";
import { buildDirectMessageEvent, getPublicKey } from "../src/wire.js";

const BOT_SECRET = "3".padStart(64, "0");
const SENDER_SECRET = "4".padStart(64, "0");
const BOT_PUBKEY = getPublicKey(BOT_SECRET);

function eventAt(now, relayHint = "wss://sender.example") {
  return buildDirectMessageEvent({
    secretHex: SENDER_SECRET,
    recipientPubkey: BOT_PUBKEY,
    payload: { type: "text", text: "ping", ts: now },
    relayHint,
    now,
  });
}

function pipeline(now, drops) {
  return new IngestionPipeline({
    secretHex: BOT_SECRET,
    pubkey: BOT_PUBKEY,
    clock: () => now,
    seenTracker: new SeenEventTracker({ clock: () => now, sweepIntervalMs: 60_000 }),
    onDrop: (drop) => drops.push(drop),
  });
}

test("verifies, deduplicates, and decrypts recent messages", () => {
  const now = Date.UTC(2026, 7, 23);
  const drops = [];
  const ingestion = pipeline(now, drops);
  const event = eventAt(now);

  const first = ingestion.ingest(event, { relayUrl: "wss://bootstrap.example" });
  const second = ingestion.ingest(event, { relayUrl: "wss://other.example" });

  assert.equal(first.payload.text, "ping");
  assert.equal(first.relayHint, "wss://sender.example");
  assert.equal(first.relayUrl, "wss://bootstrap.example");
  assert.equal(second, null);
  assert.equal(drops.at(-1).reason, "duplicate");
  ingestion.close();
});

test("drops stale and future-dated events before decryption", () => {
  const now = Date.UTC(2026, 7, 23);
  const drops = [];
  const ingestion = pipeline(now, drops);

  assert.equal(ingestion.ingest(eventAt(now - RECENCY_WINDOW_MS - 1)), null);
  assert.equal(drops.at(-1).reason, "too-old");
  assert.equal(ingestion.ingest(eventAt(now + FUTURE_SKEW_MS + 1_000)), null);
  assert.equal(drops.at(-1).reason, "from-future");
  ingestion.close();
});

test("does not let an invalid signature poison the seen tracker", () => {
  const now = Date.UTC(2026, 7, 23);
  const drops = [];
  const ingestion = pipeline(now, drops);
  const event = eventAt(now);
  const invalid = {
    ...event,
    sig: `${event.sig.slice(0, -1)}${event.sig.endsWith("0") ? "1" : "0"}`,
  };

  assert.equal(ingestion.ingest(invalid), null);
  assert.equal(drops.at(-1).reason, "invalid-signature");
  assert.equal(ingestion.ingest(event)?.payload.text, "ping");
  ingestion.close();
});

test("seen tracker expires entries and enforces its hard cap", () => {
  let now = 100;
  const tracker = new SeenEventTracker({
    ttlMs: 50,
    maxEntries: 2,
    clock: () => now,
    sweepIntervalMs: 60_000,
  });

  tracker.add("a");
  tracker.add("b");
  tracker.add("c");
  assert.equal(tracker.has("a"), false);
  assert.equal(tracker.has("b"), true);
  now = 151;
  assert.equal(tracker.has("b"), false);
  tracker.close();
});
