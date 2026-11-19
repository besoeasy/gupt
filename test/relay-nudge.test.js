import test from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() {
    return store.size;
  },
};

const { RELAY_RECOMMENDED_MIN, shouldShowRelayNudge, dismissRelayNudge, readRelayNudgeState } =
  await import("../src/lib/relayNudge.js");

const STORAGE_KEY = "gupt:relay-nudge:v1";

test("the nudge shows below the recommended floor and stops at it", () => {
  store.clear();
  assert.equal(RELAY_RECOMMENDED_MIN, 5);
  for (const count of [0, 1, 2, 3, 4]) {
    assert.equal(shouldShowRelayNudge(count), true, `count ${count}`);
  }
  for (const count of [5, 6, 12]) {
    assert.equal(shouldShowRelayNudge(count), false, `count ${count}`);
  }
});

test("dismissing at a count hides it until the setup gets worse", () => {
  store.clear();
  assert.equal(dismissRelayNudge(3), true);
  assert.deepEqual(readRelayNudgeState()?.countAtDismiss, 3);

  assert.equal(shouldShowRelayNudge(3), false);
  assert.equal(shouldShowRelayNudge(4), false);
  assert.equal(shouldShowRelayNudge(2), true);
  assert.equal(shouldShowRelayNudge(1), true);
  assert.equal(shouldShowRelayNudge(5), false);
});

test("adding relays after a dismissal does not bring the nudge back", () => {
  store.clear();
  dismissRelayNudge(1);
  assert.equal(shouldShowRelayNudge(2), false);
  assert.equal(shouldShowRelayNudge(3), false);
});

test("a corrupt dismissal record fails closed instead of nagging", () => {
  store.clear();
  store.set(STORAGE_KEY, "{not json");
  assert.equal(shouldShowRelayNudge(2), false);
});

test("missing storage fails closed", () => {
  const previous = globalThis.localStorage;
  store.clear();
  globalThis.localStorage = undefined;
  try {
    assert.equal(shouldShowRelayNudge(2), false);
  } finally {
    globalThis.localStorage = previous;
  }
});

test("a fresh install with two defaults is nudged", () => {
  store.clear();
  assert.equal(shouldShowRelayNudge(2), true);
});
