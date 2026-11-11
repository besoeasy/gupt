import test from "node:test";
import assert from "node:assert/strict";
import {
  sha256HexOfBytes,
  blobHashesOf,
  getUmbrellaSpecs,
  pullMonotonicStream,
  reconcileRangeBisection,
  pushOutboxBatch,
  syncCycle,
  ENGINE_DONE_AT,
  ENGINE_PULL_PAGE,
} from "../src/lib/engine/core.js";

test("sha256HexOfBytes correctly digests bytes", async () => {
  const bytes = new TextEncoder().encode("gupt-replication-test");
  const hex = await sha256HexOfBytes(bytes);
  assert.equal(typeof hex, "string");
  assert.equal(hex.length, 64);
});

test("blobHashesOf extracts lowercase valid sha256 hashes", () => {
  const hash1 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const hash2 = "6084FC0692F37F8D952B1012921F2D70D9960F5DA20436742529C022647811E5";
  const event = {
    blobs: [hash1, hash2, "invalid-hash", 12345, hash1],
  };

  const hashes = blobHashesOf(event);
  assert.equal(hashes.length, 2);
  assert.equal(hashes[0], hash1.toLowerCase());
  assert.equal(hashes[1], hash2.toLowerCase());
});

test("getUmbrellaSpecs constructs 2 unified channels for inbound and outbound", () => {
  const pubkey = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
  const specs = getUmbrellaSpecs(pubkey);

  assert.equal(specs.length, 2);

  const inbound = specs.find((s) => s.name === "inbound");
  assert.ok(inbound);
  assert.equal(inbound.isOwner, false);
  assert.deepEqual(inbound.body.labels, [pubkey]);
  assert.equal(inbound.body.collection_glob, "gupt/*");

  const outbound = specs.find((s) => s.name === "outbound");
  assert.ok(outbound);
  assert.equal(outbound.isOwner, true);
  assert.equal(outbound.body.owner, `ed25519:${pubkey}`);
  assert.equal(outbound.body.collection_glob, "gupt/*");
});

test("reconcileRangeBisection exits in 1 request when range counts match", async () => {
  const pubkey = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
  const spec = getUmbrellaSpecs(pubkey)[0];

  const store = {
    countLocalEvents: async () => 42,
    hasEventIds: async () => new Set(),
    putInboundEvent: async () => true,
  };

  // Mock global fetch
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (url, opts) => {
    fetchCount++;
    if (url.includes("/api/v1/events/query/count")) {
      return new Response(JSON.stringify({ count: 42 }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const result = await reconcileRangeBisection({
      store,
      pubkeyHex: pubkey,
      relay: "https://mock.relay",
      spec,
      startSec: 0,
      endSec: 1000000,
    });

    assert.equal(result.probesUsed, 1, "Should exit immediately on matched count");
    assert.equal(result.pulledIds.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reconcileRangeBisection bisects and fetches leaf when counts differ", async () => {
  const pubkey = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
  const spec = getUmbrellaSpecs(pubkey)[0];

  const storedIds = [];
  const store = {
    countLocalEvents: async ({ startSec, endSec }) => {
      // Local has 0 events, relay has 2
      return 0;
    },
    hasEventIds: async () => new Set(),
    putInboundEvent: async (ev) => {
      storedIds.push(ev.id);
      return true;
    },
  };

  const originalFetch = globalThis.fetch;
  let countCalls = 0;
  globalThis.fetch = async (url, opts) => {
    if (url.includes("/api/v1/events/query/count")) {
      countCalls++;
      // Window [0, 1000) has 2 events, sub-windows have 1
      return new Response(JSON.stringify({ count: 2 }), { status: 200 });
    }
    if (url.includes("/api/v1/events/query")) {
      return new Response(
        JSON.stringify({
          events: [
            { id: "ev1", created_at: 500 },
            { id: "ev2", created_at: 600 },
          ],
          next_cursor: null,
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const result = await reconcileRangeBisection({
      store,
      pubkeyHex: pubkey,
      relay: "https://mock.relay",
      spec,
      startSec: 0,
      endSec: 1000, // span <= 3600 triggers leaf direct fetch
    });

    assert.equal(storedIds.length, 2);
    assert.deepEqual(storedIds, ["ev1", "ev2"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pullMonotonicStream pulls new events and advances watermark", async () => {
  const pubkey = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";

  let savedWatermark = 0;
  const store = {
    getWatermark: async () => 1000,
    setWatermark: async (key, ts) => {
      savedWatermark = ts;
    },
    hasEventIds: async () => new Set(),
    putInboundEvent: async () => true,
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes("/api/v1/events/query")) {
      return new Response(
        JSON.stringify({
          events: [
            { id: "ev_new_1", created_at: 1050 },
            { id: "ev_new_2", created_at: 1100 },
          ],
          next_cursor: null,
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const res = await pullMonotonicStream({
      store,
      pubkeyHex: pubkey,
      relays: ["https://mock.relay"],
      maxPagesPerChannel: 1,
    });

    assert.ok(res.pulledEvents > 0);
    assert.equal(savedWatermark, 1100, "Watermark must advance to newest event created_at");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pushOutboxBatch broadcasts event and marks synced on all relays ok", async () => {
  const event = {
    id: "outbound_ev_1",
    owner: "ed25519:ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
    collection: "gupt/chat/dm",
    blobs: [],
  };

  let ackedId = null;
  let syncedIds = null;
  let syncedAt = null;

  const store = {
    listUnsyncedEvents: async () => [{ id: event.id, event, syncAttempts: 0 }],
    markEventsSynced: async (ids, ts) => {
      syncedIds = ids;
      syncedAt = ts;
    },
    recordOutboxResult: async () => ({ failedIds: [] }),
    getOutboxStatus: async () => ({ pending: 0, stuck: 0, failed: 0 }),
    getBlobBytes: async () => null,
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === "POST" && url.includes("/api/v1/events")) {
      return new Response(JSON.stringify({ id: event.id }), { status: 201 });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const res = await pushOutboxBatch({
      store,
      blobs: null,
      relays: ["https://relay1.com", "https://relay2.com"],
      onAck: (id) => {
        ackedId = id;
      },
    });

    assert.equal(ackedId, event.id, "First successful relay must trigger onAck callback");
    assert.equal(syncedAt, ENGINE_DONE_AT, "Full relay acceptance must mark ENGINE_DONE_AT");
    assert.deepEqual(syncedIds, [event.id]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
