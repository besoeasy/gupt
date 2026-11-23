import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";

globalThis.localStorage = (() => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
})();

const { rankRelays, scoreForLatency, updateRelayScore, decayRelayScore, SCORE_HALF_LIFE_MS } =
  await import("../src/lib/relay/score.js");
const {
  clearOutboxQueue,
  completeOutboxEvent,
  getOutboxEntry,
  queueOutboxEvent,
  recordOutboxRelayState,
  retryOutboxEvent,
  scheduleOutboxRetry,
  setOutboxOwner,
} = await import("../src/lib/idb.js");
const {
  applySendReport,
  hydrateSendReport,
  markSendComplete,
  markSendTimedOut,
  relayAttemptsOf,
  sendReports,
  trackSend,
} = await import("../src/lib/engine/sendReport.js");

test("faster relays earn more score, failures earn zero but never go negative", () => {
  assert.ok(scoreForLatency(200) > scoreForLatency(3000));
  assert.equal(scoreForLatency(60_000), 0);

  let score = 5;
  score = updateRelayScore(score, scoreForLatency(300));
  assert.ok(score > 5, "a fast write must raise the score");
  const before = score;
  score = updateRelayScore(score, 0);
  assert.ok(score < before, "a failure must lower the score");
  for (let i = 0; i < 50; i += 1) score = updateRelayScore(score, 0);
  assert.ok(score >= 0, "score never goes negative");
});

test("relay order is best score first; read-only and too-small relays are skipped", () => {
  const scores = {
    "https://slow.example": { writeScore: 1, batteryMode: null },
    "https://fast.example": { writeScore: 9, batteryMode: null },
    "https://ro.example": { writeScore: 10, batteryMode: "read_only" },
    "https://tiny.example": {
      writeScore: 10,
      maxSingleBytes: 100,
      remainingBytes: 10_000,
      batteryMode: null,
    },
  };
  const ordered = rankRelays(
    ["https://slow.example", "https://ro.example", "https://fast.example"],
    scores,
    { operation: "publish", relayModes: {} },
  );
  assert.deepEqual(ordered, ["https://fast.example", "https://slow.example"]);

  const blobOrdered = rankRelays(["https://tiny.example", "https://slow.example"], scores, {
    operation: "blob",
    blobSizeBytes: 500,
  });
  assert.deepEqual(blobOrdered, ["https://slow.example"]);
  assert.deepEqual(
    rankRelays(
      ["https://unknown.example"],
      { "https://unknown.example": { remainingBytes: null } },
      { operation: "blob", blobSizeBytes: 500 },
    ),
    ["https://unknown.example"],
    "unknown capacity must not be treated as zero",
  );
  assert.deepEqual(
    rankRelays(
      ["https://blobs-off.example"],
      { "https://blobs-off.example": { writable: false } },
      {
        operation: "publish",
      },
    ),
    [],
    "a relay whose telemetry says it is not writable must not receive pushes",
  );
  assert.deepEqual(rankRelays([], scores, {}), []);
});

test("send reports track the relay attempts in order and apply the timeout", async () => {
  sendReports.clear();
  const id = "a".repeat(64);
  trackSend(id);
  applySendReport({ eventId: id, relay: "https://b.example", state: "trying", at: 1000 });
  applySendReport({
    eventId: id,
    relay: "https://b.example",
    state: "error",
    latencyMs: 250,
    error: "timeout",
    at: 1250,
  });
  applySendReport({ eventId: id, relay: "https://a.example", state: "trying", at: 2000 });
  applySendReport({
    eventId: id,
    relay: "https://a.example",
    state: "ok",
    latencyMs: 120,
    at: 2120,
  });
  const attempts = relayAttemptsOf({ relays: {} });
  assert.deepEqual(attempts, []);
  const report = sendReports.get(id);
  assert.equal(report.state, "sending");
  assert.deepEqual(
    relayAttemptsOf(report).map((entry) => entry.host),
    ["b.example", "a.example"],
  );

  markSendTimedOut(id);
  assert.equal(sendReports.get(id).state, "timedOut");
  markSendComplete(id);
  assert.equal(sendReports.get(id).state, "complete");
  markSendTimedOut(id);
  assert.equal(sendReports.get(id).state, "complete", "a late timeout never hides an ack");
});

test("unused relay scores decay toward neutral instead of staying champion forever", () => {
  const now = Date.now();
  assert.equal(decayRelayScore(9, now, now), 9);
  const aged = decayRelayScore(9, now - SCORE_HALF_LIFE_MS, now);
  assert.ok(aged < 9 && aged > 5, `expected a pull toward neutral, got ${aged}`);
  assert.equal(decayRelayScore(5, now - SCORE_HALF_LIFE_MS, now), 5);
});

test("per-relay delivery state survives reloads and a manual retry keeps acked relays", async () => {
  await setOutboxOwner("aa");
  await clearOutboxQueue();
  const id = "c".repeat(64);
  await queueOutboxEvent({
    id,
    pubkey: "aa",
    origin: "dm",
    event: { id, pubkey: "aa", created_at: Math.floor(Date.now() / 1000) },
  });

  let row = await getOutboxEntry(id);
  assert.deepEqual(row.relayStates, {}, "a fresh row has no relay truth yet");

  await recordOutboxRelayState(id, "https://a.example", { state: "trying" });
  await recordOutboxRelayState(id, "https://a.example", { state: "ok", latencyMs: 120 });
  row = await getOutboxEntry(id);
  assert.ok(row.firstAckAt > 0);
  assert.equal(row.lastAckRelay, "https://a.example");
  assert.equal(row.relayStates["https://a.example"].state, "ok");

  await retryOutboxEvent(id);
  row = await getOutboxEntry(id);
  assert.equal(row.attempts, 0);
  assert.equal(
    row.relayStates["https://a.example"].state,
    "ok",
    "a manual retry must not re-ask a relay that already stored the event",
  );

  await completeOutboxEvent(id);
  assert.equal(await getOutboxEntry(id), null, "all relays ok leaves the queue");
});

test("outbox retries until the event expires, then goes terminal", async () => {
  await setOutboxOwner("aa");
  await clearOutboxQueue();
  const nowSec = Math.floor(Date.now() / 1000);
  const liveId = "d".repeat(64);
  await queueOutboxEvent({
    id: liveId,
    pubkey: "aa",
    origin: "dm",
    event: { id: liveId, pubkey: "aa", created_at: nowSec, expires_at: nowSec + 3600 },
  });
  const live = await scheduleOutboxRetry(liveId, {
    nextDue: Date.now() + 30_000,
    error: "no relay ack",
  });
  assert.equal(live.expired, false);
  assert.equal(live.attempts, 1);
  let row = await getOutboxEntry(liveId);
  assert.equal(row.attempts, 1);
  assert.ok(row.nextDue > Date.now());
  assert.equal(row.failedAt, 0);

  const expiredId = "e".repeat(64);
  await queueOutboxEvent({
    id: expiredId,
    pubkey: "aa",
    origin: "dm",
    event: { id: expiredId, pubkey: "aa", created_at: nowSec - 100, expires_at: nowSec - 1 },
  });
  const expired = await scheduleOutboxRetry(expiredId, { nextDue: Date.now() });
  assert.equal(expired.expired, true);
  row = await getOutboxEntry(expiredId);
  assert.ok(row.failedAt > 0);
  assert.equal(row.nextDue, Number.MAX_SAFE_INTEGER);
  await clearOutboxQueue();
});

test("hydrateSendReport recovers queue state after a reload", async () => {
  await setOutboxOwner("aa");
  await clearOutboxQueue();
  const id = "b".repeat(64);
  sendReports.delete(id);
  await queueOutboxEvent({
    id,
    event: { id, created_at: Math.floor(Date.now() / 1000) },
    origin: "dm",
    createdAt: Date.now(),
  });
  await scheduleOutboxRetry(id, { nextDue: Date.now() + 30_000, error: "no relay ack" });
  const report = await hydrateSendReport(id);
  assert.equal(report.state, "sending");
  assert.equal(report.attempts, 1, "attempt count is the queue row's, not the report stub");
  assert.match(String(report.error), /no relay ack/);
  await clearOutboxQueue();
});
