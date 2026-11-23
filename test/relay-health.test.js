import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";

// Minimal localStorage so the cache module imports cleanly in Node.
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

import { classifyTraffic, RelayTier } from "../src/lib/relay/constants.js";

const { recordRelayOutcomes, getRelayHealthSummary } = await import("../src/lib/idb.js");

test("no evidence is unknown", () => {
  assert.equal(classifyTraffic(null, 0, null, 0), RelayTier.UNKNOWN);
});

test("publish failures degrade a relay even when queries are perfect", () => {
  assert.equal(classifyTraffic(66, 5, 100, 20), RelayTier.DEGRADED);
});

test("publish success below 50% over enough samples is poor", () => {
  assert.equal(classifyTraffic(40, 10, 100, 20), RelayTier.POOR);
});

test("query failures degrade a relay with little publish traffic", () => {
  assert.equal(classifyTraffic(null, 0, 60, 3), RelayTier.DEGRADED);
});

test("query success below 50% over enough samples is poor", () => {
  assert.equal(classifyTraffic(null, 0, 40, 5), RelayTier.POOR);
});

test("a relay that fails half its connection probes is offline", () => {
  assert.equal(classifyTraffic(100, 10, 100, 10, 33, 3), RelayTier.OFFLINE);
});

test("a relay that answers half to two thirds of probes is degraded", () => {
  assert.equal(classifyTraffic(100, 10, 100, 10, 66, 3), RelayTier.DEGRADED);
  assert.equal(classifyTraffic(100, 10, 100, 10, 50, 4), RelayTier.DEGRADED);
});

test("connection evidence needs three samples", () => {
  assert.equal(classifyTraffic(100, 10, 100, 10, 0, 2), RelayTier.GOOD);
});

test("healthy connects leave traffic to grade the relay", () => {
  assert.equal(classifyTraffic(100, 10, 100, 10, 70, 3), RelayTier.GOOD);
  assert.equal(classifyTraffic(40, 10, null, 0, 100, 5), RelayTier.POOR);
});

test("the health summary grades stored connect failures", async () => {
  const relay = "https://connect-health.example";
  await recordRelayOutcomes("connect", [
    { relay, ok: true, latencyMs: 9 },
    { relay, ok: false, latencyMs: 20 },
    { relay, ok: false, latencyMs: 20 },
  ]);

  const row = (await getRelayHealthSummary()).find((entry) => entry.relay === relay);
  assert.equal(row?.connectSuccessRate, 33);
  assert.equal(row?.tier, RelayTier.OFFLINE);
});
