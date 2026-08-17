/**
 * Unit tests for the pure parts of the WebRTC module (formatting,
 * signal guards).
 *
 * Runs with the built-in Node test runner — no browser or deps required:
 *   node --test test/
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  CALL_SIGNAL_TYPES,
  CALL_EVENT_OUTCOMES,
  isCallSignalType,
} from "../src/lib/webrtc/constants.js";
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
import { SAS_EMOJIS, extractSdpFingerprint, computeCallSas } from "../src/lib/webrtc/sas.js";

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

test("isCallSignalType accepts every registered call signal", () => {
  for (const type of CALL_SIGNAL_TYPES) {
    assert.ok(isCallSignalType(type), `expected ${type} to be a call signal`);
  }
});

test("isCallSignalType rejects unknown types", () => {
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

// ---------------------------------------------------------------------------
// SAS (Short Authentication String) call verification
// ---------------------------------------------------------------------------

test("extractSdpFingerprint parses and normalizes SHA-256 fingerprint", () => {
  const sdp = `v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=fingerprint:sha-256 3B:7D:9A:8C:2E:1F:0D:4B:5A:6C:7E:8F:90:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56\r\n`;
  assert.equal(
    extractSdpFingerprint(sdp),
    "sha-256:3b:7d:9a:8c:2e:1f:0d:4b:5a:6c:7e:8f:90:12:34:56:78:9a:bc:de:f0:12:34:56:78:9a:bc:de:f0:12:34:56",
  );
});

test("extractSdpFingerprint returns empty string for missing or malformed SDP", () => {
  assert.equal(extractSdpFingerprint(""), "");
  assert.equal(extractSdpFingerprint(null), "");
  assert.equal(extractSdpFingerprint("v=0\r\ns=-\r\n"), "");
});

test("computeCallSas produces 4 valid emojis and 4-digit code", () => {
  const sdpA = `a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00\r\n`;
  const sdpB = `a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99\r\n`;
  const callId = "test-call-123";

  const sas = computeCallSas(sdpA, sdpB, callId);
  assert.ok(sas);
  assert.equal(sas.emojis.length, 4);
  for (const emoji of sas.emojis) {
    assert.ok(SAS_EMOJIS.includes(emoji), `expected ${emoji} to be in SAS_EMOJIS`);
  }
  assert.match(sas.code, /^\d{4}$/);
});

test("computeCallSas is symmetric (caller and callee get identical SAS regardless of order)", () => {
  const sdpCaller = `a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00\r\n`;
  const sdpCallee = `a=fingerprint:sha-256 99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA:99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA\r\n`;
  const callId = "symmetric-call-id";

  const sasCaller = computeCallSas(sdpCaller, sdpCallee, callId);
  const sasCallee = computeCallSas(sdpCallee, sdpCaller, callId);

  assert.deepEqual(sasCaller.emojis, sasCallee.emojis);
  assert.equal(sasCaller.code, sasCallee.code);
  assert.equal(sasCaller.rawHashHex, sasCallee.rawHashHex);
});

test("computeCallSas changes if fingerprint or callId is tampered", () => {
  const sdpA = `a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00\r\n`;
  const sdpB = `a=fingerprint:sha-256 99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA:99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA\r\n`;
  const sdpBTampered = `a=fingerprint:sha-256 99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA:99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:00\r\n`;

  const sasOriginal = computeCallSas(sdpA, sdpB, "call-1");
  const sasTampered = computeCallSas(sdpA, sdpBTampered, "call-1");
  const sasDiffCallId = computeCallSas(sdpA, sdpB, "call-2");

  assert.notDeepEqual(sasOriginal.emojis, sasTampered.emojis);
  assert.notEqual(sasOriginal.rawHashHex, sasTampered.rawHashHex);
  assert.notEqual(sasOriginal.rawHashHex, sasDiffCallId.rawHashHex);
});

test("computeCallSas returns null for incomplete descriptions", () => {
  assert.equal(computeCallSas(null, "sdp"), null);
  assert.equal(computeCallSas("sdp", null), null);
  assert.equal(computeCallSas("no-fp", "no-fp"), null);
});
