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

const { finalizeEvent } = await import("../src/lib/crypto.js");
const {
  RELAY_HINTS_COLLECTION,
  RELAY_HINT_TTL_SECONDS,
  RELAY_HINT_IGNORED_KEY,
  collapseRelayHints,
  ignoreRelayHint,
  normalizeHintUrl,
  parseRelayHint,
  readIgnoredHintUrls,
  relayHintLabel,
  restoreIgnoredRelayHint,
  selectRelaySuggestions,
} = await import("../src/lib/relayHints.js");

const KEY_A = "11".repeat(32);
const KEY_B = "22".repeat(32);
const KEY_C = "33".repeat(32);
const NOW = 1_800_000_000;
const NOW_MS = NOW * 1000;

function hint(privkeyHex, data, { createdAt = NOW, ttl = RELAY_HINT_TTL_SECONDS } = {}) {
  return finalizeEvent(
    {
      collection: RELAY_HINTS_COLLECTION,
      kind: 1,
      labels: ["https"],
      created_at: createdAt,
      expires_at: createdAt + ttl,
      data: { v: 1, url: "https://relay-a.rabta.space", ...data },
    },
    privkeyHex,
  );
}

test("hint URLs are https origins only", () => {
  assert.equal(normalizeHintUrl("relay-a.rabta.space"), "https://relay-a.rabta.space");
  assert.equal(normalizeHintUrl("HTTPS://Relay-A.Rabta.Space/"), "https://relay-a.rabta.space");
  assert.equal(
    normalizeHintUrl("https://relay.rabta.space:8443"),
    "https://relay.rabta.space:8443",
  );
  assert.equal(normalizeHintUrl("https://relay.rabta.space:443"), "https://relay.rabta.space");

  for (const bad of [
    "http://relay.rabta.space",
    "wss://relay.rabta.space",
    "https://relay.rabta.space/path",
    "https://relay.rabta.space/?q=1",
    "https://relay.rabta.space/#frag",
    "https://user:pass@relay.rabta.space",
    "https://localhost",
    "https://relay.local",
    "https://intranet",
    "https://192.168.1.10",
    "https://[::1]",
    "https://example.com",
    "not a url",
    "",
  ]) {
    assert.equal(normalizeHintUrl(bad), "", bad);
  }
});

const OWNER_A = hint(KEY_A, {}).owner.replace(/^ed25519:/i, "");
const OWNER_B = hint(KEY_B, {}).owner.replace(/^ed25519:/i, "");

test("a signed hint parses; tampered and foreign events do not", () => {
  const event = hint(KEY_A, { note: "  fast\nnode  " });
  assert.equal(event.collection, RELAY_HINTS_COLLECTION);
  assert.equal(event.expires_at - event.created_at, RELAY_HINT_TTL_SECONDS);

  const row = parseRelayHint(event);
  assert.ok(row);
  assert.equal(row.url, "https://relay-a.rabta.space");
  assert.equal(row.pubkey, OWNER_A);
  assert.equal(row.note, "fast node");
  assert.equal(row.createdAt, NOW_MS);
  assert.equal(row.expiresAt, NOW_MS + RELAY_HINT_TTL_SECONDS * 1000);

  assert.equal(
    parseRelayHint({ ...event, data: { ...event.data, url: "https://evil.test" } }),
    null,
  );
  assert.equal(parseRelayHint({ ...event, sig: "00".repeat(64) }), null);
  assert.equal(parseRelayHint({ ...event, collection: "gupt/feed" }), null);
  assert.equal(parseRelayHint(hint(KEY_A, { v: 2 })), null);
  assert.equal(parseRelayHint(hint(KEY_A, { url: "http://relay.rabta.space" })), null);
  assert.equal(parseRelayHint(null), null);
});

test("collapse keeps the newest hint per author and relay, then counts vouches", () => {
  const events = [
    hint(KEY_A, { note: "old" }, { createdAt: NOW - 500 }),
    hint(KEY_A, { note: "new" }),
    hint(KEY_B, {}),
    hint(KEY_C, { url: "https://relay-b.rabta.space" }),
    // Expired hints never count, even if they are the newest.
    hint(KEY_C, { note: "expired" }, { createdAt: NOW - 600, ttl: 100 }),
  ];

  const rows = collapseRelayHints(events, { now: NOW_MS, contactPubkeys: new Set([OWNER_B]) });
  assert.equal(rows.length, 2);

  const a = rows.find((row) => row.url === "https://relay-a.rabta.space");
  assert.equal(a.authorCount, 2);
  assert.equal(a.contactCount, 1);
  assert.equal(a.note, "new");
  assert.deepEqual(a.authors.sort(), [OWNER_A, OWNER_B].sort());

  const b = rows.find((row) => row.url === "https://relay-b.rabta.space");
  assert.equal(b.authorCount, 1);
  assert.equal(b.contactCount, 0);
});

test("selection drops configured, ignored, unverified and mismatched relays", () => {
  const verified = {
    url: "https://relay-a.rabta.space",
    nodeId: "aa".repeat(32),
    reachable: true,
    verifiedAt: NOW_MS,
    contactCount: 0,
    authorCount: 1,
    latencyMs: 90,
  };
  const rows = [
    { ...verified, contactCount: 1, latencyMs: 220 },
    verified,
    { ...verified, url: "https://relay-dup.rabta.space", contactCount: 0, latencyMs: 40 },
    { ...verified, url: "https://relay-known.rabta.space" },
    { ...verified, url: "https://relay-ignored.rabta.space" },
    { ...verified, url: "https://relay-dead.rabta.space", reachable: false },
    {
      ...verified,
      url: "https://relay-ro.rabta.space",
      nodeId: "bb".repeat(32),
      mode: "read_only",
    },
    {
      ...verified,
      url: "https://relay-moved.rabta.space",
      nodeId: "cc".repeat(32),
      nodeMismatch: true,
    },
  ];

  const picked = selectRelaySuggestions(rows, {
    knownRelays: ["https://relay-known.rabta.space"],
    ignoredUrls: ["https://relay-ignored.rabta.space"],
  });

  assert.deepEqual(
    picked.map((row) => row.url),
    ["https://relay-a.rabta.space"],
  );
  // One node, one suggestion: the contact-vouched row wins over its duplicate.
  assert.equal(picked.length, 1);
  assert.equal(picked[0].contactCount, 1);
});

test("ignored relays persist until restored", () => {
  store.clear();
  ignoreRelayHint("https://relay-a.rabta.space");
  ignoreRelayHint("https://relay-a.rabta.space/");
  ignoreRelayHint("not a url");
  assert.deepEqual(readIgnoredHintUrls(), ["https://relay-a.rabta.space"]);
  assert.equal(store.has(RELAY_HINT_IGNORED_KEY), true);

  restoreIgnoredRelayHint("https://relay-a.rabta.space");
  assert.deepEqual(readIgnoredHintUrls(), []);
});

test("labels hide the scheme and tolerate junk", () => {
  assert.equal(relayHintLabel("https://relay.rabta.space"), "relay.rabta.space");
  assert.equal(relayHintLabel("http://relay.rabta.space"), "");
});
