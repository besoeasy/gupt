import { checkRelayHasEvent } from "./rabta/index.js";

const DEFAULT_AUDIT_TIMEOUT_MS = 4000;
const DEFAULT_AUDIT_LIMIT = 6;
const HEX_RE = /^[0-9a-f]{64}$/;

function normalizeRelays(relays) {
  return [
    ...new Set(
      (Array.isArray(relays) ? relays : [])
        .map((relay) =>
          String(relay || "")
            .trim()
            .replace(/\/+$/, ""),
        )
        .filter(Boolean),
    ),
  ];
}

async function probeEvent(relay, eventId, timeoutMs) {
  const has = await checkRelayHasEvent(relay, eventId, { timeoutMs });
  if (has === true) return "live";
  if (has === false) return "missing";
  return "unknown";
}

/**
 * Audit which relays still hold a given event. A live copy answers 200 or 304
 * to a conditional GET; 404 proves the relay no longer holds it; anything else
 * (network error, 5xx, rate limit) is unknown and never triggers a renewal.
 */
export async function auditEventCopies(
  eventId,
  relays,
  { timeoutMs = DEFAULT_AUDIT_TIMEOUT_MS } = {},
) {
  const id = String(eventId || "").toLowerCase();
  const list = normalizeRelays(relays);
  const outcomes = await Promise.all(
    list.map(async (relay) => ({ relay, state: await probeEvent(relay, id, timeoutMs) })),
  );
  const live = outcomes.filter((o) => o.state === "live").map((o) => o.relay);
  const missing = outcomes.filter((o) => o.state === "missing").map((o) => o.relay);
  const unknown = outcomes.filter((o) => o.state === "unknown").map((o) => o.relay);
  return { eventId: id, live, missing, unknown };
}

/**
 * Audit the newest vault items (items are sorted newest first by callers).
 * Returns the event ids with no live copy on any relay, which renewal should
 * rewrite first regardless of the item's age.
 */
export async function auditStreamItems(
  items,
  relays,
  { timeoutMs = DEFAULT_AUDIT_TIMEOUT_MS, limit = DEFAULT_AUDIT_LIMIT } = {},
) {
  const seen = new Set();
  const candidates = [];
  for (const item of Array.isArray(items) ? items : []) {
    const eventId = String(item?.eventId || "").toLowerCase();
    if (!HEX_RE.test(eventId) || seen.has(eventId)) continue;
    seen.add(eventId);
    candidates.push(eventId);
    if (candidates.length >= limit) break;
  }

  const audits = await Promise.all(
    candidates.map((eventId) => auditEventCopies(eventId, relays, { timeoutMs })),
  );
  const missingEventIds = new Set(
    audits.filter((audit) => !audit.live.length && audit.missing.length > 0).map((a) => a.eventId),
  );

  return { audits, missingEventIds };
}

export function summarizeAudits(audits) {
  let liveCopies = 0;
  let missingEvents = 0;
  let unknownEvents = 0;
  for (const audit of Array.isArray(audits) ? audits : []) {
    liveCopies += audit.live.length;
    if (!audit.live.length && audit.missing.length) missingEvents++;
    else if (!audit.live.length) unknownEvents++;
  }
  return {
    events: Array.isArray(audits) ? audits.length : 0,
    liveCopies,
    missingEvents,
    unknownEvents,
  };
}
