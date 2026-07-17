/**
 * WebRTC module — shared constants.
 *
 * Timeouts, signal type registries, and tuning knobs used by both the call
 * session and the peer-to-peer blob transfer.
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

// ---------------------------------------------------------------------------
// Peer-to-peer blob transfer
// ---------------------------------------------------------------------------

/** Wire header: seq (4) + total (4) + sha256 (64) — must stay wire-compatible. */
export const CHUNK_HEADER_BYTES = 72;

/** 16 KB chunks — safe for every browser's SCTP stack. */
export const TRANSFER_CHUNK_SIZE = 16_000;

/** Pause sending above this bufferedAmount to avoid SCTP buffer bloat. */
export const TRANSFER_BUFFERED_AMOUNT_LOW = 256 * 1024;

/** Window for coalescing ICE candidates into a single DM. */
export const TRANSFER_ICE_BATCH_MS = 1_000;

/** Give up on a sender whose data channel never opens (peer offline / NAT). */
export const CHANNEL_OPEN_TIMEOUT_MS = 20_000;

/** Give up on a receiver that stops seeing chunks for this long. */
export const RECEIVE_IDLE_TIMEOUT_MS = 60_000;

/** Max wait for the SCTP send buffer to drain after the last chunk. */
export const SENDER_DRAIN_TIMEOUT_MS = 30_000;

/** Completed blobs are kept briefly so retrying consumers can re-read them. */
export const BLOB_CACHE_TTL_MS = 5 * 60_000;
export const BLOB_CACHE_MAX_ENTRIES = 32;
