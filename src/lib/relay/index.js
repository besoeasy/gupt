export {
  normalizeRelay,
  dedupeRelays,
  getKnownRelays,
  getCustomRelays,
  addCustomRelay,
  removeCustomRelay,
} from "./selection.js";

export { publish, publishToRelays, ensureConnectedRelays } from "./publish.js";

export { query, subscribe } from "./subscribe.js";

export { getHealthSummary, getUnhealthyConfiguredRelays, probeRelayConnections } from "./health.js";

export {
  RelayTier,
  classifyTraffic,
  tierBadgeClass,
  tierDotClass,
  formatTrafficRate,
} from "./constants.js";

export {
  RELAY_DEAD_TTL_MS,
  isRelayDead,
  getRelayDeadUntil,
  markRelayDead,
  markRelayAlive,
  filterLiveRelays,
  isTransportError,
  noteRelayOutcome,
  clearRelayCircuit,
} from "./circuit.js";

export {
  RELAY_ATTEMPT_BASE_MS,
  RELAY_ATTEMPT_MAX_MS,
  relayAttemptTimeoutMs,
  capRelayTimeoutMs,
} from "./timeouts.js";
