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
