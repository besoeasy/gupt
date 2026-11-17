import test from "node:test";
import assert from "node:assert/strict";
import {
  getPoolRelays,
  queryChatFromPool,
  enquireServerStorageLimits,
  canServerAcceptBlob,
  uploadBlobToPool,
  getRelayCadenceMultiplier,
  fetchBlobFromPool,
  isEventOursOrAddressedToUs,
  shouldReplicateEvent,
  extractEventBlobs,
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

test("dynamic sync cadence: getRelayCadenceMultiplier backs off for constrained battery modes", () => {
  // 1. Normal readwrite
  const normal = { battery: { mode: "readwrite", level: 90, multiplier: 1 } };
  assert.equal(getRelayCadenceMultiplier(normal), 1);

  // 2. Eco mode
  const eco = { battery: { mode: "eco", level: 50, multiplier: 2 } };
  assert.equal(getRelayCadenceMultiplier(eco), 2);

  // 3. Low battery (e.g. 15%)
  const lowBattery = { battery: { mode: "readwrite", level: 15, multiplier: 2 } };
  assert.equal(getRelayCadenceMultiplier(lowBattery), 2);

  // 4. Sync disabled
  const syncDisabled = { battery: { mode: "sync_disabled", level: 10, multiplier: 4 } };
  assert.equal(getRelayCadenceMultiplier(syncDisabled), 4);

  // 5. Read-only / battery empty
  const readOnly = { battery: { mode: "read_only", level: 0, multiplier: 4 } };
  assert.equal(getRelayCadenceMultiplier(readOnly), 4);
});

test("enquireServerStorageLimits extracts battery tier and sets cadence multiplier", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        storage: { budget_bytes: 1000000, used_bytes: 100000 },
        upload: { max_single_bytes: 1000000 },
        peers: { battery: { mode: "eco", percentage: 22 } },
      }),
    };
  };

  try {
    const limits = await enquireServerStorageLimits("https://eco-relay.test");
    assert.equal(limits.ok, true);
    assert.equal(limits.battery.mode, "eco");
    assert.equal(limits.battery.level, 22);
    assert.equal(limits.battery.multiplier, 2);
    assert.equal(limits.battery.backedOff, true);
    assert.match(limits.battery.label, /Eco Mode/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchBlobFromPool downloads blob using HTTP Range resumable fetch", async () => {
  const originalFetch = globalThis.fetch;
  const mockPayload = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
  let rangeRequested = false;

  globalThis.fetch = async (url, opts = {}) => {
    if (opts?.headers?.Range || opts?.headers?.range) {
      rangeRequested = true;
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Length": "8" }),
      arrayBuffer: async () => mockPayload.buffer,
    };
  };

  try {
    const bytes = await fetchBlobFromPool("hash123", ["https://relay1.test"]);
    assert.equal(bytes.byteLength, 8);
    assert.deepEqual(bytes, mockPayload);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("isEventOursOrAddressedToUs identifies user-authored and inbound events strictly", () => {
  const selfPubkey = "1111111111111111111111111111111111111111111111111111111111111111";
  const strangerPubkey = "2222222222222222222222222222222222222222222222222222222222222222";
  const thirdPartyPubkey = "3333333333333333333333333333333333333333333333333333333333333333";

  // 1. Authored by us via owner (with ed25519 prefix)
  assert.equal(
    isEventOursOrAddressedToUs(
      { id: "e1", owner: `ed25519:${selfPubkey}` },
      selfPubkey,
    ),
    true,
  );

  // 2. Authored by us via pubkey
  assert.equal(
    isEventOursOrAddressedToUs({ id: "e2", pubkey: selfPubkey }, selfPubkey),
    true,
  );

  // 3. Authored by us via sender
  assert.equal(
    isEventOursOrAddressedToUs({ id: "e3", sender: selfPubkey }, selfPubkey),
    true,
  );

  // 4. Addressed to us in labels (DM or Group message or Vault Note)
  assert.equal(
    isEventOursOrAddressedToUs(
      {
        id: "e4",
        owner: `ed25519:${strangerPubkey}`,
        labels: ["note", selfPubkey],
      },
      selfPubkey,
    ),
    true,
  );

  // 5. Addressed to us in tags (["p", selfPubkey])
  assert.equal(
    isEventOursOrAddressedToUs(
      {
        id: "e5",
        owner: `ed25519:${strangerPubkey}`,
        tags: [["p", selfPubkey]],
      },
      selfPubkey,
    ),
    true,
  );

  // 6. Direct recipient field
  assert.equal(
    isEventOursOrAddressedToUs(
      {
        id: "e6",
        owner: `ed25519:${strangerPubkey}`,
        recipient: selfPubkey,
      },
      selfPubkey,
    ),
    true,
  );

  // 7. Stranger event (authored by stranger, addressed to third party)
  assert.equal(
    isEventOursOrAddressedToUs(
      {
        id: "e7",
        owner: `ed25519:${strangerPubkey}`,
        labels: [thirdPartyPubkey],
        tags: [["p", thirdPartyPubkey]],
      },
      selfPubkey,
    ),
    false,
  );

  // 8. Missing selfPubkey returns false
  assert.equal(
    isEventOursOrAddressedToUs({ id: "e8", owner: `ed25519:${selfPubkey}` }, null),
    false,
  );
});

test("shouldReplicateEvent enforces user ownership and filters expired or stale call signals", () => {
  const selfPubkey = "1111111111111111111111111111111111111111111111111111111111111111";
  const strangerPubkey = "2222222222222222222222222222222222222222222222222222222222222222";
  const now = 1700000000;

  // 1. Valid user event
  assert.equal(
    shouldReplicateEvent(
      { id: "e1", owner: `ed25519:${selfPubkey}`, created_at: now - 50 },
      { selfPubkey, nowSec: now },
    ),
    true,
  );

  // 2. Stranger event rejected when selfPubkey is active
  assert.equal(
    shouldReplicateEvent(
      { id: "e2", owner: `ed25519:${strangerPubkey}`, labels: ["public_random"] },
      { selfPubkey, nowSec: now },
    ),
    false,
  );

  // 3. Expired event rejected even if ours
  assert.equal(
    shouldReplicateEvent(
      {
        id: "e3",
        owner: `ed25519:${selfPubkey}`,
        expires_at: now - 10,
      },
      { selfPubkey, nowSec: now },
    ),
    false,
  );

  // 4. Stale WebRTC call signal (> 300s old) rejected
  assert.equal(
    shouldReplicateEvent(
      {
        id: "e4",
        collection: "gupt/calls/signal",
        owner: `ed25519:${selfPubkey}`,
        created_at: now - 400,
      },
      { selfPubkey, nowSec: now },
    ),
    false,
  );

  // 5. Fresh WebRTC call signal (< 300s old) accepted
  assert.equal(
    shouldReplicateEvent(
      {
        id: "e5",
        collection: "gupt/calls/signal",
        owner: `ed25519:${selfPubkey}`,
        created_at: now - 60,
      },
      { selfPubkey, nowSec: now },
    ),
    true,
  );
});

test("extractEventBlobs extracts hashes across all message formats and media types", () => {
  const hash1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const hash2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const hash3 = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  const hash4 = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
  const hash5 = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

  const event = {
    id: "ev-media-combo",
    blobs: [hash1],
    data: {
      blobs: [hash2],
      media: {
        hash: hash3,
        parts: [hash4],
      },
      files: [{ hash: hash5 }],
    },
    tags: [["blob", hash1]], // duplicate hash1
  };

  const extracted = extractEventBlobs(event);
  assert.equal(extracted.length, 5);
  assert.ok(extracted.includes(hash1));
  assert.ok(extracted.includes(hash2));
  assert.ok(extracted.includes(hash3));
  assert.ok(extracted.includes(hash4));
  assert.ok(extracted.includes(hash5));
});
