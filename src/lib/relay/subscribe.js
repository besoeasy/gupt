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

export async function queryMany(filters, maxWait = QUERY_TIMEOUT_MS, extraRelays = []) {
  if (!filters.length) return [];
  const baseRelays = await readRelays();
  const relays = dedupeRelays([...baseRelays, ...extraRelays]);
  if (!relays.length) throw new Error("No relays configured. Add at least one relay.");

  return pool.querySync(relays, filters, { maxWait });
}

export async function requestEventsFromRelays(relays, filters, maxWait = QUERY_TIMEOUT_MS) {
  const normalizedRelays = await ensureConnectedRelays(
    relays?.length ? relays : await readRelays(),
  );
  const requests = toFiltersArray(filters);

  const outcomes = await Promise.all(
    normalizedRelays.map(async (relay) => {
      try {
        const events = await pool.querySync([relay], requests, { maxWait });
        return { relay, ok: true, events };
      } catch (err) {
        return {
          relay,
          ok: false,
          error: formatRelayError(err),
          events: [],
        };
      }
    }),
  );

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

export async function subscribe(relays, filters, observer, maxWait = SUBSCRIBE_EOSE_MS) {
  const resolvedRelays = relays?.length ? relays : await readRelays();
  const startedAt = Date.now();
  let connected;
  try {
    connected = await ensureConnectedRelays(resolvedRelays);
  } catch (err) {
    recordOutcomes(
      "query",
      resolvedRelays.map((relay) => ({ relay, ok: false, error: "not connected" })),
    );
    throw err;
  }
  const missed = resolvedRelays.filter((url) => !connected.includes(url));
  if (missed.length) {
    recordOutcomes(
      "query",
      missed.map((relay) => ({ relay, ok: false, error: "not connected" })),
    );
  }
  const filtersArray = toFiltersArray(filters);

  const requests = [];
  for (const url of connected) {
    for (const filter of filtersArray) {
      requests.push({ url, filter });
    }
  }

  let closedByClient = false;
  let eventCount = 0;
  const eoseRecorded = new Set();
  const sub = pool.subscribeMap(requests, {
    maxWait,
    onevent(event) {
      eventCount++;
      observer?.next?.(event);
    },
    oneose(url) {
      if (!url || eoseRecorded.has(url)) return;
      eoseRecorded.add(url);
      recordOutcomes("query", [{ relay: url, ok: true, latencyMs: Date.now() - startedAt }]);
    },
    onclose(reasons) {
      if (closedByClient) return;

      const BENIGN = new Set([
        "closed automatically on eose",
        "closed by client",
        "connection skipped by allowConnectingToRelay",
        "socket closed",
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
