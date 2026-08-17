import test from "node:test";
import assert from "node:assert/strict";
import { classifyPastedIdentitySecret, normalizePastedPrivkeyHex } from "../src/lib/crypto.js";

const HEX = "a".repeat(64);

test("normalizePastedPrivkeyHex accepts spaced and mixed-case hex", () => {
  assert.equal(normalizePastedPrivkeyHex(` ${HEX.slice(0, 32)}\n${HEX.slice(32).toUpperCase()} `), HEX);
  assert.equal(normalizePastedPrivkeyHex("not-a-key"), null);
  assert.equal(normalizePastedPrivkeyHex("a".repeat(63)), null);
});

test("classifyPastedIdentitySecret restores hex and backup JSON as-is", () => {
  assert.equal(classifyPastedIdentitySecret("").kind, "empty");
  assert.deepEqual(classifyPastedIdentitySecret(HEX), { kind: "hex", value: HEX });
  assert.deepEqual(
    classifyPastedIdentitySecret(JSON.stringify({ privkeyHex: HEX, app: "gupt" })),
    { kind: "hex", value: HEX },
  );
  assert.equal(classifyPastedIdentitySecret(JSON.stringify({ app: "gupt" })).kind, "invalid-backup");
});

test("classifyPastedIdentitySecret treats arbitrary text as a one-shot secret", () => {
  assert.deepEqual(classifyPastedIdentitySecret("my long poem\nwith lines"), {
    kind: "secret",
    value: "my long poem\nwith lines",
  });
  assert.equal(classifyPastedIdentitySecret("[1,2,3]").kind, "secret");
});
