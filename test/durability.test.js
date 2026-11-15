import test from "node:test";
import assert from "node:assert/strict";
import { auditEventCopies, auditStreamItems, summarizeAudits } from "../src/lib/durability.js";
import { selectStreamRenewals, renewStreamItems } from "../src/lib/streamRenewal.js";
import { countEvents, fetchEventDetailed } from "../src/lib/rabta/index.js";

const ID_A = "a".repeat(64);
const ID_B = "b".repeat(64);
const ID_C = "c".repeat(64);

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => handler(String(url), opts || {});
  return () => {
    globalThis.fetch = original;
  };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("auditEventCopies splits live, missing and unknown copies", async () => {
  const restore = mockFetch((url) => {
    if (url.includes("live.relay")) return new Response(null, { status: 304 });
    if (url.includes("missing.relay")) return json({ code: "not_found" }, 404);
    return new Response("boom", { status: 503 });
  });
  try {
    const res = await auditEventCopies(ID_A, [
      "https://live.relay",
      "https://missing.relay",
      "https://down.relay",
    ]);
    assert.deepEqual(res.live, ["https://live.relay"]);
    assert.deepEqual(res.missing, ["https://missing.relay"]);
    assert.deepEqual(res.unknown, ["https://down.relay"]);
  } finally {
    restore();
  }
});

test("auditEventCopies sends the id as If-None-Match so existence checks are body-free", async () => {
  let sent = null;
  const restore = mockFetch((url, opts) => {
    sent = opts.headers?.["If-None-Match"];
    return new Response(null, { status: 304 });
  });
  try {
    await auditEventCopies(ID_A.toUpperCase(), ["https://live.relay"]);
    assert.equal(sent, `"${ID_A}"`);
  } finally {
    restore();
  }
});

test("auditStreamItems flags only events with no live copy on any relay", async () => {
  const restore = mockFetch((url) => {
    if (url.endsWith(ID_A)) return json({ code: "not_found" }, 404);
    return new Response(null, { status: 304 });
  });
  try {
    const items = [
      { id: "item-a", eventId: ID_A },
      { id: "item-b", eventId: ID_B },
      { id: "item-c" },
    ];
    const res = await auditStreamItems(items, ["https://r1.relay", "https://r2.relay"]);
    assert.equal(res.missingEventIds.size, 1);
    assert.ok(res.missingEventIds.has(ID_A));

    const summary = summarizeAudits(res.audits);
    assert.equal(summary.events, 2);
    assert.equal(summary.missingEvents, 1);
  } finally {
    restore();
  }
});

test("selectStreamRenewals renews missing copies before aged items", () => {
  const now = 1_700_000_000_000;
  const items = [
    { id: "old", updatedAt: now - 60 * 86400_000, expiresAt: now + 1000 },
    { id: "lost", eventId: ID_A, updatedAt: now - 1000, expiresAt: now + 1000 },
  ];
  const picked = selectStreamRenewals(items, { now, missingEventIds: new Set([ID_A]) });
  assert.deepEqual(
    picked.map((item) => item.id),
    ["lost", "old"],
  );
});

test("renewStreamItems audits and renews missing items regardless of age", async () => {
  const now = 1_700_000_000_000;
  const items = [
    { id: "young-lost", eventId: ID_A, updatedAt: now - 1000, expiresAt: now + 1000 },
    { id: "young-ok", eventId: ID_B, updatedAt: now - 1000, expiresAt: now + 1000 },
  ];
  const renewed = [];
  const result = await renewStreamItems(
    items,
    async (item) => {
      renewed.push(item.id);
      return { ...item, updatedAt: now };
    },
    { now, minAgeMs: Number.MAX_SAFE_INTEGER, audit: async () => new Set([ID_A]) },
  );
  assert.deepEqual(renewed, ["young-lost"]);
  assert.equal(result.renewedCount, 1);
});

test("fetchEventDetailed revalidates a cached body with If-None-Match", async () => {
  let calls = 0;
  const body = { id: ID_C, collection: "gupt/profiles", data: {} };
  const restore = mockFetch((url, opts) => {
    calls++;
    if (calls === 1) return json(body);
    assert.equal(opts.headers?.["If-None-Match"], `"${ID_C}"`);
    return new Response(null, { status: 304 });
  });
  try {
    const first = await fetchEventDetailed(ID_C, ["https://r.one"]);
    assert.equal(first.event.id, ID_C);

    const second = await fetchEventDetailed(ID_C, ["https://r.one"]);
    assert.equal(second.event.id, ID_C);
    assert.equal(second.outcomes[0].notModified, true);
  } finally {
    restore();
  }
});

test("countEvents merges relays by largest count, not a sum", async () => {
  const restore = mockFetch((url) => json({ count: url.includes("a.relay") ? 3 : 5 }));
  try {
    const res = await countEvents(
      { owner: `ed25519:${ID_A}`, collectionGlob: "gupt/*" },
      ["https://a.relay", "https://b.relay"],
    );
    assert.equal(res.count, 5);
    assert.equal(res.relayResults.length, 2);
  } finally {
    restore();
  }
});
