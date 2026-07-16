/**
 * Outcome recording — writes operation results to both the bandit score map
 * (localStorage, for relay selection) and the IDB relayStats table (for UI
 * health summaries). Single source of truth for all outcome recording.
 */

import { recordRelayOutcomes } from "@/lib/idb.js";
import { recordBanditOutcomes } from "./selection.js";

/**
 * Record outcomes for an operation (connect, publish, query).
 * Bandit update is synchronous; IDB write is fire-and-forget.
 *
 * @param {'connect'|'publish'|'query'} operation
 * @param {{ relay: string, ok: boolean, latencyMs?: number, error?: string }[]} outcomes
 */
export function recordOutcomes(operation, outcomes) {
  if (!Array.isArray(outcomes) || !outcomes.length) return;

  try {
    recordBanditOutcomes(outcomes);
  } catch {
    // Bandit recording should never break the caller
  }

  void recordRelayOutcomes(operation, outcomes).catch(() => {});
}
