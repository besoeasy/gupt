import test from "node:test";
import assert from "node:assert/strict";
import { generateKeypair } from "../src/lib/crypto.js";
import { api } from "../src/lib/api.js";
import { verifyEvent } from "../src/lib/rabta/index.js";
import { createEngineStore } from "../src/lib/engine/store.js";
import { pullMonotonicStream, syncCycle } from "../src/lib/engine/core.js";

test("Alice sends DM to Bob -> Bob parses stored row", async () => {
  const alice = generateKeypair();
  const bob = generateKeypair();

  const payload = {
    text: "Hello Bob!",
    type: "text",
    ts: Date.now(),
  };

  const { id, event } = await api.prepareDirectMessage(
    alice.privkeyHex,
    bob.pubkeyHex,
    payload,
  );

  assert.ok(id);
  assert.ok(verifyEvent(event), "Event signature must be valid");

  // In-memory store simulating Bob's Dexie
  const db = new Map();
  const watermarks = new Map();

  const store = {
    async hasEventIds(ids) {
      const res = new Set();
      for (const id of ids) if (db.has(id)) res.add(id);
      return res;
    },
    async putInboundEvent(ev, selfHex) {
      if (!ev?.id) return false;
      const owner = (ev.owner || ev.pubkey || "").replace(/^ed25519:/, "").toLowerCase();
      // Emulate createEngineStore's putInboundEvent
      const peer = owner !== selfHex.toLowerCase() ? owner : null;
      db.set(ev.id, {
        id: ev.id,
        event: ev,
        origin: "dm",
        peerPubkey: peer,
      });
      return true;
    },
    async getEventsByIds(ids) {
      return ids.map((id) => db.get(id)).filter(Boolean);
    },
    async getWatermark(key) {
      return watermarks.get(key) || 0;
    },
    async setWatermark(key, ts) {
      watermarks.set(key, ts);
    },
    async listUnsyncedEvents() {
      return [];
    },
    async countLocalEvents() {
      return db.size;
    },
  };

  // 1. Bob ingests the event
  const stored = await store.putInboundEvent(event, bob.pubkeyHex);
  assert.equal(stored, true);

  const row = db.get(id);
  assert.ok(row, "Event should be in Bob's store");

  // 2. Bob parses the stored row
  const parsed = await api.parseStoredDmRows([row], bob);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].text, "Hello Bob!");
  assert.equal(parsed[0].sender, alice.pubkeyHex);
  assert.equal(parsed[0].mine, false);
});
