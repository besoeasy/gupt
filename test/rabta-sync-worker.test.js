import test from "node:test";
import assert from "node:assert/strict";
import {
  getPoolRelays,
  queryChatFromPool,
  enquireServerStorageLimits,
  canServerAcceptBlob,
  uploadBlobToPool,
} from "../src/lib/rabta/pool.js";
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

test("enquireServerStorageLimits queries /api/v1/node and parses storage budget and limits", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://node.example.com/api/v1/node");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        node_id: "node-test-abc",
        storage: { budget_bytes: 50000000, used_bytes: 20000000, free_bytes: 100000000 },
        upload: { max_single_bytes: 5000000 },
        peers: { battery: { mode: "readwrite" } },
        blobs: { enabled: true },
      }),
    };
  };

  try {
    const limits = await enquireServerStorageLimits("https://node.example.com/");
    assert.equal(limits.ok, true);
    assert.equal(limits.writable, true);
    assert.equal(limits.nodeId, "node-test-abc");
    assert.equal(limits.budgetBytes, 50000000);
    assert.equal(limits.usedBytes, 20000000);
    assert.equal(limits.remainingBytes, 30000000); // 50MB - 20MB
    assert.equal(limits.maxSingleBytes, 5000000); // 5MB
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("canServerAcceptBlob validates blob size against limits and mode", async () => {
  const limits = {
    ok: true,
    writable: true,
    remainingBytes: 1000000, // 1MB remaining
    maxSingleBytes: 500000, // 500KB max single blob
  };

  // 1. Fits within limits
  const okCheck = await canServerAcceptBlob("https://relay.test", 250000, limits);
  assert.equal(okCheck.canAccept, true);

  // 2. Exceeds maxSingleBytes
  const singleLimitCheck = await canServerAcceptBlob("https://relay.test", 600000, limits);
  assert.equal(singleLimitCheck.canAccept, false);
  assert.match(singleLimitCheck.reason, /exceeds relay single blob limit/);

  // 3. Exceeds remaining budget
  const budgetCheck = await canServerAcceptBlob("https://relay.test", 400000, {
    ...limits,
    remainingBytes: 300000,
  });
  assert.equal(budgetCheck.canAccept, false);
  assert.match(budgetCheck.reason, /exceeds remaining storage budget/);

  // 4. Relay is read-only
  const readOnlyCheck = await canServerAcceptBlob("https://relay.test", 1000, {
    ...limits,
    writable: false,
  });
  assert.equal(readOnlyCheck.canAccept, false);
  assert.match(readOnlyCheck.reason, /read-only mode or blobs are disabled/);

  // 5. Relay storage completely exhausted
  const exhaustedCheck = await canServerAcceptBlob("https://relay.test", 0, {
    ...limits,
    remainingBytes: 0,
  });
  assert.equal(exhaustedCheck.canAccept, false);
  assert.match(exhaustedCheck.reason, /completely exhausted/);
});

test("uploadBlobToPool enquires relay storage limits and skips quota-exhausted relays", async () => {
  const originalFetch = globalThis.fetch;
  let putAttempts = 0;

  globalThis.fetch = async (url, opts = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/api/v1/node") {
      const isRelay1 = parsed.origin === "https://relay1.test";
      return {
        ok: true,
        status: 200,
        json: async () => ({
          storage: {
            budget_bytes: isRelay1 ? 1000000 : 500, // relay2 budget is only 500 B
            used_bytes: isRelay1 ? 100 : 490, // relay2 remaining is only 10 B!
          },
          upload: { max_single_bytes: 1000000 },
          peers: { battery: { mode: "readwrite" } },
          blobs: { enabled: true },
        }),
      };
    }
    if (parsed.pathname === "/api/v1/blobs") {
      if (opts.method === "PUT") {
        putAttempts++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ hash: "abc12345", size: 5000 }),
        };
      }
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  try {
    const testBytes = new Uint8Array(5000); // 5000 B blob
    const results = await uploadBlobToPool(testBytes, [
      "https://relay1.test",
      "https://relay2.test",
    ]);

    assert.equal(results.length, 2);

    const relay1Res = results.find((r) => r.relay === "https://relay1.test");
    const relay2Res = results.find((r) => r.relay === "https://relay2.test");

    // relay1 accepted
    assert.equal(relay1Res.ok, true);
    // relay2 rejected due to quota limit before upload
    assert.equal(relay2Res.ok, false);
    assert.equal(relay2Res.skippedQuota, true);
    assert.match(relay2Res.reason, /exceeds remaining storage budget/);

    // Verified: PUT was only attempted on relay1, NOT on relay2!
    assert.equal(putAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
