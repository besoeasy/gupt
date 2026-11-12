import { getRelayHealthSummary } from "../idb.js";
import { checkRelayHealth } from "../rabta/index.js";
import { recordOutcomes } from "./outcomes.js";
import { dedupeRelays } from "./selection.js";

export async function getHealthSummary() {
  return getRelayHealthSummary();
}

/**
 * Probe relays for reachability + handshake latency and feed the results into
 * the connect dimension of relay scoring. Any HTTP answer below 500 means the
 * node is reachable; network errors, timeouts, and 5xx responses are failures.
 */
export async function probeRelayConnections(relays, { timeoutMs = 5000 } = {}) {
  const targets = dedupeRelays(Array.isArray(relays) ? relays : []);
  if (!targets.length) return [];

  const outcomes = await Promise.all(
    targets.map(async (relay) => {
      const res = await checkRelayHealth(relay, { timeoutMs });
      const status = Number(res.status) || 0;
      const ok =
        Boolean(res.reachable) && status > 0 && status < 500 && status !== 408 && status !== 429;
      return {
        relay,
        ok,
        latencyMs: Number(res.latency) || 0,
        error: ok ? undefined : res.error,
      };
    }),
  );

  recordOutcomes("connect", outcomes);
  return outcomes;
}

export { tierDotClass } from "./constants.js";
