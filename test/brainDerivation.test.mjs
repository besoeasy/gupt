import test from "node:test";
import assert from "node:assert/strict";

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
