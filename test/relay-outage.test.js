import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { clearRelayCircuit, filterLiveRelays, isRelayDead } from "../src/lib/relay/circuit.js";
import { pullMonotonicStream, pushOutboxBatch, syncCycle } from "../src/lib/engine/core.js";

// Reliability contract: one relay of several being down must never stall or
// lose a message. These tests stand a real "down" node (a 502 from an edge,
// no CORS headers, exactly what a dead Rabta behind Cloudflare answers) next
// to a healthy one and drive the shipped engine paths against both.

const SELF = "c".repeat(64);
const SENT_ID = "a".repeat(64);
const PULLED_ID = "b".repeat(64);

test.beforeEach(() => {
  clearRelayCircuit();
});

function listen(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const entry = { method: req.method, path: url.pathname, body, headers: req.headers };
      requests.push(entry);
      handler(entry, res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/** A dead node behind an edge: every route answers 502 with no CORS headers. */
function startDownRelay() {
  return listen((_req, res) => {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("error code: 502");
  });
}

/** A healthy Rabta node: accepts events, serves what it holds, CORS open. */
function startLiveRelay({ events = [] } = {}) {
  return listen((req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    };
    if (req.method === "POST" && req.path === "/api/v1/events") {
      res.writeHead(201, cors);
      res.end(JSON.stringify({ id: JSON.parse(req.body || "{}").id }));
      return;
    }
    if (req.method === "GET" && req.path === "/api/v1/events") {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ events, next_cursor: null }));
      return;
    }
    if (req.method === "GET" && req.path === "/api/v1/events/count") {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ count: events.length }));
      return;
    }
    res.writeHead(404, cors);
    res.end("{}");
  });
}

function outboxEvent() {
  return {
    id: SENT_ID,
    pubkey: SELF,
    created_at: 1700000000,
    kind: 4,
    collection: "gupt/chat/dm",
    tags: [["gupt-dm", SELF]],
    content: "encrypted",
    data: { type: "text", text: "relay outage" },
    blobs: [],
  };
}

function stubStore({ pending = [], incoming = [] } = {}) {
  const stored = new Map();
  const relayStates = [];
  const completed = new Set();
  const retries = [];
  const watermarks = new Map();
  const unsynced = pending.map((event) => ({ event, syncAttempts: 0, relayStates: {} }));
  return {
    stored,
    relayStates,
    completed,
    retries,
    watermarks,
    async listUnsyncedEvents() {
      return unsynced;
    },
    async recordOutboxRelayState(id, relay, state) {
      relayStates.push({ id, relay, ...state });
    },
    async completeOutboxEvent(id) {
      completed.add(id);
    },
    async scheduleOutboxRetry(id, info) {
      retries.push({ id, ...info });
      return { nextDue: info.nextDue, expired: false };
    },
    async getOutboxStatus() {
      return { pending: unsynced.length, stuck: 0, failed: 0 };
    },
    async getBlobBytes() {
      return null;
    },
    async getWatermark(key) {
      return watermarks.get(key) || 0;
    },
    async setWatermark(key, value) {
      watermarks.set(key, value);
    },
    async hasEventIds(ids) {
      return new Set(ids.filter((id) => stored.has(id) || id === SENT_ID));
    },
    async putInboundEvent(event) {
      if (stored.has(event.id)) return false;
      stored.set(event.id, event);
      return true;
    },
    async countLocalEvents() {
      return 0;
    },
    _incoming: incoming,
  };
}

test("a send still reaches the healthy relay when the first-ranked relay is down", async () => {
  const down = await startDownRelay();
  const live = await startLiveRelay();
  try {
    const store = stubStore({ pending: [outboxEvent()] });
    // Worst case: the dead relay is first in config and top-ranked by history.
    const relayScores = {
      [down.url]: { writeScore: 9.5, latencyMs: 120 },
      [live.url]: { writeScore: 1, latencyMs: 400 },
    };
    const startedAt = Date.now();
    const summary = await pushOutboxBatch({
      store,
      relays: [down.url, live.url],
      relayScores,
    });
    const elapsed = Date.now() - startedAt;

    // The dead node was tried and failed, and the send went out anyway.
    assert.equal(down.requests.length, 1);
    assert.equal(live.requests.length, 1);
    assert.equal(JSON.parse(live.requests[0].body).id, SENT_ID);

    assert.deepEqual(summary.acknowledgedIds, [SENT_ID]);
    assert.deepEqual(summary.failedIds, []);
    // One relay holding it is enough to release the sender; the cycle keeps
    // mirroring the rest on the next pass instead of blocking the message.
    const retry = store.retries.find((r) => r.id === SENT_ID);
    assert.ok(retry?.partial, "a mirror-to-the-others retry is scheduled, marked partial");
    const liveState = store.relayStates.find((s) => s.relay === live.url && s.state === "ok");
    const downState = store.relayStates.find((s) => s.relay === down.url && s.state === "error");
    assert.ok(liveState, "healthy relay is recorded as ok");
    assert.ok(downState, "dead relay is recorded as error, not silently dropped");
    assert.ok(elapsed < 3000, `send should not wait on the dead relay, took ${elapsed}ms`);
  } finally {
    await down.close();
    await live.close();
  }
});

test("relays inside one send are tried in parallel, so the fastest accept wins", async () => {
  // A slow but healthy node must not delay the ack: both are POSTed at once.
  const slow = await listen((req, res) => {
    setTimeout(() => {
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: JSON.parse(req.body || "{}").id }));
    }, 400);
  });
  const fast = await startLiveRelay();
  try {
    const store = stubStore({ pending: [outboxEvent()] });
    let ackedAt = 0;
    const startedAt = Date.now();
    const summary = await pushOutboxBatch({
      store,
      relays: [slow.url, fast.url],
      onAck: () => {
        ackedAt = Date.now();
      },
    });

    assert.deepEqual(summary.acknowledgedIds, [SENT_ID]);
    assert.ok(ackedAt > 0, "the send was acked");
    assert.ok(ackedAt - startedAt < 250, `ack waited for the slow relay: ${ackedAt - startedAt}ms`);
    assert.equal(slow.requests.length, 1, "the slow relay was not skipped, it was just slower");
    assert.equal(fast.requests.length, 1);
  } finally {
    await slow.close();
    await fast.close();
  }
});

test("an inbound message arrives while one relay is down", async () => {
  const down = await startDownRelay();
  const incoming = {
    id: PULLED_ID,
    pubkey: SELF,
    created_at: 1700000100,
    collection: "gupt/chat/dm",
    tags: [["gupt-dm", SELF]],
    content: "ciphertext",
  };
  const live = await startLiveRelay({ events: [incoming] });
  try {
    const store = stubStore();
    const summary = await syncCycle({
      store,
      pubkeyHex: SELF,
      relays: [down.url, live.url],
      relayScores: { [down.url]: { readScore: 1 }, [live.url]: { readScore: 0.1 } },
    });

    assert.deepEqual(summary.pulledIds, [PULLED_ID]);
    assert.deepEqual([...store.stored.keys()], [PULLED_ID]);
    // The pull error is reported, not fatal.
    assert.ok(
      summary.errors.some((line) => line.includes(down.url)),
      "the dead relay is named in the cycle errors",
    );
  } finally {
    await down.close();
    await live.close();
  }
});

test("a refused relay is skipped on the next pull instead of costing a budget", async () => {
  // Port 9 is the discard port: a connection there is refused, like a node
  // that is not listening at all.
  const refused = "http://127.0.0.1:9";
  const incoming = {
    id: PULLED_ID,
    pubkey: SELF,
    created_at: 1700000100,
    collection: "gupt/chat/dm",
    tags: [["gupt-dm", SELF]],
    content: "ciphertext",
  };
  const live = await startLiveRelay({ events: [incoming] });
  try {
    const store = stubStore();
    const first = await pullMonotonicStream({
      store,
      pubkeyHex: SELF,
      relays: [refused, live.url],
    });
    assert.deepEqual(first.pulledIds, [PULLED_ID]);
    assert.equal(isRelayDead(refused), true, "refused transport trips the breaker");
    assert.deepEqual(filterLiveRelays([refused, live.url]), [live.url]);

    const before = live.requests.length;
    const second = await pullMonotonicStream({
      store,
      pubkeyHex: SELF,
      relays: [refused, live.url],
    });
    assert.equal(second.pulledIds.length, 0);
    assert.ok(live.requests.length > before, "the live relay is still polled");
  } finally {
    await live.close();
  }
});

test("with every relay down the event is kept and retried, never dropped", async () => {
  const downA = await startDownRelay();
  const downB = await startDownRelay();
  try {
    const store = stubStore({ pending: [outboxEvent()] });
    const summary = await pushOutboxBatch({ store, relays: [downA.url, downB.url] });

    assert.deepEqual(summary.acknowledgedIds, []);
    assert.deepEqual(summary.failedIds, [], "an expired event, not a transient outage, is failed");
    assert.ok(
      store.retries.some((r) => r.id === SENT_ID),
      "the outbox schedules another try",
    );
    assert.equal(store.completed.has(SENT_ID), false, "nothing is marked complete");
  } finally {
    await downA.close();
    await downB.close();
  }
});
