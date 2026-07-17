/**
 * WebRTC module — public API.
 *
 * Single import point for calls and peer-to-peer transfers: the call
 * session state machine, connectivity/stats helpers, and the data-channel
 * blob transfer with its chunk codec.
 */

// ---------------------------------------------------------------------------
// Constants & signal type guards
// ---------------------------------------------------------------------------

export {
  OUTGOING_RING_TIMEOUT_MS,
  ICE_BATCH_MS,
  DISCONNECTED_RECOVERY_MS,
  MAX_ICE_RESTARTS,
  CONNECTIVITY_CHECK_TIMEOUT_MS,
  STATS_POLL_INTERVAL_MS,
  CALL_SIGNAL_TYPES,
  CALL_EVENT_OUTCOMES,
  isCallSignalType,
  CHUNK_HEADER_BYTES,
  TRANSFER_CHUNK_SIZE,
} from "./constants.js";

// ---------------------------------------------------------------------------
// Pure helpers (media normalization, call event text, candidate helpers)
// ---------------------------------------------------------------------------

export {
  DEFAULT_MEDIA,
  normalizeMedia,
  randomCallId,
  formatMediaError,
  formatCallEventText,
  inferCallOutcome,
  serializeIceCandidate,
  summarizeCandidate,
  describeIceServers,
} from "./utils.js";

// ---------------------------------------------------------------------------
// Chunk codec & integrity
// ---------------------------------------------------------------------------

export { computeSha256, encodeChunk, decodeChunk, verifyBlobSha256 } from "./chunks.js";

// ---------------------------------------------------------------------------
// Peer connection helpers
// ---------------------------------------------------------------------------

export {
  createIceBatcher,
  createCandidateQueue,
  getUserMediaWithFallback,
  checkCallConnectivity,
  collectConnectionStats,
} from "./peers.js";

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export { createDirectCallSession } from "./callSession.js";

// ---------------------------------------------------------------------------
// Peer-to-peer blob transfer
// ---------------------------------------------------------------------------

export { waitForWebrtcBlob, handleWebrtcSignal, sendBlob } from "./transfer.js";
