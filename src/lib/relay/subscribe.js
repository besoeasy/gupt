/**
 * Relay subscribe/query — standardized subscription and query logic.
 * All queries and subscriptions go through this module, which handles:
 * - Relay set selection (always uses the optimal read set)
 * - Deduplication
 * - EOSE handling
 * - Outcome recording
 */

import { pool } from "./pool.js";
import { readRelays, dedupeRelays } from "./selection.js";
import { QUERY_TIMEOUT_MS, SUBSCRIBE_EOSE_MS, CONNECT_TIMEOUT_MS } from "./constants.js";
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

function mergeEvents(results) {
  const events = [];
  const seenIds = new Set();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const event of result.value) {
      if (seenIds.has(event.id)) continue;
      seenIds.add(event.id);
      events.push(event);
    }
  }
  return events;
}

function toFiltersArray(filters) {
  return Array.isArray(filters) ? filters : [filters];
}

// ---------------------------------------------------------------------------
// Connect (used internally by requestEventsFromRelays)
// ---------------------------------------------------------------------------

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

async function ensureConnectedRelays(relays) {
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

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Query events from relays using the optimal read set.
 * Returns all deduplicated events received before EOSE or timeout.
 *
 * @param {object|object[]} filter
 * @param {number} [maxWait]
 * @returns {Promise<object[]>}
 */
export async function query(filter, maxWait = QUERY_TIMEOUT_MS) {
  const relays = await readRelays();
  if (!relays.length) throw new Error("No relays configured. Add at least one relay.");

  let events;
  try {
    events = await pool.querySync(relays, filter, { maxWait });
  } catch (err) {
    throw new Error(`Could not read from any relay. ${formatRelayError(err)}`);
  }

  return events;
}

/**
 * Query multiple filters from relays, collecting all events before EOSE/timeout.
 *
 * @param {object[]} filters
 * @param {number} [maxWait]
 * @returns {Promise<object[]>}
 */
export async function queryMany(filters, maxWait = QUERY_TIMEOUT_MS) {
  if (!filters.length) return [];
  const relays = await readRelays();
  if (!relays.length) throw new Error("No relays configured. Add at least one relay.");

  const requests = [];
  for (const url of relays) {
    for (const filter of filters) {
      requests.push({ url, filter });
    }
  }

  return new Promise((resolve) => {
    const collected = [];
    const seenIds = new Set();
    let timer;
    const sub = pool.subscribeMap(requests, {
      maxWait,
      onevent(event) {
        if (seenIds.has(event.id)) return;
        seenIds.add(event.id);
        collected.push(event);
      },
      oneose() {
        clearTimeout(timer);
        sub.close();
        resolve(collected);
      },
    });
    timer = setTimeout(() => {
      sub.close();
      resolve(collected);
    }, maxWait);
  });
}

/**
 * Query events from explicit relay set with per-relay outcome recording.
 * Used when callers need to know which relay succeeded/failed.
 *
 * @param {string[]|null} relays  If null, uses readRelays()
 * @param {object|object[]} filters
 * @param {number} [maxWait]
 * @returns {Promise<object[]>} merged deduplicated events
 */
export async function requestEventsFromRelays(relays, filters, maxWait = QUERY_TIMEOUT_MS) {
  const normalizedRelays = await ensureConnectedRelays(
    relays?.length ? relays : await readRelays(),
  );
  const requests = toFiltersArray(filters);

  const outcomes = await Promise.all(
    normalizedRelays.map(async (relay) => {
      const start = Date.now();
      try {
        const events = await pool.querySync([relay], requests, { maxWait });
        return { relay, ok: true, latencyMs: Date.now() - start, events };
      } catch (err) {
        return {
          relay,
          ok: false,
          latencyMs: Date.now() - start,
          error: formatRelayError(err),
          events: [],
        };
      }
    }),
  );

  const queryOutcomes = outcomes.map(({ relay, ok, latencyMs, error }) => ({
    relay,
    ok,
    latencyMs,
    error,
  }));
  recordOutcomes("query", queryOutcomes);

  const successfulRelays = outcomes.filter((e) => e.ok).map((e) => e.relay);
  if (!successfulRelays.length) {
    throw buildRelayFailureFromOutcomes("Could not read from any relay.", outcomes);
  }

  return mergeEvents(
    outcomes.map((e) =>
      e.ok ? { status: "fulfilled", value: e.events } : { status: "rejected", reason: e.error },
    ),
  );
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

/**
 * Subscribe to events from relays using the optimal read set.
 * Returns { unsubscribe() }.
 *
 * @param {string[]|null} relays  If null, uses readRelays()
 * @param {object|object[]} filters
 * @param {{ next?: Function, error?: Function, complete?: Function }} observer
 * @param {number} [maxWait]
 * @returns {{ unsubscribe: () => void }}
 */
export async function subscribe(relays, filters, observer, maxWait = SUBSCRIBE_EOSE_MS) {
  const resolvedRelays = relays?.length ? relays : await readRelays();
  const normalizedRelays = dedupeRelays(resolvedRelays);
  const filtersArray = toFiltersArray(filters);

  const requests = [];
  for (const url of normalizedRelays) {
    for (const filter of filtersArray) {
      requests.push({ url, filter });
    }
  }

  let closedByClient = false;
  const sub = pool.subscribeMap(requests, {
    maxWait,
    onevent(event) {
      observer?.next?.(event);
    },
    onclose(reasons) {
      if (closedByClient) return;

      const BENIGN = new Set([
        "closed automatically on eose",
        "closed by client",
        "connection skipped by allowConnectingToRelay",
      ]);
      const genuineErrors = (reasons || []).filter(
        (reason) => reason && !BENIGN.has(reason) && !reason.startsWith("auth-required:"),
      );

      if (genuineErrors.length) {
        observer?.error?.(new Error(reasons.join(" | ")));
      } else {
        observer?.complete?.();
      }
    },
  });

  return {
    unsubscribe() {
      closedByClient = true;
      sub.close("closed by client");
    },
  };
}
