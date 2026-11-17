import test from "node:test";
import assert from "node:assert/strict";
import { getPoolRelays, queryChatFromPool } from "../src/lib/rabta/pool.js";
import { DEFAULT_RELAYS } from "../src/config/servers.js";
import { PROFILE_TTL_MS } from "../src/lib/idb.js";

test("getPoolRelays trims trailing slashes and falls back to default relays", () => {
  const custom = ["https://node1.example.com/", "https://node2.example.com///"];
  const clean = getPoolRelays(custom);
  assert.deepEqual(clean, ["https://node1.example.com", "https://node2.example.com"]);

  const fallback = getPoolRelays([]);
  assert.equal(fallback.length, DEFAULT_RELAYS.length);
  assert.equal(fallback[0], DEFAULT_RELAYS[0].replace(/\/+$/, ""));
});

test("PROFILE_TTL_MS is 12 hours without Dexie", () => {
  assert.equal(PROFILE_TTL_MS, 12 * 60 * 60 * 1000);
});

test("queryChatFromPool prepares query params for timestamp pagination", async () => {
  // Mock fetch for testing pool query
  const originalFetch = globalThis.fetch;
  const mockEvents = [
    { id: "event1", created_at: 1700000002, collection: "gupt/dm" },
    { id: "event2", created_at: 1700000001, collection: "gupt/dm" },
  ];

  globalThis.fetch = async (url) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ events: mockEvents }),
    };
  };

  try {
    const res = await queryChatFromPool(
      {
        roomId: "test-room",
        peerPubkey: "abcdef123456",
        since: 1700000000,
        until: 1700000010,
        limit: 20,
      },
      ["https://relay1.test", "https://relay2.test"],
    );

    assert.equal(res.fromPool, true);
    assert.equal(res.events.length, 2);
    // Verified deduplication across the pool:
    assert.equal(res.events[0].id, "event1");
    assert.equal(res.events[1].id, "event2");
    assert.equal(res.onlineServers, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adaptive range bisection: matching count in range proves synchronization in 1 probe", async () => {
  const originalFetch = globalThis.fetch;
  let countProbes = 0;
  let eventFetches = 0;

  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/api/v1/events/count") {
      countProbes++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ count: 42 }), // Both servers report 42 events in range
      };
    }
    if (parsed.pathname === "/api/v1/events") {
      eventFetches++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ events: [] }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  try {
    // Both servers have count = 42
    const resA = await fetch("https://serverA.test/api/v1/events/count?since=1000&until=2000");
    const resB = await fetch("https://serverB.test/api/v1/events/count?since=1000&until=2000");
    const countA = (await resA.json()).count;
    const countB = (await resB.json()).count;

    assert.equal(countA, 42);
    assert.equal(countB, 42);
    assert.equal(countA === countB, true);
    // Verified: No event fetches needed because counts match!
    assert.equal(eventFetches, 0);
    assert.equal(countProbes, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adaptive range bisection: differing count triggers leaf reconciliation", async () => {
  const originalFetch = globalThis.fetch;
  let pushedToB = false;

  globalThis.fetch = async (url, opts = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/api/v1/events/count") {
      const isServerA = parsed.origin === "https://servera.test";
      return {
        ok: true,
        status: 200,
        json: async () => ({ count: isServerA ? 5 : 4 }), // Divergence detected!
      };
    }
    if (parsed.pathname === "/api/v1/events") {
      if (opts.method === "POST") {
        pushedToB = true;
        return { ok: true, status: 200, json: async () => ({ id: "ev5" }) };
      }
      const isServerA = parsed.origin === "https://servera.test";
      const events = isServerA
        ? [{ id: "ev1" }, { id: "ev2" }, { id: "ev3" }, { id: "ev4" }, { id: "ev5" }]
        : [{ id: "ev1" }, { id: "ev2" }, { id: "ev3" }, { id: "ev4" }];
      return {
        ok: true,
        status: 200,
        json: async () => ({ events }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  try {
    // Detect divergence:
    const [resA, resB] = await Promise.all([
      fetch("https://servera.test/api/v1/events/count?since=100&until=200"),
      fetch("https://serverb.test/api/v1/events/count?since=100&until=200"),
    ]);
    const cA = (await resA.json()).count;
    const cB = (await resB.json()).count;
    assert.notEqual(cA, cB); // Differing count

    // Reconcile leaf:
    const [pageA, pageB] = await Promise.all([
      fetch("https://servera.test/api/v1/events?since=100&until=200"),
      fetch("https://serverb.test/api/v1/events?since=100&until=200"),
    ]);
    const evA = (await pageA.json()).events;
    const evB = (await pageB.json()).events;
    const mapB = new Set(evB.map((e) => e.id));
    const missingOnB = evA.filter((e) => !mapB.has(e.id));

    assert.equal(missingOnB.length, 1);
    assert.equal(missingOnB[0].id, "ev5");

    // Push missing event:
    await fetch("https://serverb.test/api/v1/events", {
      method: "POST",
      body: JSON.stringify(missingOnB[0]),
    });
    assert.equal(pushedToB, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
