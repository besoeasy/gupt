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

test("canonical brain anchors hash values with SHA-512, dedupe, and sort", () => {
  const { canonicalizeBrainFactors, brainFactorsMasterHash, sha512Hex } = brainCanon;

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
    a.map((item) => item.hash),
    b.map((item) => item.hash),
  );
  assert.equal(brainFactorsMasterHash(a), brainFactorsMasterHash(b));

  const hashes = a.map((item) => item.hash);
  const sortedHashes = [...hashes].sort((x, y) => x.localeCompare(y));
  assert.deepEqual(hashes, sortedHashes);

  for (const item of a) {
    assert.equal(item.hash, sha512Hex(item.value));
  }
  assert.equal(brainFactorsMasterHash(a), sha512Hex(hashes.join("\0")));
});

test("identical values in different slots collapse to one anchor", () => {
  const { canonicalizeBrainFactors } = brainCanon;
  const items = canonicalizeBrainFactors({
    secretPerson: "Japan",
    favoriteCountry: "Japan",
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].value, "japan");
});

test("slot assignment does not change the master hash", () => {
  const { canonicalizeBrainFactors, brainFactorsMasterHash } = brainCanon;
  const asCountry = canonicalizeBrainFactors({
    passphrase: "cosmic-falcon-crystal",
    favoriteCountry: "Iceland",
  });
  const asMemory = canonicalizeBrainFactors({
    passphrase: "cosmic-falcon-crystal",
    secretPerson: "iceland",
  });
  assert.equal(brainFactorsMasterHash(asCountry), brainFactorsMasterHash(asMemory));
});

test("non-password factors lowercase and strip spaces before hashing", () => {
  const { canonicalizeBrainFactors, brainFactorsMasterHash } = brainCanon;
  const mixed = canonicalizeBrainFactors({
    favoriteCountry: "New Zealand",
    secretPerson: "Alex Smith",
    pin: "73 92",
    specialDate: "2018-05-24",
    passphrase: "Cosmic Falcon",
  });
  const compact = canonicalizeBrainFactors({
    favoriteCountry: "newzealand",
    secretPerson: "alexsmith",
    pin: "7392",
    specialDate: "2018-05-24",
    passphrase: "Cosmic Falcon",
  });
  assert.equal(brainFactorsMasterHash(mixed), brainFactorsMasterHash(compact));
  assert.equal(mixed.length, 5);

  const values = new Set(mixed.map((item) => item.value));
  assert.ok(values.has("newzealand"));
  assert.ok(values.has("alexsmith"));
  assert.ok(values.has("7392"));
  assert.ok(values.has("Cosmic Falcon"));

  const spacedPassword = canonicalizeBrainFactors({
    passphrase: "Cosmic Falcon",
    pin: "1234",
  });
  const squeezedPassword = canonicalizeBrainFactors({
    passphrase: "cosmicfalcon",
    pin: "1234",
  });
  assert.notEqual(brainFactorsMasterHash(spacedPassword), brainFactorsMasterHash(squeezedPassword));
});

test("first pet and first car are extra compact anchors", () => {
  const { canonicalizeBrainFactors, brainFactorsMasterHash } = brainCanon;
  const items = canonicalizeBrainFactors({
    pin: "7392",
    firstPet: "Orange Cat",
    firstCar: "Honda Civic",
  });
  assert.equal(items.length, 3);
  const values = new Set(items.map((item) => item.value));
  assert.ok(values.has("orangecat"));
  assert.ok(values.has("hondacivic"));
  assert.equal(
    brainFactorsMasterHash(items),
    brainFactorsMasterHash(
      canonicalizeBrainFactors({
        pin: "7392",
        firstPet: "orange cat",
        firstCar: "HondaCivic",
      }),
    ),
  );
});
