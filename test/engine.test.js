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
  ENGINE_PULL_PAGE,
} from "../src/lib/engine/core.js";

function makeOutboxStore({ events = [], syncAttempts = 0, blobBytes = null } = {}) {
  const rows = new Map(
    events.map((event) => [
      event.id,
      { id: event.id, event, syncAttempts, relayStates: {}, firstAckAt: 0, lastAckRelay: null },
    ]),
  );
  const result = { completed: [], scheduled: [], states: new Map() };
  return {
    rows,
    result,
    async listUnsyncedEvents() {
      return [...rows.values()];
    },
    async recordOutboxRelayState(id, relay, patch = {}) {
      const row = rows.get(id);
      if (!row) return null;
      row.relayStates[relay] = { ...(row.relayStates[relay] || {}), ...patch, relay };
      if (row.relayStates[relay].state === "ok" && !row.firstAckAt) {
        row.firstAckAt = Date.now();
        row.lastAckRelay = relay;
      }
      result.states.set(`${id}|${relay}`, row.relayStates[relay]);
      return row.relayStates[relay];
    },
    async scheduleOutboxRetry(id, opts = {}) {
      result.scheduled.push({ id, ...opts });
      const row = rows.get(id);
      return {
        eventId: id,
        attempts: (row?.syncAttempts || 0) + 1,
        nextDue: opts.nextDue,
        expired: false,
      };
    },
    async completeOutboxEvent(id) {
      rows.delete(id);
      result.completed.push(id);
      return true;
    },
    async getOutboxStatus() {
      return { pending: rows.size, stuck: 0, failed: 0 };
    },
    async getBlobBytes() {
      return blobBytes;
    },
  };
}

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
    if (url.includes("/api/v1/events/count")) {
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
    if (url.includes("/api/v1/events/count")) {
      countCalls++;
      // Window [0, 1000) has 2 events, sub-windows have 1
      return new Response(JSON.stringify({ count: 2 }), { status: 200 });
    }
    if (url.includes("/api/v1/events?")) {
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
    if (url.includes("/api/v1/events?")) {
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

test("pushOutboxBatch POSTs fresh rows without a HEAD existence check", async () => {
  const event = {
    id: "fresh_ev_1",
    owner: "ed25519:ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
    collection: "gupt/chat/dm",
    blobs: [],
  };

  const calls = [];
  const store = makeOutboxStore({ events: [event] });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push(`${opts?.method || "GET"} ${url}`);
    if (opts?.method === "POST" && url.includes("/api/v1/events")) {
      return new Response(JSON.stringify({ id: event.id }), { status: 201 });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const res = await pushOutboxBatch({
      store,
      blobs: null,
      relays: ["https://relay1.com"],
    });

    assert.ok(
      calls.every((call) => !call.startsWith("GET") || !call.includes(event.id)),
      `fresh row must skip HEAD, got: ${calls.join(", ")}`,
    );
    assert.ok(
      calls.some((call) => call.startsWith("POST") && call.includes("/api/v1/events")),
      "fresh row must POST directly",
    );
    assert.deepEqual(res.acknowledgedIds, [event.id]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pushOutboxBatch re-POSTs retried rows and trusts per-relay state", async () => {
  const event = {
    id: "retry_ev_1",
    owner: "ed25519:ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
    collection: "gupt/chat/dm",
    blobs: [],
  };

  const calls = [];
  const store = makeOutboxStore({ events: [event], syncAttempts: 3 });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push(`${opts?.method || "GET"} ${url}`);
    if (url.includes(`/api/v1/events/${event.id}`)) {
      return new Response("{}", { status: 200 });
    }
    if (opts?.method === "POST" && url.includes("/api/v1/events")) {
      return new Response(JSON.stringify({ id: event.id }), { status: 201 });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const res = await pushOutboxBatch({
      store,
      blobs: null,
      relays: ["https://relay1.com"],
    });

    assert.ok(
      calls.some((call) => call.startsWith("POST") && call.includes("/api/v1/events")),
      `a retry re-POSTs; relays dedupe by event id, got: ${calls.join(", ")}`,
    );
    assert.deepEqual(res.acknowledgedIds, [event.id]);
    assert.deepEqual(store.result.completed, [event.id]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pushOutboxBatch drains rows concurrently, not one round-trip at a time", async () => {
  const events = Array.from({ length: 6 }, (_, i) => ({
    id: `parallel_ev_${i}`,
    owner: "ed25519:ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
    collection: "gupt/chat/dm",
    blobs: [],
  }));

  let inFlight = 0;
  let maxInFlight = 0;
  const store = makeOutboxStore({ events });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === "POST" && url.includes("/api/v1/events")) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const res = await pushOutboxBatch({
      store,
      blobs: null,
      relays: ["https://relay1.com"],
    });

    assert.equal(res.acknowledgedIds.length, 6);
    assert.deepEqual(new Set(store.result.completed), new Set(events.map((event) => event.id)));
    assert.ok(maxInFlight > 1, `rows must overlap in flight, max was ${maxInFlight}`);
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
  const store = makeOutboxStore({ events: [event] });

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
    assert.deepEqual(store.result.completed, [event.id], "All relays ok must leave the queue");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pushOutboxBatch uploads blobs before publishing their event", async () => {
  const blobBytes = new TextEncoder().encode("gupt-attachment-bytes");
  const blobHash = await sha256HexOfBytes(blobBytes);
  const event = {
    id: "outbound_ev_with_blob",
    owner: "ed25519:ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
    collection: "gupt/chat/dm",
    blobs: [blobHash],
  };

  const calls = [];
  const store = makeOutboxStore({ events: [event], blobBytes });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === "PUT" && url.includes("/api/v1/blobs")) {
      calls.push("blob");
      return new Response(JSON.stringify({ hash: blobHash }), { status: 201 });
    }
    if (opts?.method === "POST" && url.includes("/api/v1/events")) {
      calls.push("event");
      return new Response(JSON.stringify({ id: event.id }), { status: 201 });
    }
    if (url.includes(`/api/v1/events/${event.id}`)) {
      return new Response("{}", { status: 404 });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const res = await pushOutboxBatch({
      store,
      blobs: null,
      relays: ["https://relay1.com"],
    });

    assert.deepEqual(calls, ["blob", "event"], "Blob must be stored before the event is posted");
    assert.equal(res.acknowledgedIds.length, 1);
    assert.deepEqual(
      store.result.completed,
      [event.id],
      "Event and blobs complete must leave the queue",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pushOutboxBatch withholds the event when its blob cannot be uploaded", async () => {
  const blobBytes = new TextEncoder().encode("gupt-attachment-bytes");
  const blobHash = await sha256HexOfBytes(blobBytes);
  const event = {
    id: "outbound_ev_broken_blob",
    owner: "ed25519:ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
    collection: "gupt/chat/dm",
    blobs: [blobHash],
  };

  let postedEvent = false;
  const store = makeOutboxStore({ events: [event], blobBytes });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === "PUT" && url.includes("/api/v1/blobs")) {
      return new Response("{}", { status: 413 });
    }
    if (opts?.method === "POST" && url.includes("/api/v1/events")) {
      postedEvent = true;
      return new Response(JSON.stringify({ id: event.id }), { status: 201 });
    }
    if (url.includes(`/api/v1/events/${event.id}`)) {
      return new Response("{}", { status: 404 });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const res = await pushOutboxBatch({
      store,
      blobs: null,
      relays: ["https://relay2.com"],
    });

    assert.equal(postedEvent, false, "Event must not be published while its blob is missing");
    assert.equal(res.acknowledgedIds.length, 0);
    assert.equal(store.result.completed.length, 0, "Incomplete push must stay queued");
    assert.equal(store.result.scheduled.length, 1, "Incomplete push must schedule a retry");
    assert.equal(
      store.result.states.get(`${event.id}|https://relay2.com`)?.state,
      "error",
      "The relay's persisted state must record the blob failure",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pushOutboxBatch skips a relay the persisted state says already has the event", async () => {
  const event = {
    id: "persisted_ev_1",
    owner: "ed25519:ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
    collection: "gupt/chat/dm",
    blobs: [],
  };
  const store = makeOutboxStore({ events: [event] });
  const row = store.rows.get(event.id);
  row.relayStates["https://relay1.com"] = {
    relay: "https://relay1.com",
    state: "ok",
    at: Date.now(),
  };
  row.firstAckAt = Date.now();
  row.lastAckRelay = "https://relay1.com";

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (opts?.method === "POST" && url.includes("/api/v1/events")) {
      return new Response(JSON.stringify({ id: event.id }), { status: 201 });
    }
    return new Response("{}", { status: 200 });
  };
  try {
    const res = await pushOutboxBatch({
      store,
      relays: ["https://relay1.com", "https://relay2.com"],
    });
    assert.equal(
      calls.filter((url) => url.startsWith("https://relay1.com")).length,
      0,
      "a relay that already stored the event must not be asked again",
    );
    assert.equal(
      calls.filter((url) => url.startsWith("https://relay2.com")).length,
      1,
      "the remaining relay must receive it",
    );
    assert.deepEqual(res.acknowledgedIds, [event.id]);
    assert.deepEqual(store.result.completed, [event.id]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("syncCycle downloads and mirrors inbound blobs referenced by pulled events", async () => {
  const pubkey = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
  const blobHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const inboundEvent = {
    id: "inbound_ev_with_blob",
    owner: "ed25519:1111111111111111111111111111111111111111111111111111111111111111",
    collection: "gupt/chat/dm",
    created_at: 1000,
    blobs: [blobHash],
  };

  const putBlobCalls = [];
  const store = {
    listUnsyncedEvents: async () => [],
    getOutboxStatus: async () => ({ pending: 0, stuck: 0, failed: 0 }),
    getWatermark: async () => 0,
    setWatermark: async () => {},
    hasEventIds: async () => new Set(),
    putInboundEvent: async () => true,
    hasLocalBlob: async () => false,
    getBlobBytes: async (hash) => new Uint8Array([]), // SHA-256 of empty array is e3b0c442...
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes("/api/v1/events?")) {
      return new Response(
        JSON.stringify({
          events: [inboundEvent],
          next_cursor: null,
        }),
        { status: 200 },
      );
    }
    if (opts?.method === "PUT" && url.includes("/api/v1/blobs")) {
      putBlobCalls.push(url);
      return new Response(JSON.stringify({ hash: blobHash }), { status: 201 });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const summary = await syncCycle({
      store,
      blobs: null,
      pubkeyHex: pubkey,
      relays: ["https://relay1.com", "https://relay2.com"],
    });

    assert.equal(summary.pulledEvents, 1);
    assert.equal(summary.pulledBlobs, 1, "Must track pulled inbound blob");
    assert.equal(summary.pushedBlobs, 2, "Must mirror blob to both relays");
    assert.equal(putBlobCalls.length, 2, "Both relays must receive PUT /blobs");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
