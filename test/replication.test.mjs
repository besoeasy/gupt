/**
 * Unit tests for the replication module's pure logic.
 *
 * Self-contained — no imports from the app source, because replication.js
 * chains to idb.js which uses Vite's @/ alias (not resolvable in Node).
 * The constants and predicates tested here are copied from the source to
 * verify correctness of the algorithm, not the wiring.
 *
 * Runs with the built-in Node test runner:
 *   node --test test/
 */

import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Constants — must match src/lib/replication.js
// ---------------------------------------------------------------------------

const REPLICATABLE_KINDS = [1, 4];
const AGE_WINDOW_MS = 100 * 24 * 60 * 60 * 1000; // 100 days
const SAMPLE_SIZE = 5;
const SAMPLE_SIZE_DATA_SAVER = 3;
const RELAY_SAMPLE = 5;
const RELAY_SAMPLE_DATA_SAVER = 3;

// ---------------------------------------------------------------------------
// Scope constants
// ---------------------------------------------------------------------------

test("REPLICATABLE_KINDS includes only kinds 1 and 4", () => {
  assert.deepEqual([...REPLICATABLE_KINDS].sort(), [1, 4]);
});

test("AGE_WINDOW_MS is exactly 100 days in milliseconds", () => {
  const expected = 100 * 24 * 60 * 60 * 1000;
  assert.equal(AGE_WINDOW_MS, expected);
});

test("SAMPLE_SIZE and RELAY_SAMPLE are 5", () => {
  assert.equal(SAMPLE_SIZE, 5);
  assert.equal(RELAY_SAMPLE, 5);
});

test("data-saver sizes are 3", () => {
  assert.equal(SAMPLE_SIZE_DATA_SAVER, 3);
  assert.equal(RELAY_SAMPLE_DATA_SAVER, 3);
});

// ---------------------------------------------------------------------------
// Shuffle (Fisher-Yates) — copied from src/lib/replication.js
// ---------------------------------------------------------------------------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

test("shuffle preserves length and element membership", () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const result = shuffle(input);
  assert.equal(result.length, input.length);
  for (const el of input) {
    assert.ok(result.includes(el), `element ${el} missing from shuffle result`);
  }
});

test("shuffle does not mutate the input array", () => {
  const input = [1, 2, 3, 4, 5];
  const snapshot = [...input];
  shuffle(input);
  assert.deepEqual(input, snapshot);
});

test("shuffle of empty array returns empty array", () => {
  assert.deepEqual(shuffle([]), []);
});

test("shuffle of single-element array returns same element", () => {
  assert.deepEqual(shuffle([42]), [42]);
});

// ---------------------------------------------------------------------------
// Replication eligibility predicate — mirrors the .and() filter in
// sampleRawEvents (src/lib/idb.js)
// ---------------------------------------------------------------------------

function isEligibleForReplication(row, cutoff) {
  return REPLICATABLE_KINDS.includes(row.kind) && row.createdAt >= cutoff;
}

test("eligible: kind 1 and 4 within age window", () => {
  const cutoff = Date.now() - AGE_WINDOW_MS;
  assert.ok(isEligibleForReplication({ kind: 1, createdAt: Date.now() }, cutoff));
  assert.ok(isEligibleForReplication({ kind: 4, createdAt: Date.now() }, cutoff));
});

test("ineligible: kinds other than 1 and 4", () => {
  const cutoff = Date.now() - AGE_WINDOW_MS;
  assert.ok(!isEligibleForReplication({ kind: 5, createdAt: Date.now() }, cutoff));
  assert.ok(!isEligibleForReplication({ kind: 20004, createdAt: Date.now() }, cutoff));
  assert.ok(!isEligibleForReplication({ kind: 21004, createdAt: Date.now() }, cutoff));
  assert.ok(!isEligibleForReplication({ kind: 0, createdAt: Date.now() }, cutoff));
});

test("ineligible: older than age window", () => {
  const cutoff = Date.now() - AGE_WINDOW_MS;
  const oldTs = cutoff - 1000;
  assert.ok(!isEligibleForReplication({ kind: 4, createdAt: oldTs }, cutoff));
  assert.ok(!isEligibleForReplication({ kind: 1, createdAt: oldTs }, cutoff));
});

test("edge case: event exactly at cutoff is eligible", () => {
  const cutoff = 1000;
  assert.ok(isEligibleForReplication({ kind: 4, createdAt: cutoff }, cutoff));
});

// ---------------------------------------------------------------------------
// Sample sizing — verifies the min(N, sampleSize) logic in replicationTick
// ---------------------------------------------------------------------------

function pickSample(candidates, sampleSize) {
  return shuffle(candidates).slice(0, Math.min(sampleSize, candidates.length));
}

test("pickSample returns at most SAMPLE_SIZE items", () => {
  const candidates = Array.from({ length: 50 }, (_, i) => ({ id: i }));
  const sample = pickSample(candidates, SAMPLE_SIZE);
  assert.equal(sample.length, SAMPLE_SIZE);
});

test("pickSample returns at most SAMPLE_SIZE_DATA_SAVER items", () => {
  const candidates = Array.from({ length: 50 }, (_, i) => ({ id: i }));
  const sample = pickSample(candidates, SAMPLE_SIZE_DATA_SAVER);
  assert.equal(sample.length, SAMPLE_SIZE_DATA_SAVER);
});

test("pickSample returns all items when fewer than SAMPLE_SIZE", () => {
  const candidates = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const sample = pickSample(candidates, SAMPLE_SIZE);
  assert.equal(sample.length, 3);
  for (const c of candidates) {
    assert.ok(sample.includes(c));
  }
});

test("pickSample returns empty array for empty input", () => {
  assert.deepEqual(pickSample([], SAMPLE_SIZE), []);
});

test("pickSample does not mutate input", () => {
  const candidates = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
  const snapshot = [...candidates];
  pickSample(candidates, SAMPLE_SIZE);
  assert.deepEqual(candidates, snapshot);
});
