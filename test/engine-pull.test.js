import test from "node:test";
import assert from "node:assert/strict";

import { clearRelayCircuit } from "../src/lib/relay/circuit.js";
import { pullMonotonicStream } from "../src/lib/engine/core.js";

test.beforeEach(() => {
  clearRelayCircuit();
});

function mockStore() {
  const watermarks = new Map();
  const stored = new Map();
  return {
    stored,
    async getWatermark(key) {
      return watermarks.get(key) || 0;
    },
    async setWatermark(key, val) {
      watermarks.set(key, val);
    },
    async hasEventIds(ids) {
      return new Set(ids.filter((id) => stored.has(id)));
    },
    async putInboundEvent(ev) {
      if (stored.has(ev.id)) return false;
      stored.set(ev.id, ev);
      return true;
    },
  };
}

const evA = { id: "a".repeat(64), created_at: 1000, collection: "gupt/chat/dm" };
const evB = { id: "b".repeat(64), created_at: 1001, collection: "gupt/chat/dm" };

test("pullMonotonicStream queries live relays concurrently", async () => {
  const relayA = "https://concurrent-a.example";
  const relayB = "https://concurrent-b.example";
  const delayMs = 400;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const events = String(url).startsWith(relayA) ? [evA] : [evB, { ...evA }];
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ events, next_cursor: null }),
    };
  };
  try {
    const store = mockStore();
    const startedAt = Date.now();
    const summary = await pullMonotonicStream({
      store,
      pubkeyHex: "c".repeat(64),
      relays: [relayA, relayB],
      log: () => {},
    });
    const elapsed = Date.now() - startedAt;

    // Both relays pulled, shared event stored exactly once.
    assert.equal(summary.pulledEvents, 2);
    assert.deepEqual(new Set(summary.pulledIds), new Set([evA.id, evB.id]));
    assert.equal(store.stored.size, 2);
    assert.deepEqual(
      summary.relayOk.map(([relay, ok]) => [relay, ok]),
      [
        [relayA, true],
        [relayB, true],
      ],
    );

    // Sequential would need 2 relays x 2 specs x 400ms = 1600ms; concurrent
    // needs ~2 specs x 400ms on the slowest lane.
    assert.ok(elapsed < 1400, `expected concurrent pull, took ${elapsed}ms`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("one slow relay does not hold back a fast one", async () => {
  const fast = "https://lane-fast.example";
  const slow = "https://lane-slow.example";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith(slow)) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      throw new Error("fetch failed");
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ events: [evA], next_cursor: null }),
    };
  };
  try {
    const store = mockStore();
    const startedAt = Date.now();
    const summary = await pullMonotonicStream({
      store,
      pubkeyHex: "c".repeat(64),
      relays: [slow, fast],
      log: () => {},
    });
    const elapsed = Date.now() - startedAt;

    assert.equal(summary.pulledEvents, 1);
    assert.equal(store.stored.has(evA.id), true);
    // The fast lane lands in ~3s (2 specs); the slow lane fails on its own.
    assert.ok(elapsed < 5000, `fast relay held back, took ${elapsed}ms`);
    const slowOutcome = summary.relayOutcomes.find((o) => o.relay === slow);
    assert.equal(slowOutcome?.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
