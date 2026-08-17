import test from "node:test";
import assert from "node:assert/strict";
import * as brainCanon from "../src/lib/crypto.js";

function calculateBrainEntropy({
  passphrase = "",
  pin = "",
  specialDate = "",
  secretPerson = "",
  favoriteCountry = "",
} = {}) {
  let bits = 0;
  let activeCount = 0;

  const p = String(passphrase || "").trim();
  const n = String(pin || "").trim();
  const d = String(specialDate || "").trim();
  const s = String(secretPerson || "").trim();
  const c = String(favoriteCountry || "").trim();

  if (p.length >= 6) {
    activeCount++;
    bits += p.length * 3.8;
    let charTypes = 0;
    if (/[a-z]/.test(p)) charTypes++;
    if (/[A-Z]/.test(p)) charTypes++;
    if (/[0-9]/.test(p)) charTypes++;
    if (/[^a-zA-Z0-9]/.test(p)) charTypes++;
    bits += charTypes * 4;
  }

  if (n.length >= 1) {
    activeCount++;
    bits += n.length * 3.32;
  }

  if (d.length >= 4) {
    activeCount++;
    bits += 15.2;
  }

  if (s.length >= 2) {
    activeCount++;
    bits += s.length * 3.5;
    if (/\s/.test(s)) bits += 6;
  }

  if (c.length >= 2) {
    activeCount++;
    let countryBits = 7.6;
    if (c.length > 6) countryBits += (c.length - 6) * 2.5;
    bits += countryBits;
  }

  return {
    totalBits: Math.round(bits),
    activeCount,
    canDerive: Math.round(bits) >= 80 && activeCount >= 2,
  };
}

test("brain derivation unlocks at 80+ bits with multi-factor separation", () => {
  // A long 32-char passphrase + 6-digit PIN exceeds 80 bits
  const result1 = calculateBrainEntropy({
    passphrase: "cosmic-falcon-crystal-horizon-ember",
    pin: "739281",
  });
  assert.ok(result1.totalBits >= 80);
  assert.equal(result1.canDerive, true);

  // Short inputs below 80 bits do not unlock derivation
  const result2 = calculateBrainEntropy({
    passphrase: "hello",
    pin: "1234",
    favoriteCountry: "Japan",
  });
  assert.ok(result2.totalBits < 80);
  assert.equal(result2.canDerive, false);

  // 3 moderate anchors reaching >= 80 bits unlocks
  const result3 = calculateBrainEntropy({
    passphrase: "radiant-quantum-shield",
    pin: "9876",
    specialDate: "2018-05-24",
    secretPerson: "Alexandre",
  });
  assert.ok(result3.totalBits >= 80);
  assert.equal(result3.canDerive, true);
});

test("single anchor cannot derive alone even if long", () => {
  const result = calculateBrainEntropy({
    passphrase: "extremely-long-passphrase-that-has-over-thirty-two-chars",
  });
  assert.ok(result.totalBits >= 80);
  assert.equal(result.canDerive, false); // needs at least 2 distinct factors
});

test("canonical brain factors sort by hash, then tag as tie-breaker", () => {
  const { compareCanonicalBrainFactors } = brainCanon;

  assert.ok(
    compareCanonicalBrainFactors({ hash: "aa", tag: "s" }, { hash: "bb", tag: "c" }) < 0,
    "lower hash sorts first regardless of tag",
  );
  assert.equal(
    compareCanonicalBrainFactors({ hash: "aa", tag: "c" }, { hash: "aa", tag: "s" }) < 0,
    true,
    "equal hashes fall back to tag A→Z",
  );
  assert.equal(
    compareCanonicalBrainFactors({ hash: "aa", tag: "c" }, { hash: "aa", tag: "c" }),
    0,
  );
});

test("canonicalizeBrainFactors hashes tag:value and is order-independent", () => {
  const { canonicalizeBrainFactors, brainFactorsCompoundPayload, sha256Hex } = brainCanon;

  const a = canonicalizeBrainFactors({
    passphrase: "cosmic-falcon",
    pin: "7392",
    favoriteCountry: "Japan",
  });
  const b = canonicalizeBrainFactors({
    favoriteCountry: "Japan",
    pin: "7392",
    passphrase: "cosmic-falcon",
  });

  assert.equal(a.length, 3);
  assert.deepEqual(
    a.map((item) => item.tag),
    b.map((item) => item.tag),
  );
  assert.deepEqual(
    a.map((item) => item.hash),
    b.map((item) => item.hash),
  );
  assert.equal(brainFactorsCompoundPayload(a), brainFactorsCompoundPayload(b));

  const hashes = a.map((item) => item.hash);
  const sortedHashes = [...hashes].sort((x, y) => x.localeCompare(y));
  assert.deepEqual(hashes, sortedHashes);

  for (const item of a) {
    assert.equal(item.hash, sha256Hex(item.full));
    assert.equal(item.full, `${item.tag}:${item.value}`);
  }
});

test("identical values in different slots stay distinct via tag domain-separation", () => {
  const { canonicalizeBrainFactors } = brainCanon;
  const items = canonicalizeBrainFactors({
    secretPerson: "Japan",
    favoriteCountry: "Japan",
  });
  assert.equal(items.length, 2);
  assert.notEqual(items[0].hash, items[1].hash);
  assert.deepEqual(
    new Set(items.map((item) => item.tag)),
    new Set(["c", "s"]),
  );
});

test("country and memory factors fold case before hashing", () => {
  const { canonicalizeBrainFactors, brainFactorsCompoundPayload } = brainCanon;
  const mixed = canonicalizeBrainFactors({
    favoriteCountry: "Japan",
    secretPerson: "Alex",
    pin: "1234",
  });
  const folded = canonicalizeBrainFactors({
    favoriteCountry: "japan",
    secretPerson: "alex",
    pin: "1234",
  });
  assert.equal(brainFactorsCompoundPayload(mixed), brainFactorsCompoundPayload(folded));
});
