import test from "node:test";
import assert from "node:assert/strict";

const {
  canVerifyImageDecode,
  decodesAsImage,
  isPlainSizeMismatch,
  isRetryWorthwhile,
  verifyPlainMedia,
} = await import("../src/lib/mediaVerify.js");

const bytes = (length) => new Uint8Array(length).fill(7);

test("byte-count mismatch is only claimed against a known size", () => {
  assert.equal(isPlainSizeMismatch(100, 100), false);
  assert.equal(isPlainSizeMismatch(99, 100), true);
  assert.equal(isPlainSizeMismatch(101, 100), true);
  // Unknown declared size: nothing to compare, never a mismatch.
  assert.equal(isPlainSizeMismatch(100, 0), false);
  assert.equal(isPlainSizeMismatch(100, undefined), false);
});

test("only raster images with a real decoder are worth decoding", () => {
  assert.equal(canVerifyImageDecode("image/jpeg", true), true);
  assert.equal(canVerifyImageDecode("image/png", true), true);
  assert.equal(canVerifyImageDecode("IMAGE/WEBP", true), true);
  assert.equal(canVerifyImageDecode("image/gif", true), true);
  // No decoder in this environment, or a format the decoder does not cover.
  assert.equal(canVerifyImageDecode("image/jpeg", false), false);
  assert.equal(canVerifyImageDecode("image/svg+xml", true), false);
  assert.equal(canVerifyImageDecode("application/pdf", true), false);
  assert.equal(canVerifyImageDecode("", true), false);
});

test("a decoded picture is thrown away after it proves itself", async () => {
  let closed = false;
  const bitmap = { close: () => (closed = true) };
  assert.equal(await decodesAsImage(new Blob([bytes(4)]), async () => bitmap), true);
  assert.equal(closed, true);

  const failing = async () => {
    throw new Error("bad image");
  };
  assert.equal(await decodesAsImage(new Blob([bytes(4)]), failing), false);

  // Without a decoder there is nothing to prove, so the bytes pass.
  assert.equal(await decodesAsImage(new Blob([bytes(4)]), null), true);
});

test("an empty plaintext never counts as a good download", async () => {
  const verdict = await verifyPlainMedia({ plain: new Uint8Array(0), size: 0, mime: "image/jpeg" });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "empty_file");
});

test("a length that disagrees with the sender is rejected before caching", async () => {
  const verdict = await verifyPlainMedia({
    plain: bytes(40),
    size: 100,
    mime: "application/octet-stream",
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "size_mismatch");
  assert.match(verdict.message, /40 bytes/);
  assert.match(verdict.message, /100/);
});

test("an image that will not decode is rejected before caching", async () => {
  const decodeImage = async () => {
    throw new Error("decode failed");
  };
  const verdict = await verifyPlainMedia({
    plain: bytes(32),
    size: 32,
    mime: "image/jpeg",
    decodeImage,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "undecodable_image");
});

test("a matching file passes, with or without an image check", async () => {
  assert.deepEqual(
    await verifyPlainMedia({ plain: bytes(32), size: 32, mime: "application/pdf" }),
    { ok: true, code: null, message: "" },
  );
  assert.equal(
    (
      await verifyPlainMedia({
        plain: bytes(32),
        size: 32,
        mime: "image/png",
        decodeImage: async () => ({ close() {} }),
      })
    ).ok,
    true,
  );
});

test("only failures a retry can fix are retried in the background", () => {
  // Corrupt bytes stay corrupt, so these wait for the manual Retry.
  assert.equal(isRetryWorthwhile("size_mismatch"), false);
  assert.equal(isRetryWorthwhile("undecodable_image"), false);
  assert.equal(isRetryWorthwhile("empty_file"), false);
  // Missing chunks, timeouts and relay errors can succeed next time.
  assert.equal(isRetryWorthwhile("incomplete_upload"), true);
  assert.equal(isRetryWorthwhile("not_found"), true);
  assert.equal(isRetryWorthwhile(undefined), true);
});
