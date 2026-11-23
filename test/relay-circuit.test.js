import test from "node:test";
import assert from "node:assert/strict";

import {
  RELAY_DEAD_TTL_MS,
  isRelayDead,
  markRelayDead,
  markRelayAlive,
  filterLiveRelays,
  noteRelayOutcome,
  clearRelayCircuit,
} from "../src/lib/relay/circuit.js";
import {
  RELAY_ATTEMPT_BASE_MS,
  RELAY_ATTEMPT_MAX_MS,
  relayAttemptTimeoutMs,
  capRelayTimeoutMs,
} from "../src/lib/relay/timeouts.js";

test.beforeEach(() => {
  clearRelayCircuit();
});

test("a relay that fails transport is dead for 300s", () => {
  assert.equal(RELAY_DEAD_TTL_MS, 300_000);

  const now = Date.now();
  assert.equal(isRelayDead("https://rabta.gupt.app", now), false);
  noteRelayOutcome(
    "https://rabta.gupt.app/",
    { ok: false, latencyMs: 3000, error: "timeout" },
    now,
  );
  assert.equal(isRelayDead("https://rabta.gupt.app", now), true);
  // Still dead just before expiry, alive right after.
  assert.equal(isRelayDead("https://rabta.gupt.app", now + RELAY_DEAD_TTL_MS - 1), true);
  assert.equal(isRelayDead("https://rabta.gupt.app", now + RELAY_DEAD_TTL_MS), false);
});

test("a slow success never trips the breaker", () => {
  const now = Date.now();
  noteRelayOutcome("https://slow.example", { ok: true, latencyMs: 30_000 }, now);
  assert.equal(isRelayDead("https://slow.example", now), false);
});

test("a fast success revives the relay", () => {
  const now = Date.now();
  markRelayDead("https://flappy.example", RELAY_DEAD_TTL_MS, now);
  assert.equal(isRelayDead("https://flappy.example", now), true);
  noteRelayOutcome("https://flappy.example", { ok: true, latencyMs: 120 }, now + 1000);
  assert.equal(isRelayDead("https://flappy.example", now + 1000), false);
});

test("HTTP error statuses prove the relay answered", () => {
  const now = Date.now();
  noteRelayOutcome("https://sick.example", { ok: false, latencyMs: 200, error: "HTTP 500" }, now);
  assert.equal(isRelayDead("https://sick.example", now), false);
  // ...but a failure with no detail trips it.
  noteRelayOutcome("https://sick.example", { ok: false, latencyMs: 50 }, now);
  assert.equal(isRelayDead("https://sick.example", now), true);
});

test("network errors trip the breaker", () => {
  const now = Date.now();
  for (const error of ["fetch failed", "Network error", "aborted", "ECONNREFUSED"]) {
    clearRelayCircuit();
    noteRelayOutcome("https://down.example", { ok: false, latencyMs: 40, error }, now);
    assert.equal(isRelayDead("https://down.example", now), true, String(error));
  }
});

test("filterLiveRelays skips dead relays and falls back when all are dead", () => {
  const now = Date.now();
  const relays = ["https://a.example", "https://b.example"];
  assert.deepEqual(filterLiveRelays(relays, now), relays);
  markRelayDead("https://a.example/", RELAY_DEAD_TTL_MS, now);
  assert.deepEqual(filterLiveRelays(relays, now), ["https://b.example"]);
  markRelayDead("https://b.example", RELAY_DEAD_TTL_MS, now);
  // All dead: trying beats giving up.
  assert.deepEqual(filterLiveRelays(relays, now), relays);
});

test("relay URLs normalize trailing slashes", () => {
  const now = Date.now();
  markRelayDead("https://norm.example///", RELAY_DEAD_TTL_MS, now);
  assert.equal(isRelayDead("https://norm.example", now), true);
  markRelayAlive("https://norm.example/");
  assert.equal(isRelayDead("https://norm.example", now), false);
});

test("caller timeouts cap at the adaptive ceiling, never a fixed window", () => {
  assert.equal(capRelayTimeoutMs(5000), 5000);
  assert.equal(capRelayTimeoutMs(30_000), RELAY_ATTEMPT_MAX_MS);
  assert.equal(capRelayTimeoutMs(1000), 1000);
  assert.equal(capRelayTimeoutMs(undefined), RELAY_ATTEMPT_BASE_MS);
});

test("attempt budgets adapt to observed latency and double per round", () => {
  assert.equal(relayAttemptTimeoutMs(0, 0), RELAY_ATTEMPT_BASE_MS);
  assert.equal(relayAttemptTimeoutMs(1000, 0), 3000);
  assert.equal(relayAttemptTimeoutMs(1000, 1), 6000);
  assert.equal(relayAttemptTimeoutMs(1000, 2), RELAY_ATTEMPT_MAX_MS);
  assert.equal(relayAttemptTimeoutMs(60_000, 0), RELAY_ATTEMPT_MAX_MS);
});

test("engine relayRequest fails fast for a dead relay without fetching", async () => {
  const { relayRequest } = await import("../src/lib/engine/core.js");
  markRelayDead("https://dead.example");
  let fetched = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error("must not fetch a dead relay");
  };
  try {
    await assert.rejects(() => relayRequest("https://dead.example/api/v1/events?limit=1"), {
      relayDead: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetched, false);
});

test("engine relayRequest marks a hanging relay dead", async () => {
  const { relayRequest, isRelayDead: engineSeesDead } = await import("../src/lib/engine/core.js");
  // Re-export check: core shares the same breaker module.
  assert.equal(typeof engineSeesDead, "undefined");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("fetch failed");
  };
  try {
    await assert.rejects(
      () =>
        relayRequest("https://hang.example/api/v1/events?limit=1", {
          timeoutMs: 50,
          retries: 1,
        }),
      /fetch failed/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(isRelayDead("https://hang.example"), true);
});
