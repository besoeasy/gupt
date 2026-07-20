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

  console.log("[gupt-relay-query] query", {
    relayCount: relays.length,
    relays: relays.map((r) => r.slice(0, 30)),
    filter: JSON.stringify(filter).slice(0, 200),
    maxWait,
  });

  let events;
  try {
    events = await pool.querySync(relays, filter, { maxWait });
  } catch (err) {
    console.warn("[gupt-relay-query] query FAILED", { error: err?.message });
    throw new Error(`Could not read from any relay. ${formatRelayError(err)}`);
  }

  console.log("[gupt-relay-query] query result", {
    eventCount: events.length,
    eventIds: events.slice(0, 5).map((e) => e.id?.slice(0, 12)),
  });
  return events;
}

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

  const totalUrls = new Set(requests.map((r) => r.url)).size;

  console.log("[gupt-relay-queryMany] starting", {
    relayCount: relays.length,
    relays: relays.map((r) => r.slice(0, 30)),
    filterCount: filters.length,
    filters: filters.map((f) => JSON.stringify(f).slice(0, 120)),
    requestCount: requests.length,
    totalUrls,
    maxWait,
  });

  const startTime = Date.now();
  const relayEoseTimes = {};

  return new Promise((resolve) => {
    const collected = [];
    const seenIds = new Set();
    let dupeCount = 0;
    let eoseCount = 0;
    let resolved = false;
    let timer;

    function finish(reason) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      sub.close();

      const elapsed = Date.now() - startTime;

      // Record outcomes — penalise relays that never sent EOSE
      const outcomes = relays.map((url) => {
        const eoseAt = relayEoseTimes[url];
        if (eoseAt) {
          return { relay: url, ok: true, latencyMs: eoseAt - startTime };
        }
        return { relay: url, ok: false, latencyMs: elapsed, error: `query ${reason}: no EOSE within ${maxWait}ms` };
      });
      recordOutcomes("query", outcomes);

      const respondedCount = Object.keys(relayEoseTimes).length;
      const timedOutRelays = relays.filter((url) => !relayEoseTimes[url]);

      console.log(`[gupt-relay-queryMany] ${reason}`, {
        elapsed,
        collectedCount: collected.length,
        dupeCount,
        eoseCount,
        totalUrls,
        respondedCount,
        timedOutRelays: timedOutRelays.map((r) => r.slice(0, 30)),
        relayEoseTimes: Object.fromEntries(
          Object.entries(relayEoseTimes).map(([url, t]) => [url.slice(0, 30), t - startTime + "ms"]),
        ),
      });

      resolve(collected);
    }

    const sub = pool.subscribeMap(requests, {
      maxWait,
      onevent(event) {
        if (seenIds.has(event.id)) {
          dupeCount++;
          return;
        }
        seenIds.add(event.id);
        collected.push(event);
      },
      oneose(relayUrl) {
        eoseCount++;

        // Track which specific relay sent EOSE
        if (relayUrl && !relayEoseTimes[relayUrl]) {
          relayEoseTimes[relayUrl] = Date.now();
        }

        const respondedCount = Object.keys(relayEoseTimes).length;
        console.log("[gupt-relay-queryMany] EOSE from relay", {
          relay: relayUrl?.slice(0, 30),
          eoseCount,
          respondedCount,
          totalUrls,
          collectedSoFar: collected.length,
        });

        if (respondedCount >= totalUrls) {
          finish("all relays responded");
        }
      },
    });

    timer = setTimeout(() => {
      finish("TIMEOUT");
    }, maxWait);
  });
}

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

export async function subscribe(relays, filters, observer, maxWait = SUBSCRIBE_EOSE_MS) {
  const resolvedRelays = relays?.length ? relays : await readRelays();
  const connected = await ensureConnectedRelays(resolvedRelays);
  const filtersArray = toFiltersArray(filters);

  console.log("[gupt-relay-sub] subscribe", {
    relayCount: connected.length,
    filterCount: filtersArray.length,
    since: filtersArray[0]?.since,
  });

  const requests = [];
  for (const url of connected) {
    for (const filter of filtersArray) {
      requests.push({ url, filter });
    }
  }

  let closedByClient = false;
  let eventCount = 0;
  const sub = pool.subscribeMap(requests, {
    maxWait,
    onevent(event) {
      eventCount++;
      console.log("[gupt-relay-sub] event", {
        eventId: event.id?.slice(0, 12),
        kind: event.kind,
        pubkey: event.pubkey?.slice(0, 8),
      });
      observer?.next?.(event);
    },
    onclose(reasons) {
      console.log("[gupt-relay-sub] closed", { reasons, eventCount });
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
