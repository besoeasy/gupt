/**
 * Relay module — public API.
 *
 * Single import point for all relay functionality.
 */

// ---------------------------------------------------------------------------
// Selection & relay set management
// ---------------------------------------------------------------------------

export {
  normalizeRelay,
  dedupeRelays,
  getKnownRelays,
  readRelays,
  rememberRelayHint,
  getCustomRelays,
  addCustomRelay,
  removeCustomRelay,
  addHintRelay,
} from "./selection.js";

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export { publish, publishToRelays } from "./publish.js";

// ---------------------------------------------------------------------------
// Query & Subscribe
// ---------------------------------------------------------------------------

export { query, queryMany, requestEventsFromRelays, subscribe } from "./subscribe.js";

// ---------------------------------------------------------------------------
// Pool (low-level, for callers that need direct access)
// ---------------------------------------------------------------------------

export { pool, WsPool } from "./pool.js";

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export { getHealthSummary } from "./health.js";

// ---------------------------------------------------------------------------
// Peer relay hints
// ---------------------------------------------------------------------------

export { storePeerRelayHint, collectPeerHintsFromHistory } from "./hints.js";

// ---------------------------------------------------------------------------
// Constants & display helpers
// ---------------------------------------------------------------------------

export {
  RelayTier,
  CONNECT_TIMEOUT_MS,
  QUERY_TIMEOUT_MS,
  PUBLISH_TIMEOUT_MS,
  SUBSCRIBE_EOSE_MS,
  EXPLOIT_SLOTS,
  EXPLORE_SLOTS,
  classifyScore,
  classifyTraffic,
  tierBadgeClass,
  tierDotClass,
  formatScore,
  formatTrafficRate,
} from "./constants.js";
