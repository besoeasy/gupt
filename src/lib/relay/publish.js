import { publishEvent } from "@/lib/rabta";
import { readRelays, dedupeRelays } from "./selection.js";
import { getPeerRelayHints } from "@/lib/idb.js";
import { recordOutcomes } from "./outcomes.js";

export async function ensureConnectedRelays(relays) {
  const normalized = dedupeRelays(relays);
  if (normalized.length) return normalized;
  const defaults = await readRelays();
  if (defaults.length) return defaults;
  throw new Error("No relays configured. Add at least one relay.");
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

  const results = await publishToRelays(relays, event);
  const anyOk = Object.values(results).some((r) => r.ok);
  if (!anyOk) {
    throw new Error("Failed to publish to any Rabta relay.");
  }
  return event;
}

export async function publishToRelays(relays, event) {
  const targetRelays = dedupeRelays(relays?.length ? relays : await readRelays());
  const publishResults = await publishEvent(event, targetRelays);

  const response = {};
  const outcomes = [];

  for (const [relay, res] of Object.entries(publishResults)) {
    response[relay] = {
      from: relay,
      ok: res.ok,
      message: res.ok ? "ok" : res.error || "failed",
      latencyMs: res.latencyMs || 0,
    };
    outcomes.push({
      relay,
      ok: res.ok,
      latencyMs: res.latencyMs || 0,
      error: res.error,
    });
  }

  recordOutcomes("publish", outcomes);

  const anyOk = Object.values(response).some((r) => r.ok);
  if (!anyOk) {
    throw new Error("Failed to publish to any Rabta relay.");
  }

  return response;
}
