import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRelayUrl, RelayBook } from "../src/relayBook.js";

const PEER_A = "a".repeat(64);
const PEER_B = "b".repeat(64);
const BOOTSTRAP = ["wss://bootstrap-a.example", "wss://bootstrap-b.example"];

test("learns signed relay hints and prioritizes ingress for replies", () => {
  const book = new RelayBook(BOOTSTRAP);
  const discovered = book.learn(PEER_A, {
    sourceRelay: BOOTSTRAP[0],
    hintedRelay: "wss://peer.example",
  });

  assert.deepEqual(discovered, ["wss://peer.example"]);
  assert.deepEqual(book.replyRelays(PEER_A, BOOTSTRAP[0]), [
    BOOTSTRAP[0],
    "wss://peer.example",
    BOOTSTRAP[1],
  ]);
});

test("caps globally learned relays using most-recently-seen eviction", () => {
  let now = 1;
  const book = new RelayBook(BOOTSTRAP, {
    maxLearnedRelays: 2,
    clock: () => now,
  });

  book.learn(PEER_A, { hintedRelay: "wss://one.example" }, now++);
  book.learn(PEER_A, { hintedRelay: "wss://two.example" }, now++);
  book.learn(PEER_B, { hintedRelay: "wss://three.example" }, now++);

  assert.deepEqual(book.learnedRelays(), ["wss://two.example", "wss://three.example"]);
  assert.equal(book.replyRelays(PEER_A).includes("wss://one.example"), false);
});

test("rejects insecure and obvious private learned relay URLs", () => {
  assert.equal(normalizeRelayUrl("ws://relay.example"), null);
  assert.equal(normalizeRelayUrl("wss://localhost"), null);
  assert.equal(normalizeRelayUrl("wss://127.0.0.1"), null);
  assert.equal(normalizeRelayUrl("wss://10.0.0.1"), null);
  assert.equal(normalizeRelayUrl("wss://relay.example///"), "wss://relay.example");
});
