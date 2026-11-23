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

const { rankRelays, scoreForLatency, updateRelayScore } = await import("../src/lib/relay/score.js");
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

test("hydrateSendReport recovers queue state after a reload", async () => {
  const { clearOutboxQueue, queueOutboxEvent, setOutboxOwner } = await import("../src/lib/idb.js");
  await setOutboxOwner("aa");
  await clearOutboxQueue();
  const id = "b".repeat(64);
  sendReports.delete(id);
  await queueOutboxEvent({
    id,
    event: { id },
    origin: "dm",
    createdAt: Date.now(),
  });
  const { recordOutboxResult } = await import("../src/lib/idb.js");
  await recordOutboxResult({ unackedIds: [id], error: "no relay ack" });
  const report = await hydrateSendReport(id);
  assert.equal(report.state, "sending");
  assert.equal(report.attempts, 1, "attempt count is the queue row's, not the report stub");
  assert.match(String(report.error), /no relay ack/);
  await clearOutboxQueue();
});
