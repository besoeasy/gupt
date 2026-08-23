import { pool } from "./pool.js";
import { readRelays, dedupeRelays } from "./selection.js";
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

export async function ensureConnectedRelays(relays) {
  const normalized = dedupeRelays(relays);
  if (!normalized.length) {
    throw new Error("No relays configured. Add at least one relay.");
  }

  const results = await Promise.allSettled(normalized.map((relay) => connectRelay(relay)));
  const connected = results.filter((r) => r.status === "fulfilled").map((r) => r.value);

  if (connected.length) return connected;

  throw buildRelayFailureFromOutcomes(
    "Could not connect to any relay.",
    normalized.map((r) => ({ relay: r, ok: false })),
  );
}

async function publishToEachRelay(relays, event, maxWait = PUBLISH_TIMEOUT_MS, silent = false) {
  try {
    const result = await pool.publish(relays, event, { maxWait, silent });
    const acked = new Set(result.urls || []);
    return relays.map((url) => {
      if (acked.has(url)) {
        return { relay: url, ok: true, latencyMs: result.latencies?.[url] || 0 };
      }
      return { relay: url, ok: false, error: "pending or no OK yet" };
    });
  } catch (err) {
    return relays.map((r) => ({ relay: r, ok: false, error: err.message }));
  }
}

function recordWriteMisses(relays, error) {
  if (!relays.length) return;
  recordOutcomes(
    "publish",
    relays.map((relay) => ({ relay, ok: false, error })),
  );
}

export async function publish(event, peerPubkey = null, options = {}) {
  let relays = options.relays?.length ? options.relays : await readRelays();

  if (peerPubkey) {
    const peerHints = await getPeerRelayHints(peerPubkey).catch(() => null);
    const hintUrls = (peerHints?.hints || [])
      .filter((h) => Date.now() - (h.lastSeenAt || 0) < 30 * 24 * 60 * 60 * 1000)
      .map((h) => h.url);
    relays = dedupeRelays([...relays, ...hintUrls]);
  }

  const wanted = relays;
  try {
    relays = await ensureConnectedRelays(relays);
  } catch (err) {
    recordWriteMisses(wanted, "not connected");
    throw err;
  }
  recordWriteMisses(
    wanted.filter((url) => !relays.includes(url)),
    "not connected",
  );
  const outcomes = await publishToEachRelay(relays, event, options.maxWait);
  const publishedRelays = outcomes.filter((e) => e.ok).map((e) => e.relay);

  if (!publishedRelays.length) {
    throw buildRelayFailureFromOutcomes("Could not publish to any relay.", outcomes);
  }

  return event;
}

export async function publishToRelays(relays, event, maxWait = PUBLISH_TIMEOUT_MS, silent = false) {
  const wanted = relays?.length ? relays : await readRelays();
  let normalizedRelays;
  try {
    normalizedRelays = await ensureConnectedRelays(wanted);
  } catch (err) {
    if (!silent) recordWriteMisses(wanted, "not connected");
    throw err;
  }
  if (!silent) {
    recordWriteMisses(
      wanted.filter((url) => !normalizedRelays.includes(url)),
      "not connected",
    );
  }
  const outcomes = await publishToEachRelay(normalizedRelays, event, maxWait, silent);

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

  return response;
}
