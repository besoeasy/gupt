/**
 * Unit tests for the pure parts of the WebRTC module (chunk codec,
 * integrity helpers, formatting, signal guards).
 *
 * Runs with the built-in Node test runner — no browser or deps required:
 *   node --test test/
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  CHUNK_HEADER_BYTES,
  CALL_SIGNAL_TYPES,
  CALL_EVENT_OUTCOMES,
  isCallSignalType,
} from "../src/lib/webrtc/constants.js";
import {
  computeSha256,
  encodeChunk,
  decodeChunk,
  verifyBlobSha256,
} from "../src/lib/webrtc/chunks.js";
import {
  DEFAULT_MEDIA,
  normalizeMedia,
  formatCallEventText,
  inferCallOutcome,
  formatMediaError,
  serializeIceCandidate,
  summarizeCandidate,
  candidateTypeOf,
  describeIceServers,
} from "../src/lib/webrtc/utils.js";

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

test("isCallSignalType accepts every registered call signal", () => {
  for (const type of CALL_SIGNAL_TYPES) {
    assert.ok(isCallSignalType(type), `expected ${type} to be a call signal`);
  }
});

test("isCallSignalType rejects transfer and unknown types", () => {
  assert.equal(isCallSignalType("webrtc-offer"), false);
  assert.equal(isCallSignalType("call-event"), false);
  assert.equal(isCallSignalType(""), false);
  assert.equal(isCallSignalType(undefined), false);
});

test("call event outcomes cover the documented set", () => {
  assert.deepEqual([...CALL_EVENT_OUTCOMES].sort(), [
    "busy",
    "cancelled",
    "declined",
    "ended",
    "failed",
    "missed",
    "no-answer",
  ]);
});

// ---------------------------------------------------------------------------
// chunk codec
// ---------------------------------------------------------------------------

test("encodeChunk/decodeChunk round-trips seq, total, sha256 and payload", async () => {
  const payload = new TextEncoder().encode("hello gupt");
  const sha256 = "a".repeat(64);
  const encoded = await encodeChunk(3, 7, sha256, payload.buffer);

  assert.equal(encoded.byteLength, CHUNK_HEADER_BYTES + payload.byteLength);

  const decoded = decodeChunk(encoded);
  assert.equal(decoded.seq, 3);
  assert.equal(decoded.total, 7);
  assert.equal(decoded.sha256, sha256);
  assert.deepEqual([...decoded.data], [...payload]);
});

test("decodeChunk rejects undersized buffers", () => {
  assert.throws(() => decodeChunk(new Uint8Array(10)), /too small/i);
});

test("multi-chunk blob reassembles and verifies against its sha256", async () => {
  const data = crypto.getRandomValues(new Uint8Array(50_000));
  const blob = new Blob([data]);
  const sha256 = await computeSha256(blob);

  const chunkSize = 16_000;
  const total = Math.ceil(data.byteLength / chunkSize);
  const parts = [];
  for (let seq = 0; seq < total; seq++) {
    // Copy the subarray — .buffer of a subarray view spans the whole backing store.
    const slice = data.slice(seq * chunkSize, (seq + 1) * chunkSize);
    parts.push(await encodeChunk(seq, total, sha256, slice.buffer));
  }

  const decoded = parts.map((part) => decodeChunk(part));
  assert.ok(decoded.every((chunk, index) => chunk.seq === index && chunk.total === total));

  const reassembled = new Blob(decoded.map((chunk) => chunk.data));
  assert.equal(reassembled.size, blob.size);
  assert.ok(await verifyBlobSha256(reassembled, sha256));
});

test("verifyBlobSha256 rejects corrupted payloads", async () => {
  const blob = new Blob(["original content"]);
  const sha256 = await computeSha256(blob);
  const tampered = new Blob(["tampered content"]);
  assert.equal(await verifyBlobSha256(tampered, sha256), false);
});

test("verifyBlobSha256 passes when no digest is expected", async () => {
  assert.equal(await verifyBlobSha256(new Blob(["anything"]), ""), true);
  assert.equal(await verifyBlobSha256(new Blob(["anything"]), null), true);
});

test("computeSha256 matches the well-known vector for 'abc'", async () => {
  const digest = await computeSha256(new Blob(["abc"]));
  assert.equal(digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

// ---------------------------------------------------------------------------
// media normalization & error text
// ---------------------------------------------------------------------------

test("normalizeMedia defaults to audio-only", () => {
  assert.deepEqual(normalizeMedia(undefined), { audio: true, video: false });
  assert.deepEqual(normalizeMedia({}), { audio: true, video: false });
  assert.deepEqual(normalizeMedia({ audio: false, video: true }), { audio: false, video: true });
  assert.deepEqual(normalizeMedia(DEFAULT_MEDIA), { audio: true, video: false });
});

test("formatMediaError maps getUserMedia error names to friendly text", () => {
  const denied = new Error("denied");
  denied.name = "NotAllowedError";
  assert.match(formatMediaError(denied), /denied/i);

  const missing = new Error("no device");
  missing.name = "NotFoundError";
  assert.match(formatMediaError(missing), /No microphone or camera/);

  assert.equal(formatMediaError(""), "Unable to access microphone or camera.");
  assert.equal(formatMediaError("plain string"), "plain string");
});

// ---------------------------------------------------------------------------
// call outcome inference & event text
// ---------------------------------------------------------------------------

test("inferCallOutcome honors an explicit outcome", () => {
  assert.equal(inferCallOutcome("anything", { outcome: "missed" }), "missed");
});

test("inferCallOutcome maps reasons to outcomes", () => {
  assert.equal(inferCallOutcome("No answer."), "no-answer");
  assert.equal(inferCallOutcome("", { hangupReason: "no-answer" }), "no-answer");
  assert.equal(inferCallOutcome("Call declined."), "declined");
  assert.equal(inferCallOutcome("Peer is busy."), "busy");
  assert.equal(inferCallOutcome("Call cancelled."), "cancelled");
  assert.equal(inferCallOutcome("Connection lost."), "failed");
  assert.equal(inferCallOutcome("Call ended."), "ended");
  assert.equal(inferCallOutcome("You missed a call"), "missed");
  assert.equal(inferCallOutcome("something unrecognized"), "ended");
});

test("formatCallEventText renders every outcome", () => {
  assert.equal(formatCallEventText("ended", { audio: true, video: false }, 0), "Voice call ended");
  assert.equal(
    formatCallEventText("ended", { audio: true, video: false }, 65),
    "Voice call · 1m 5s",
  );
  assert.equal(formatCallEventText("ended", { audio: true, video: false }, 9), "Voice call · 9s");
  assert.equal(formatCallEventText("no-answer", { video: true }), "Video call · No answer");
  assert.equal(formatCallEventText("declined", { video: true }), "Video call · Declined");
  assert.equal(formatCallEventText("cancelled", {}), "Voice call · Cancelled");
  assert.equal(formatCallEventText("busy", {}), "Voice call · Busy");
  assert.equal(formatCallEventText("missed", {}), "Voice call · Missed");
  assert.equal(formatCallEventText("failed", {}), "Voice call · Connection failed");
  assert.equal(formatCallEventText("unknown-outcome", {}), "Voice call");
});

// ---------------------------------------------------------------------------
// ICE candidate helpers
// ---------------------------------------------------------------------------

test("serializeIceCandidate prefers toJSON and falls back to field picking", () => {
  const viaToJSON = { toJSON: () => ({ candidate: "c1" }) };
  assert.deepEqual(serializeIceCandidate(viaToJSON), { candidate: "c1" });

  const plain = {
    candidate: "c2",
    sdpMid: "0",
    sdpMLineIndex: 0,
    usernameFragment: "ufrag",
    extra: "dropped",
  };
  assert.deepEqual(serializeIceCandidate(plain), {
    candidate: "c2",
    sdpMid: "0",
    sdpMLineIndex: 0,
    usernameFragment: "ufrag",
  });

  assert.equal(serializeIceCandidate(null), null);
});

test("summarizeCandidate parses type, protocol and address", () => {
  const host = {
    candidate:
      "candidate:842163049 1 udp 1677729535 192.168.1.2 51234 typ srflx raddr 0.0.0.0 rport 0 generation 0",
  };
  assert.equal(summarizeCandidate(host), "srflx/udp 192.168.1.2:51234");
  assert.equal(candidateTypeOf(host), "srflx");
  assert.equal(summarizeCandidate({ candidate: "" }), "unknown");
  assert.equal(summarizeCandidate(null), "unknown");
  assert.equal(candidateTypeOf({}), "unknown");
});

test("describeIceServers flattens url and urls forms", () => {
  const servers = [
    { urls: ["stun:a.example:3478", "stun:b.example:3478"] },
    { urls: "turn:c.example:3478" },
    {},
  ];
  assert.deepEqual(describeIceServers(servers), [
    "stun:a.example:3478",
    "stun:b.example:3478",
    "turn:c.example:3478",
  ]);
});
