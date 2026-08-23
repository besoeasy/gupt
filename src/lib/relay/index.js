export {
  normalizeRelay,
  dedupeRelays,
  getKnownRelays,
  readRelays,
  pickRelayHint,
  relayHintHash,
  rememberRelayHint,
  getCustomRelays,
  addCustomRelay,
  removeCustomRelay,
  addHintRelay,
  discoverRelaysFromNetwork,
  startNetworkDiscoveryLoop,
  getAvgActiveRelayScore,
} from "./selection.js";

export { publish, publishToRelays, ensureConnectedRelays } from "./publish.js";

export { query, queryMany, requestEventsFromRelays, subscribe } from "./subscribe.js";

export { pool, WsPool } from "./pool.js";

export { getHealthSummary } from "./health.js";

export { storePeerRelayHint, collectPeerHintsFromHistory } from "./hints.js";

export {
  RelayTier,
  CONNECT_TIMEOUT_MS,
  QUERY_TIMEOUT_MS,
  PUBLISH_TIMEOUT_MS,
  SUBSCRIBE_EOSE_MS,
  EXPLOIT_SLOTS,
  EXPLORE_SLOTS,
  classifyTraffic,
  tierBadgeClass,
  tierDotClass,
  formatTrafficRate,
} from "./constants.js";
