/**
 * Relay health — read-only IDB summary used by the UI.
 */

import { getRelayHealthSummary } from "@/lib/idb.js";
import {
  classifyTraffic,
  tierDotClass,
} from "./constants.js";

/**
 * Get the full relay health summary from IDB, with unified tiers.
 * @returns {Promise<Array<{
 *   relay: string, tier: string,
 *   publishOk: number, publishFail: number, publishTotal: number,
 *   publishSuccessRate: number|null, avgPublishMs: number,
 *   connectOk: number, connectFail: number, connectTotal: number,
 *   connectSuccessRate: number|null, avgConnectMs: number,
 *   queryOk: number, queryFail: number, queryTotal: number,
 *   querySuccessRate: number|null, avgQueryMs: number,
 *   lastPublishOkAt: number, lastPublishFailAt: number,
 *   lastConnectOkAt: number, lastConnectFailAt: number,
 *   lastError: string, updatedAt: number
 * }>>}
 */
export async function getHealthSummary() {
  const rows = await getRelayHealthSummary();

  return rows.map((row) => ({
    ...row,
    tier: classifyTraffic(
      row.publishSuccessRate,
      row.publishTotal,
      row.connectSuccessRate,
      row.connectTotal,
    ),
  }));
}

// Re-export display helpers from constants for convenience
export { tierDotClass } from "./constants.js";
