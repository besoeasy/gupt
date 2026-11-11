import test from "node:test";
import assert from "node:assert/strict";
import { generateKeypair } from "../src/lib/crypto.js";
import { api } from "../src/lib/api.js";
import { postEventOnce, pullMonotonicStream } from "../src/lib/engine/core.js";

test("live Rabta: Alice sends DM to Bob -> Bob pulls via stream and parses message", async () => {
  const relay = "https://rabta.t3nk.com";

  // 1. Generate ephemeral keypairs for Alice and Bob
  const alice = generateKeypair();
  const bob = generateKeypair();

  const bobIdentity = {
    privkeyHex: bob.privkeyHex,
    pubkeyHex: bob.pubkeyHex,
  };

  // 2. Alice prepares and posts a DM to Bob
  const payload = {
    type: "text",
    text: "Real-time sync test " + Date.now(),
  };

  const { id, event } = await api.prepareDirectMessage(alice.privkeyHex, bob.pubkeyHex, payload);
  const posted = await postEventOnce(relay, event);
  assert.equal(posted, true, "Alice event successfully posted to relay");

  // 3. Bob's mock store simulating Dexie store with counterparty routing
  const storedRows = [];
  const watermarks = new Map();

  const mockStore = {
    async getWatermark(key) {
      return watermarks.get(key) || 0;
    },
    async setWatermark(key, val) {
      watermarks.set(key, val);
    },
    async hasEventIds(ids) {
      return new Set();
    },
    async putInboundEvent(ev, selfHex) {
      storedRows.push({
        id: ev.id,
        event: ev,
        origin: "dm",
        peerPubkey: alice.pubkeyHex,
      });
      return true;
    },
  };

  // 4. Bob pulls monotonic stream
  const pullSummary = await pullMonotonicStream({
    store: mockStore,
    pubkeyHex: bob.pubkeyHex,
    relays: [relay],
    maxPagesPerChannel: 3,
  });

  assert.ok(pullSummary.pulledEvents >= 1, "Bob pulled at least 1 event");
  assert.ok(pullSummary.pulledIds.includes(id), "Bob pulled Alice's event ID");

  // 5. Bob parses stored raw rows
  const parsed = await api.parseStoredDmRows(storedRows, bobIdentity);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, id);
  assert.equal(parsed[0].text, payload.text);
  assert.equal(parsed[0].peerPubkey, alice.pubkeyHex);
  assert.equal(parsed[0].mine, false);
  assert.equal(parsed[0].type, "text");
});
