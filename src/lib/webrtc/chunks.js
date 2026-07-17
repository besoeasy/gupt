/**
 * WebRTC module — transfer chunk codec.
 *
 * Binary framing for peer-to-peer blob transfer plus SHA-256 integrity
 * helpers. Pure JavaScript (Blob / crypto.subtle / DataView only), so this
 * file also runs under Node for tests.
 *
 * Wire format per chunk (little-endian):
 *   bytes 0-3   sequence number (uint32)
 *   bytes 4-7   total chunk count (uint32)
 *   bytes 8-71  sha256 of the full blob, hex, space-padded
 *   bytes 72..  payload
 */

import { CHUNK_HEADER_BYTES } from "./constants.js";

export async function computeSha256(blob) {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function encodeChunk(seq, total, sha256, chunkBuf) {
  const enc = new TextEncoder();
  const sha256Bytes = enc.encode(String(sha256 || "").padEnd(64, " "));
  const header = new ArrayBuffer(CHUNK_HEADER_BYTES);
  const view = new DataView(header);
  view.setUint32(0, seq, true);
  view.setUint32(4, total, true);
  const headerBytes = new Uint8Array(header);
  headerBytes.set(sha256Bytes.subarray(0, 64), 8);

  const result = new Uint8Array(CHUNK_HEADER_BYTES + chunkBuf.byteLength);
  result.set(headerBytes, 0);
  result.set(new Uint8Array(chunkBuf), CHUNK_HEADER_BYTES);
  return result;
}

export function decodeChunk(buffer) {
  if (buffer.byteLength < CHUNK_HEADER_BYTES) throw new Error("Chunk too small");
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const seq = view.getUint32(0, true);
  const total = view.getUint32(4, true);
  const sha256Bytes = new Uint8Array(buffer.buffer, buffer.byteOffset + 8, 64);
  const sha256 = new TextDecoder().decode(sha256Bytes).trim();
  const data = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset + CHUNK_HEADER_BYTES,
    buffer.byteLength - CHUNK_HEADER_BYTES,
  );
  return { seq, total, sha256, data };
}

/**
 * Verify a fully-assembled blob against the expected SHA-256 hex digest.
 * Returns true when no digest was provided (nothing to verify against).
 */
export async function verifyBlobSha256(blob, expectedSha256) {
  const expected = String(expectedSha256 || "")
    .trim()
    .toLowerCase();
  if (!expected) return true;
  const actual = await computeSha256(blob).catch(() => null);
  return actual === expected;
}
