import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBitcoinAddress, parseBitcoinAddress } from "../src/bitcoin.js";

const P2PKH = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const P2SH = "3J98t1WpEZ73CNmYviecrnyiWrnqSXfsbY";
const P2WPKH = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const P2TR = "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0";

test("accepts mainnet Bitcoin addresses and bitcoin: URIs", () => {
  assert.equal(normalizeBitcoinAddress(""), "");
  assert.equal(normalizeBitcoinAddress(P2PKH), P2PKH);
  assert.equal(normalizeBitcoinAddress(P2SH), P2SH);
  assert.equal(normalizeBitcoinAddress(P2WPKH), P2WPKH);
  assert.equal(normalizeBitcoinAddress(P2WPKH.toUpperCase()), P2WPKH);
  assert.equal(normalizeBitcoinAddress(P2TR), P2TR);
  assert.equal(normalizeBitcoinAddress(`bitcoin:${P2WPKH}`), P2WPKH);
  assert.equal(normalizeBitcoinAddress(`BITCOIN:${P2WPKH}?amount=0.01`), P2WPKH);
});

test("rejects non-mainnet and invalid Bitcoin addresses", () => {
  assert.throws(
    () => normalizeBitcoinAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"),
    /bitcoin/,
  );
  assert.throws(() => normalizeBitcoinAddress("lnbc1u1p..."), /bitcoin/);
  assert.throws(() => normalizeBitcoinAddress("not-an-address"), /bitcoin/);
  assert.throws(() => normalizeBitcoinAddress(`${P2WPKH.slice(0, -1)}x`), /bitcoin/);
  assert.equal(parseBitcoinAddress("javascript:alert(1)"), "");
  assert.equal(parseBitcoinAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5"), "");
});
