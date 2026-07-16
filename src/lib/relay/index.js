/**
 * Relay module — public API.
 *
 * Single import point for all relay functionality. Consumer code should
 * import from '@/lib/relay' instead of '@/lib/api', '@/lib/relayBandit',
 * '@/lib/relayHealth', or '@/lib/wspool'.
 *
 * This module coexists with the old code during migration. Once all consumers
 * are migrated, the old files can be deleted.
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
  readRelays,
  writeRelays,
} from './selection.js';

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export { publish, publishToRelays } from './publish.js';

// ---------------------------------------------------------------------------
// Query & Subscribe
// ---------------------------------------------------------------------------

export { query, queryMany, requestEventsFromRelays, subscribe } from './subscribe.js';

// ---------------------------------------------------------------------------
// Pool (low-level, for callers that need direct access)
// ---------------------------------------------------------------------------

export { pool, WsPool } from './pool.js';

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export { probeRelay, getHealthSummary } from './health.js';

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
  classifyScore,
  classifyTraffic,
  tierBadgeClass,
  probeBadgeClass,
  tierDotClass,
  formatScore,
  formatTrafficRate,
} from './constants.js';
