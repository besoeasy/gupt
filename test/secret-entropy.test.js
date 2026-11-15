import test from "node:test";
import assert from "node:assert/strict";
import { isWeakSecret, secretEntropyBits, SECRET_WEAK_BITS } from "../src/lib/crypto.js";

test("secretEntropyBits returns 0 for empty or whitespace-only input", () => {
  assert.equal(secretEntropyBits(""), 0);
  assert.equal(secretEntropyBits("   "), 0);
  assert.equal(secretEntropyBits(null), 0);
  assert.equal(secretEntropyBits(undefined), 0);
  assert.equal(isWeakSecret(""), false);
  assert.equal(isWeakSecret("   "), false);
  assert.equal(isWeakSecret(null), false);
});

test("isWeakSecret detects short or low-entropy secrets", () => {
  // Short secrets
  assert.equal(isWeakSecret("cat"), true);
  assert.equal(isWeakSecret("12345"), true);
  assert.equal(isWeakSecret("qwerty"), true);
  assert.equal(isWeakSecret("password"), true);
  assert.equal(isWeakSecret("secret"), true);
  assert.ok(secretEntropyBits("cat") < SECRET_WEAK_BITS);
  assert.ok(secretEntropyBits("12345") < SECRET_WEAK_BITS);
});

test("isWeakSecret detects repeated character patterns", () => {
  assert.equal(isWeakSecret("aaaaaaaaaaaaaaaa"), true);
  assert.equal(isWeakSecret("1111111111111111"), true);
  assert.ok(secretEntropyBits("aaaaaaaaaaaaaaaa") < SECRET_WEAK_BITS);
});

test("isWeakSecret passes strong passphrases and sentences", () => {
  assert.equal(isWeakSecret("correct horse battery staple"), false);
  assert.equal(isWeakSecret("olive4Seven-secure-pass"), false);
  assert.equal(isWeakSecret("my ultra safe passphrase for gupt"), false);
  assert.ok(secretEntropyBits("correct horse battery staple") >= 60);
});
