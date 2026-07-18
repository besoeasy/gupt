/**
 * WebRTC module — shared constants.
 *
 * Timeouts, signal type registries, and tuning knobs for call sessions.
 */

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export const OUTGOING_RING_TIMEOUT_MS = 45_000;
export const ICE_BATCH_MS = 1500;
export const DISCONNECTED_RECOVERY_MS = 8_000;
export const MAX_ICE_RESTARTS = 2;
export const CONNECTIVITY_CHECK_TIMEOUT_MS = 5_000;
export const STATS_POLL_INTERVAL_MS = 3_000;

export const CALL_SIGNAL_TYPES = Object.freeze([
  "call-offer",
  "call-answer",
  "call-ice",
  "call-ice-batch",
  "call-restart",
  "call-reject",
  "call-hangup",
  "call-accept",
  "call-decline",
]);

export const CALL_EVENT_OUTCOMES = Object.freeze([
  "ended",
  "no-answer",
  "declined",
  "cancelled",
  "busy",
  "missed",
  "failed",
]);

export function isCallSignalType(type) {
  return CALL_SIGNAL_TYPES.includes(type);
}
