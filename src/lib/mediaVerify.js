/**
 * Proof that a decrypted attachment really is the file that was sent, before
 * it is cached or shown.
 *
 * Two different failures are worth catching here:
 * - a wrong byte count means chunks went missing, were stitched twice, or the
 *   container was cut short, and the file is silently damaged;
 * - an image that will not decode means the bytes are not the picture they
 *   claim to be, even when the length happens to match.
 *
 * Catching either one at download time keeps a corrupt file out of the
 * decrypted-media cache, where every later render would trust it.
 */

/** Raster formats a browser can prove by decoding them. */
const DECODABLE_IMAGE_RE = /^image\/(jpeg|png|gif|webp|avif|bmp)$/i;

export function isPlainSizeMismatch(actualBytes, expectedBytes) {
  const expected = Number(expectedBytes) || 0;
  // No declared size means nothing to compare against, not a failure.
  if (expected <= 0) return false;
  return Number(actualBytes) !== expected;
}

export function canVerifyImageDecode(mime, hasDecoder) {
  if (!hasDecoder) return false;
  return DECODABLE_IMAGE_RE.test(String(mime || "").trim());
}

/** Decode the picture and throw it away: the proof is that it decoded at all. */
export async function decodesAsImage(blob, decode = globalThis.createImageBitmap) {
  if (typeof decode !== "function") return true;
  let bitmap = null;
  try {
    bitmap = await decode(blob);
    return Boolean(bitmap);
  } catch {
    return false;
  } finally {
    if (bitmap && typeof bitmap.close === "function") bitmap.close();
  }
}

/** Verdict codes for bytes that are wrong themselves, not merely missing. */
const UNREPAIRABLE_CODES = new Set(["empty_file", "size_mismatch", "undecodable_image"]);

/** A retry re-fetches the same chunks; it cannot fix a file that is corrupt. */
export function isRetryWorthwhile(code) {
  return !UNREPAIRABLE_CODES.has(String(code || ""));
}

/**
 * Verdict for a stitched plaintext. `ok: false` carries a code and a message
 * meant for the attachment card.
 */
export async function verifyPlainMedia({
  plain,
  size = 0,
  mime = "",
  decodeImage = globalThis.createImageBitmap,
} = {}) {
  const bytes = Number(plain?.byteLength) || 0;

  if (bytes === 0) {
    return {
      ok: false,
      code: "empty_file",
      message: "The decrypted attachment is empty.",
    };
  }

  if (isPlainSizeMismatch(bytes, size)) {
    return {
      ok: false,
      code: "size_mismatch",
      message: `The decrypted attachment is ${bytes} bytes but ${Number(size)} were sent.`,
    };
  }

  if (canVerifyImageDecode(mime, typeof decodeImage === "function")) {
    const blob = plain instanceof Blob ? plain : new Blob([plain], { type: String(mime || "") });
    if (!(await decodesAsImage(blob, decodeImage))) {
      return {
        ok: false,
        code: "undecodable_image",
        message: "The decrypted attachment is not a readable image.",
      };
    }
  }

  return { ok: true, code: null, message: "" };
}
