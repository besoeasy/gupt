/**
 * Unit tests for relay hint picking (pickRelayHint).
 *
 * Self-contained — no imports from the app source, because selection.js chains
 * to idb.js which uses Vite's @/ alias (not resolvable in Node). The algorithm
 * tested here mirrors src/lib/relay/selection.js to verify correctness, not wiring.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const HINT_MIN_SCORE = 0.5;

function relayHintHash(relay) {
  return createHash("sha256").update(relay).digest("hex");
}

function pickRelayHint(ranking) {
  if (!ranking.length) return null;

  const healthy = ranking.filter((r) => (r.score ?? 0) >= HINT_MIN_SCORE);
  if (healthy.length) {
    return healthy[Math.floor(Math.random() * healthy.length)].relay;
  }

  const best = Math.max(...ranking.map((r) => r.score ?? 0));
  const tied = ranking.filter((r) => (r.score ?? 0) === best);
  return tied.reduce((a, b) => (relayHintHash(a.relay) < relayHintHash(b.relay) ? a : b)).relay;
}

test("returns null for empty ranking", () => {
  assert.equal(pickRelayHint([]), null);
});

test("picks only from relays scoring >= 0.5", () => {
  const ranking = [
    { relay: "wss://bad.example", score: 0.2 },
    { relay: "wss://good1.example", score: 0.9 },
    { relay: "wss://good2.example", score: 0.5 },
  ];
  for (let i = 0; i < 50; i++) {
    const hint = pickRelayHint(ranking);
    assert.ok(["wss://good1.example", "wss://good2.example"].includes(hint));
  }
});

test("falls back to highest score when nothing reaches 0.5", () => {
  const ranking = [
    { relay: "wss://meh.example", score: 0.4 },
    { relay: "wss://best.example", score: 0.49 },
  ];
  assert.equal(pickRelayHint(ranking), "wss://best.example");
});

test("tie-break resolves deterministically via sha256 of the url", () => {
  const ranking = [
    { relay: "wss://a.example", score: 0.3 },
    { relay: "wss://b.example", score: 0.3 },
    { relay: "wss://c.example", score: 0.3 },
  ];
  const expected = [...ranking].sort((a, b) =>
    relayHintHash(a.relay) < relayHintHash(b.relay) ? -1 : 1,
  )[0].relay;
  for (let i = 0; i < 10; i++) {
    assert.equal(pickRelayHint(ranking), expected);
  }
});

test("relayHintHash is stable and 64 hex chars", () => {
  const h1 = relayHintHash("wss://a.example");
  const h2 = relayHintHash("wss://a.example");
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});
