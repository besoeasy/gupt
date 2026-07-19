/**
 * Outcome recording — writes operation results to the IDB relayStats table
 * (for relay ranking and UI health summaries). Single source of truth for
 * all outcome recording.
 */

import { recordRelayOutcomes } from "@/lib/idb.js";

/**
 * Record outcomes for an operation (connect, publish, query).
 * IDB write is fire-and-forget.
 *
 * @param {'connect'|'publish'|'query'} operation
 * @param {{ relay: string, ok: boolean, latencyMs?: number, error?: string }[]} outcomes
 */
export function recordOutcomes(operation, outcomes) {
  if (!Array.isArray(outcomes) || !outcomes.length) return;
  void recordRelayOutcomes(operation, outcomes).catch(() => {});
}
