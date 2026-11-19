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

const { recordRelayOutcomes, getRelayCapacityModes, getRelayHealthSummary } =
  await import("../src/lib/idb.js");

test("capacity modes come from detailed probe telemetry", async () => {
  await recordRelayOutcomes("connect", [
    { relay: "https://read-only.example/", ok: true, latencyMs: 12, mode: "read_only" },
    { relay: "https://sync-off.example", ok: true, latencyMs: 18, mode: "SYNC_DISABLED" },
  ]);

  const modes = await getRelayCapacityModes();
  assert.deepEqual(modes, {
    "https://read-only.example": "read_only",
    "https://sync-off.example": "sync_disabled",
  });
});

test("a later outcome without a mode keeps the last observed mode", async () => {
  await recordRelayOutcomes("connect", [
    { relay: "https://flappy.example", ok: true, latencyMs: 9, mode: "read_only" },
  ]);
  await recordRelayOutcomes("publish", [
    { relay: "https://flappy.example", ok: false, latencyMs: 40, error: "429" },
  ]);

  const modes = await getRelayCapacityModes();
  assert.equal(modes["https://flappy.example"], "read_only");
});

test("relays that never reported telemetry are absent from the map", async () => {
  await recordRelayOutcomes("query", [{ relay: "https://quiet.example", ok: true, latencyMs: 7 }]);

  const modes = await getRelayCapacityModes();
  assert.equal(modes["https://quiet.example"], undefined);
});

test("health summary exposes the stored battery mode", async () => {
  await recordRelayOutcomes("connect", [
    { relay: "https://drained.example", ok: true, latencyMs: 15, mode: "read_only" },
  ]);

  const summary = await getRelayHealthSummary();
  const row = summary.find((entry) => entry.relay === "https://drained.example");
  assert.equal(row?.batteryMode, "read_only");
});
