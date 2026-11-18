import test from "node:test";
import assert from "node:assert/strict";

const { decCachedKey, usableDecCachedRow } = await import("../src/lib/mediaDecCache.js");

test("decrypted media cache keys are namespaced per message", () => {
  assert.equal(decCachedKey("abc"), "dec:abc");
  assert.equal(decCachedKey(""), "dec:");
  assert.equal(decCachedKey(null), "dec:");
});

test("a cached row is usable only while it holds bytes", () => {
  // The bug this guards: a zero-length buffer still produced a blob URL, so
  // the picture rendered broken instead of the retry card.
  assert.equal(usableDecCachedRow({ buf: new Uint8Array(0), mime: "image/jpeg" }), null);
  assert.equal(usableDecCachedRow({ buf: new Uint8Array(), mime: "" }), null);
  assert.equal(usableDecCachedRow({ buf: null }), null);
  assert.equal(usableDecCachedRow({}), null);
  assert.equal(usableDecCachedRow(null), null);

  const bytes = new Uint8Array([1, 2, 3]);
  assert.deepEqual(usableDecCachedRow({ buf: bytes, mime: "image/jpeg" }), {
    buf: bytes,
    mime: "image/jpeg",
    previewable: true,
  });
});

test("a row cached before the preview flag existed stays previewable", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  // Old rows have no field at all; only an explicit false suppresses a preview.
  assert.equal(usableDecCachedRow({ buf: bytes, mime: "image/jpeg" }).previewable, true);
  assert.equal(
    usableDecCachedRow({ buf: bytes, mime: "image/jpeg", previewable: undefined }).previewable,
    true,
  );
  assert.equal(
    usableDecCachedRow({ buf: bytes, mime: "image/jpeg", previewable: false }).previewable,
    false,
  );
});

test("an ArrayBuffer row is normalized to bytes", () => {
  const raw = new Uint8Array([4, 5, 6]).buffer;
  const usable = usableDecCachedRow({ buf: raw, mime: "video/mp4" });
  assert.equal(usable.buf instanceof Uint8Array, true);
  assert.equal(usable.buf.byteLength, 3);
  assert.equal(usable.mime, "video/mp4");
});

test("a missing mime is left for the caller to fill in", () => {
  const usable = usableDecCachedRow({ buf: new Uint8Array([7]) });
  assert.equal(usable.mime, "");
});
