import test from "node:test";
import assert from "node:assert/strict";

function countActiveBrainFactors({ passphrase = "", pin = "", specialDate = "", secretPerson = "" } = {}) {
  let count = 0;
  if (String(passphrase || "").trim().length >= 6) count++;
  if (String(pin || "").trim().length >= 1) count++;
  if (String(specialDate || "").trim().length >= 4) count++;
  if (String(secretPerson || "").trim().length >= 2) count++;
  return count;
}

function canDeriveBrainIdentity(factors) {
  return countActiveBrainFactors(factors) >= 3;
}

test("brain derivation requires at least 3 active factors", () => {
  assert.equal(canDeriveBrainIdentity({ passphrase: "correct-horse-battery" }), false);
  assert.equal(canDeriveBrainIdentity({ passphrase: "correct-horse-battery", pin: "1234" }), false);
  assert.equal(
    canDeriveBrainIdentity({
      passphrase: "correct-horse-battery",
      pin: "1234",
      specialDate: "2020-01-01",
    }),
    true,
  );
  assert.equal(
    canDeriveBrainIdentity({
      passphrase: "correct-horse-battery",
      specialDate: "2020-01-01",
      secretPerson: "Alex",
    }),
    true,
  );
  assert.equal(
    canDeriveBrainIdentity({
      pin: "9876",
      specialDate: "2020-01-01",
      secretPerson: "Taylor",
    }),
    true,
  );
  assert.equal(
    canDeriveBrainIdentity({
      passphrase: "correct-horse-battery",
      pin: "9876",
      specialDate: "2020-01-01",
      secretPerson: "Taylor",
    }),
    true,
  );
});

test("brain factor count detects invalid or whitespace-only entries", () => {
  assert.equal(
    countActiveBrainFactors({
      passphrase: "   ",
      pin: "  ",
      specialDate: "",
      secretPerson: " ",
    }),
    0,
  );
  assert.equal(
    countActiveBrainFactors({
      passphrase: "hi", // too short (< 6)
      pin: "1",
      specialDate: "2022",
      secretPerson: "J", // too short (< 2)
    }),
    2,
  );
});
