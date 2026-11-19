import { recordRelayOutcomes } from "../idb.js";

/**
 * Persist relay outcomes; resolves once the write settles so callers that must
 * read the stats back straight away can await it. Errors stay swallowed.
 */
export function recordOutcomes(operation, outcomes) {
  if (!Array.isArray(outcomes) || !outcomes.length) return Promise.resolve();
  return recordRelayOutcomes(operation, outcomes).catch(() => {});
}
