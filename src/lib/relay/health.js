import { getRelayHealthSummary } from "../idb.js";
import { checkRelayHealth, fetchRelayTelemetry } from "../rabta/index.js";
import { recordOutcomes } from "./outcomes.js";
import { dedupeRelays } from "./selection.js";

export async function getHealthSummary() {
  return getRelayHealthSummary();
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
        storageUsedBytes: res.storageUsedBytes !== undefined ? Number(res.storageUsedBytes) : undefined,
        storageBudgetBytes: res.storageBudgetBytes !== undefined ? Number(res.storageBudgetBytes) : undefined,
      };
    }),
  );

  recordOutcomes("connect", outcomes);
  return outcomes;
}

export { checkRelayHealth, fetchRelayTelemetry };
export { tierDotClass } from "./constants.js";
