/**
 * Relay health — probing and classification.
 */

import { getRelayHealthSummary } from '@/lib/idb.js';
import { RelayTier, classifyTraffic, probeBadgeClass, tierBadgeClass, tierDotClass } from './constants.js';

/**
 * Probe a relay by opening a real WebSocket connection and measuring latency.
 * @param {string} wssUrl
 * @returns {Promise<{ url: string, ms: number|null, tier: string }>}
 */
export function probeRelay(wssUrl) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let settled = false;

    function done(ms) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ms === null) {
        resolve({ url: wssUrl, ms: null, tier: RelayTier.OFFLINE });
      } else {
        const tier = ms < 150 ? 'fast' : ms < 500 ? 'ok' : 'slow';
        resolve({ url: wssUrl, ms, tier });
      }
      try {
        ws.close();
      } catch {
        // ignore
      }
    }

    const timer = setTimeout(() => done(null), 4000);

    let ws;
    try {
      ws = new WebSocket(wssUrl);
    } catch {
      done(null);
      return;
    }

    ws.onopen = () => done(Math.round(performance.now() - t0));
    ws.onerror = () => done(null);
    ws.onclose = () => {
      if (!settled) done(null);
    };
  });
}

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
export { probeBadgeClass, tierBadgeClass, tierDotClass, formatTrafficRate } from './constants.js';
