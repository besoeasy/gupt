import test from "node:test";
import assert from "node:assert/strict";

const { isComposingKeydown } = await import("../src/lib/composeInput.js");

test("an IME-confirmed Enter is not a send", () => {
  // Modern browsers flag composition directly.
  assert.equal(isComposingKeydown({ key: "Enter", isComposing: true }), true);
  // Older Android webviews and Safari report keyCode 229 instead.
  assert.equal(isComposingKeydown({ key: "Enter", keyCode: 229 }), true);
  assert.equal(isComposingKeydown({ key: "Enter", isComposing: true, keyCode: 229 }), true);
});

test("a plain Enter still sends", () => {
  assert.equal(isComposingKeydown({ key: "Enter", isComposing: false, keyCode: 13 }), false);
  assert.equal(isComposingKeydown({ key: "Enter" }), false);
  assert.equal(isComposingKeydown({}), false);
  assert.equal(isComposingKeydown(null), false);
});
