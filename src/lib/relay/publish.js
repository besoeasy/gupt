/**
 * Relay publish — standardized publish logic.
 * All publishes go through this module, which handles:
 * - Relay set selection (always uses the optimal write set)
 * - Peer hint merging
 * - Connection management
 * - Outcome recording
 */

import { pool } from "./pool.js";
import { writeRelays, dedupeRelays, getActiveRelays, _setActiveRelays } from "./selection.js";
import { getPeerRelayHints } from "@/lib/idb.js";
import { PUBLISH_TIMEOUT_MS, CONNECT_TIMEOUT_MS } from "./constants.js";
import { recordOutcomes } from "./outcomes.js";

function formatRelayError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function buildRelayFailureFromOutcomes(prefix, outcomes) {
  const details = outcomes
    .filter((e) => !e.ok)
    .map((e) => `${e.relay}: ${e.error || "failed"}`)
    .join(" | ");
  return new Error(details ? `${prefix} ${details}` : prefix);
}

/**
 * Connect to a single relay and record the outcome.
 * @param {string} relay
 * @returns {Promise<string>} the relay URL on success
 */
async function connectRelay(relay) {
  const start = Date.now();
  try {
    await pool.ensureRelay(relay, { connectionTimeout: CONNECT_TIMEOUT_MS });
    const outcome = { relay, ok: true, latencyMs: Date.now() - start };
    recordOutcomes("connect", [outcome]);
    return relay;
  } catch (err) {
    const outcome = {
      relay,
      ok: false,
      latencyMs: Date.now() - start,
      error: formatRelayError(err),
    };
    recordOutcomes("connect", [outcome]);
    throw err;
  }
}

/**
 * Ensure connections to a set of relays. Returns the successfully connected subset.
 * @param {string[]} relays
 * @returns {Promise<string[]>}
 */
async function ensureConnectedRelays(relays) {
  const normalized = dedupeRelays(relays);
  if (!normalized.length) {
    throw new Error("No relays configured. Add at least one relay.");
  }

  const results = await Promise.allSettled(normalized.map((relay) => connectRelay(relay)));
  const connected = results.filter((r) => r.status === "fulfilled").map((r) => r.value);

  if (connected.length) {
    _setActiveRelays([...getActiveRelays(), ...connected]);
    return connected;
  }

  throw buildRelayFailureFromOutcomes(
    "Could not connect to any relay.",
    normalized.map((r) => ({ relay: r, ok: false })),
  );
}

/**
 * Publish an event to a specific set of relays.
 * @param {string[]} relays
 * @param {object} event
 * @param {number} [maxWait]
 * @returns {Promise<Array<{ relay: string, ok: boolean, latencyMs?: number, error?: string }>>}
 */
async function publishToEachRelay(relays, event, maxWait = PUBLISH_TIMEOUT_MS) {
  try {
    const result = await pool.publish(relays, event, { maxWait });
    const outcomes = result.urls.map((url) => ({ relay: url, ok: true, latencyMs: 0 }));
    recordOutcomes("publish", outcomes);
    return outcomes;
  } catch (err) {
    const outcomes = relays.map((r) => ({ relay: r, ok: false, error: err.message }));
    recordOutcomes("publish", outcomes);
    return outcomes;
  }
}

/**
 * Publish an event using the optimal write relay set.
 * If peerPubkey is provided, peer relay hints are merged in.
 *
 * @param {object} event
 * @param {string|null} [peerPubkey]
 * @param {{ maxWait?: number, relays?: string[] }} [options]
 * @returns {Promise<object>} the published event
 */
export async function publish(event, peerPubkey = null, options = {}) {
  let relays = options.relays?.length ? options.relays : writeRelays();

  if (peerPubkey) {
    const peerHints = await getPeerRelayHints(peerPubkey).catch(() => null);
    const hintUrls = (peerHints?.hints || [])
      .filter((h) => Date.now() - (h.lastSeenAt || 0) < 30 * 24 * 60 * 60 * 1000)
      .map((h) => h.url);
    relays = dedupeRelays([...relays, ...hintUrls]);
  }

  relays = await ensureConnectedRelays(relays);
  const outcomes = await publishToEachRelay(relays, event, options.maxWait);
  const publishedRelays = outcomes.filter((e) => e.ok).map((e) => e.relay);

  if (!publishedRelays.length) {
    throw buildRelayFailureFromOutcomes("Could not publish to any relay.", outcomes);
  }

  _setActiveRelays([...getActiveRelays(), ...publishedRelays]);
  return event;
}

/**
 * Publish to explicit relay set (for callers that need specific relays).
 * Returns a per-relay response map.
 *
 * @param {string[]} relays
 * @param {object} event
 * @param {number} [maxWait]
 * @returns {Promise<object>} { [relayUrl]: { from, ok, message, latencyMs } }
 */
export async function publishToRelays(relays, event, maxWait = PUBLISH_TIMEOUT_MS) {
  const normalizedRelays = await ensureConnectedRelays(relays?.length ? relays : writeRelays());
  const outcomes = await publishToEachRelay(normalizedRelays, event, maxWait);

  const response = {};
  for (const entry of outcomes) {
    response[entry.relay] = entry.ok
      ? { from: entry.relay, ok: true, message: "ok", latencyMs: entry.latencyMs }
      : {
          from: entry.relay,
          ok: false,
          message: entry.error || "failed",
          latencyMs: entry.latencyMs,
        };
  }

  const publishedRelays = outcomes.filter((e) => e.ok).map((e) => e.relay);
  if (!publishedRelays.length) {
    throw buildRelayFailureFromOutcomes("Could not publish to any relay.", outcomes);
  }

  _setActiveRelays([...getActiveRelays(), ...publishedRelays]);
  return response;
}
