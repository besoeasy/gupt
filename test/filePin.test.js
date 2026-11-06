import assert from "node:assert/strict";
import test from "node:test";

import {
  derivePrivkeyFromFileAndPin,
  derivePrivkeyFromSecret,
  FILE_PIN_MAX_DIGITS,
  FILE_PIN_MIN_DIGITS,
  filePinEntropyBits,
  isValidFilePin,
  normalizeFilePin,
} from "../src/lib/crypto.js";

/**
 * File + PIN carries the identity, so its derivation is a compatibility
 * contract: the same file digest and the same PIN must produce the same
 * account on every device, forever. Changing the tag, the salt, the argument
 * order or the normalization rules would silently orphan every account made
 * with it. These tests pin all four.
 */
const FILE_A = "a".repeat(64);
const FILE_B = "b".repeat(64);

const keyA = derivePrivkeyFromFileAndPin(FILE_A, "73921408");

test("the PIN accepts digits only and keeps leading zeros", () => {
  assert.equal(normalizeFilePin("12 34-56"), "123456");
  assert.equal(normalizeFilePin("12.34"), "1234");
  assert.equal(normalizeFilePin("0042"), "0042");
  assert.equal(normalizeFilePin("abc"), "");
  assert.equal(normalizeFilePin(null), "");
  assert.equal(normalizeFilePin(undefined), "");
});

test("only 4 to 8 digits are a valid PIN", () => {
  assert.equal(FILE_PIN_MIN_DIGITS, 4);
  assert.equal(FILE_PIN_MAX_DIGITS, 8);
  assert.equal(isValidFilePin("123"), false);
  assert.equal(isValidFilePin("1234"), true);
  assert.equal(isValidFilePin("123456"), true);
  assert.equal(isValidFilePin("12345678"), true);
  assert.equal(isValidFilePin("123456789"), false);
  assert.equal(isValidFilePin("12-34"), true);
});

test("PIN entropy follows the digit count", () => {
  assert.equal(filePinEntropyBits(""), 0);
  assert.equal(filePinEntropyBits("1234"), 13);
  assert.equal(filePinEntropyBits("12345678"), 27);
});

test("the derivation is deterministic and pinned to the v1 KDF", () => {
  assert.match(keyA, /^[0-9a-f]{64}$/);
  assert.equal(derivePrivkeyFromFileAndPin(FILE_A, "73921408"), keyA);
  // Separators are cosmetic, so a formatted paste lands on the same key.
  assert.equal(derivePrivkeyFromFileAndPin(FILE_A, "7392 1408"), keyA);
  // The pinned digest covers the tag, salt, parameter order and Argon2id
  // settings. A failure here is not a test to update lightly: it means every
  // File + PIN account already made would stop signing in.
  assert.equal(keyA, "39f15ecf4fba323955b9cbe2b2fc2f9002e2c11b23674ab832596147f66bf786");
});

test("a different PIN or a different file produces a different key", () => {
  assert.notEqual(derivePrivkeyFromFileAndPin(FILE_A, "73921407"), keyA);
  assert.notEqual(derivePrivkeyFromFileAndPin(FILE_B, "73921408"), keyA);
});

test("file + PIN never collides with the plain secret or file-only methods", () => {
  // The tagged material is deliberately not a shape derivePrivkeyFromSecret
  // would land on for the obvious concatenations.
  assert.notEqual(derivePrivkeyFromSecret(FILE_A), keyA);
  assert.notEqual(derivePrivkeyFromSecret(`${FILE_A}:73921408`), keyA);
  assert.notEqual(derivePrivkeyFromSecret(`gupt-file-pin-v1-${FILE_A}-73921408`), keyA);
});

test("a malformed file digest or an out-of-range PIN is rejected, not truncated", () => {
  assert.throws(() => derivePrivkeyFromFileAndPin("", "1234"), /Choose a file first/);
  assert.throws(
    () => derivePrivkeyFromFileAndPin("/home/me/photo.jpg", "1234"),
    /Choose a file first/,
  );
  assert.throws(() => derivePrivkeyFromFileAndPin(FILE_A, "123"), /4 to 8 digits/);
  assert.throws(() => derivePrivkeyFromFileAndPin(FILE_A, "123456789"), /at most 8 digits/);
  assert.throws(() => derivePrivkeyFromFileAndPin(FILE_A, "abcd"), /4 to 8 digits/);
});
