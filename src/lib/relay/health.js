import { getRelayHealthSummary } from "../idb.js";
import { checkRelayHealth, fetchRelayTelemetry } from "../rabta/index.js";
import { RelayTier } from "./constants.js";
import { recordOutcomes } from "./outcomes.js";
import { dedupeRelays, getKnownRelays } from "./selection.js";

export async function getHealthSummary() {
  return getRelayHealthSummary();
}

/**
 * Configured relays whose observed traffic grades them poor. Health never
 * removes a relay from use, so this is a warning surface only: Settings and the
 * chat send path use it to tell the user their writes may not stick.
 */
export async function getUnhealthyConfiguredRelays() {
  const known = new Set(getKnownRelays());
  if (!known.size) return [];

  const summary = await getRelayHealthSummary();
  return summary.filter(
    (row) =>
      known.has(row.relay) && (row.tier === RelayTier.POOR || row.tier === RelayTier.OFFLINE),
  );
}

/**
 * Probe relays for reachability + handshake latency and feed the results into
 * the connect dimension of relay scoring.
 * Routine keepalives use fast GET /api/v1/health (zero join overhead); pass
 * { detailed: true } to fetch full GET /api/v1/node capacity telemetry.
 */
export async function probeRelayConnections(relays, { timeoutMs = 5000, detailed = false } = {}) {
  const targets = dedupeRelays(Array.isArray(relays) ? relays : []);
  if (!targets.length) return [];

  const outcomes = await Promise.all(
    targets.map(async (relay) => {
      const res = await checkRelayHealth(relay, { timeoutMs, detailed });
      const status = Number(res.status) || 0;
      const ok =
        Boolean(res.reachable) && status > 0 && status < 500 && status !== 408 && status !== 429;
      return {
        relay,
        ok,
        latencyMs: Number(res.latency) || 0,
        error: ok ? undefined : res.error,
        nodeId: res.nodeId || undefined,
        liveEvents: res.liveEvents !== undefined ? res.liveEvents : undefined,
        liveBlobs: res.liveBlobs !== undefined ? res.liveBlobs : undefined,
        // Capacity telemetry from GET /api/v1/node:
        mode: res.mode || undefined,
        syncPeers: res.syncPeers !== undefined ? Number(res.syncPeers) : undefined,
        storageUsedBytes:
          res.storageUsedBytes !== undefined ? Number(res.storageUsedBytes) : undefined,
        storageBudgetBytes:
          res.storageBudgetBytes !== undefined ? Number(res.storageBudgetBytes) : undefined,
      };
    }),
  );

  recordOutcomes("connect", outcomes);
  return outcomes;
}

export { checkRelayHealth, fetchRelayTelemetry };
export { tierDotClass } from "./constants.js";
