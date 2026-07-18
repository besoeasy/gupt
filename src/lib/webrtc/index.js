/**
 * WebRTC module — public API.
 *
 * Single import point for calls: the call session state machine,
 * connectivity/stats helpers, and ICE peer-connection helpers.
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
