/**
 * Relay module — public API.
 *
 * Single import point for all relay functionality.
 */

// ---------------------------------------------------------------------------
// Selection & relay set management
// ---------------------------------------------------------------------------

export {
  selectRelays,
  getBanditLeaderboard,
  getBanditSelection,
  flushBanditScores,
  resetBanditScores,
  normalizeRelay,
  dedupeRelays,
  getKnownRelays,
  getActiveRelays,
  setActiveRelays,
  readRelays,
  writeRelays,
  rememberRelayHint,
  getCustomRelays,
  addCustomRelay,
  removeCustomRelay,
  addHintRelay,
  boostBanditScore,
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
  BANDIT_EXPLOIT_COUNT,
  BANDIT_EXPLORE_COUNT,
  MAX_ACTIVE_RELAYS,
  HINT_BOOST,
  classifyScore,
  classifyTraffic,
  tierBadgeClass,
  tierDotClass,
  formatScore,
  formatTrafficRate,
} from "./constants.js";
