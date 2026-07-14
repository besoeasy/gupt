import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent } from "./crypto.js";
import { pool } from "./wspool.js";

import { DEFAULT_RELAYS, normalizeRelayUrl, readConfiguredRelays } from "@/config/servers";
import { recordBanditOutcomes, selectRelays, flushBanditScores } from "./relayBandit.js";
import { getRetentionCutoffSec, getExpiryTimestampSec } from "@/config/retention";
import {
  RELAY_CONNECT_TIMEOUT_MS,
  RELAY_QUERY_TIMEOUT_MS,
  RELAY_PUBLISH_TIMEOUT_MS,
  RELAY_SUBSCRIBE_EOSE_MS,
} from "@/config/timeouts";
import { recordRelayOutcomes } from "./idb";
import { normalizeNostrPubkey } from "./crypto";
import { encryptDm, decryptDm } from "./crypto";
import { resolveMediaUrls, uploadFile } from "./upload";
const DM_KIND = 4;
const EPHEMERAL_DM_KIND = 20004;
const EPHEMERAL_TYPING_KIND = 21004;
const DM_TAG = "gupt-dm";

let knownRelays = dedupeRelays(readConfiguredRelays());
let activeRelays = [];

function normalizeRelay(relay) {
  return normalizeRelayUrl(relay);
}

function dedupeRelays(relays) {
  return [...new Set(relays.map(normalizeRelay).filter(Boolean))];
}

function setActiveRelays(relays) {
  activeRelays = dedupeRelays(relays);
}

function refreshKnownRelays(extraRelays = []) {
  knownRelays = dedupeRelays([...readConfiguredRelays(), ...extraRelays]);
}

async function connectRelay(relay) {
  const start = Date.now();
  try {
    await pool.ensureRelay(relay, { connectionTimeout: RELAY_CONNECT_TIMEOUT_MS });
    const outcome = { relay, ok: true, latencyMs: Date.now() - start };
    void recordRelayOutcomes("connect", [outcome]).catch(() => {});
    recordBanditOutcomes([outcome]);
    return relay;
  } catch (err) {
    const outcome = {
      relay,
      ok: false,
      latencyMs: Date.now() - start,
      error: formatRelayError(err),
    };
    void recordRelayOutcomes("connect", [outcome]).catch(() => {});
    recordBanditOutcomes([outcome]);
    throw err;
  }
}

async function publishToEachRelay(relays, event, maxWait = RELAY_PUBLISH_TIMEOUT_MS) {
  try {
    const result = await pool.publish(relays, event, { maxWait });
    const outcomes = result.urls.map((url) => ({ relay: url, ok: true, latencyMs: 0 }));
    void recordRelayOutcomes("publish", outcomes).catch(() => {});
    recordBanditOutcomes(outcomes);
    return outcomes;
  } catch (err) {
    const outcomes = relays.map((r) => ({ relay: r, ok: false, error: err.message }));
    void recordRelayOutcomes("publish", outcomes).catch(() => {});
    recordBanditOutcomes(outcomes);
    return outcomes;
  }
}

function buildRelayFailureFromOutcomes(prefix, outcomes) {
  const details = outcomes
    .filter((entry) => !entry.ok)
    .map((entry) => `${entry.relay}: ${entry.error || "failed"}`)
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

function formatRelayError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function buildRelayFailure(prefix, relays, results) {
  const details = results
    .map((result, index) => ({ result, relay: relays[index] }))
    .filter(({ result }) => result.status === "rejected")
    .map(({ relay, result }) => `${relay}: ${formatRelayError(result.reason)}`)
    .join(" | ");

  return new Error(details ? `${prefix} ${details}` : prefix);
}

async function ensureConnectedRelays(relays) {
  const normalized = dedupeRelays(relays);
  if (!normalized.length) {
    throw new Error("No relays configured. Add at least one relay.");
  }

  const results = await Promise.allSettled(normalized.map((relay) => connectRelay(relay)));
  const connected = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  if (connected.length) {
    setActiveRelays([...activeRelays, ...connected]);
    return connected;
  }

  throw buildRelayFailure("Could not connect to any relay.", normalized, results);
}

export async function queryNostrEvents(filter, maxWait = RELAY_QUERY_TIMEOUT_MS) {
  return queryEvents(filter, maxWait);
}

async function queryEvents(filter, maxWait = RELAY_QUERY_TIMEOUT_MS) {
  const relays = readRelays();
  if (!relays.length) throw new Error("No relays configured. Add at least one relay.");

  // Let SimplePool open subscriptions to ALL relays simultaneously — it handles
  // EOSE tracking, deduplication, and merging internally, which is far more
  // efficient than opening one subscription per relay.
  let events;
  try {
    events = await pool.querySync(relays, filter, { maxWait });
  } catch (err) {
    throw new Error(`Could not read from any relay. ${formatRelayError(err)}`);
  }

  // Mark all relays we just used as active (pool connected them on demand)
  setActiveRelays(dedupeRelays([...activeRelays, ...relays]));

  return events;
}

async function queryMany(filters, maxWait = RELAY_QUERY_TIMEOUT_MS) {
  if (!filters.length) return [];
  const relays = readRelays();
  if (!relays.length) throw new Error("No relays configured. Add at least one relay.");

  // subscribeMap groups {url, filter} entries by URL and calls
  // relay.subscribe([f1, f2, ...]) — one REQ per relay with all filters bundled.
  // subscribeMany takes a SINGLE filter (not an array); passing an array causes
  // the relay to receive [[f1,f2]] which it rejects as "filter is not an object".
  const requests = [];
  for (const url of relays) {
    for (const filter of filters) {
      requests.push({ url, filter });
    }
  }

  const events = await new Promise((resolve) => {
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

  setActiveRelays(dedupeRelays([...activeRelays, ...relays]));
  return events;
}

function readRelays() {
  // Use the bandit to pick the 5 best-performing + 2 random explore relays
  // from the full known pool. Falls back to the full default list if the
  // relay list is empty (should not happen in practice).
  const candidates = knownRelays.length ? [...knownRelays] : [...DEFAULT_RELAYS];
  return selectRelays(candidates);
}

function writeRelays() {
  return activeRelays.length ? [...activeRelays] : readRelays();
}

function signedEvent(privkeyHex, template) {
  return finalizeEvent(template, hexToBytes(privkeyHex));
}

/**
 * Returns a NIP-40 expiration tag for a freshly published event.
 * The expiry is set to now + RETENTION_DAYS so relays that support NIP-40
 * can prune the event automatically after the retention window.
 * Only attach this to ephemeral events (kind 4).
 */
function expiryTag() {
  return ["expiration", String(getExpiryTimestampSec())];
}

function toFiltersArray(filters) {
  return Array.isArray(filters) ? filters : [filters];
}

function buildDirectMessageFilters(selfPubkey, otherPubkey, sinceMs = 0) {
  const cutoff = getRetentionCutoffSec();
  const since = Math.max(
    cutoff,
    sinceMs ? Math.max(0, Math.floor((sinceMs - 1000) / 1000)) : cutoff,
  );

  return [
    {
      kinds: [DM_KIND, EPHEMERAL_DM_KIND, EPHEMERAL_TYPING_KIND],
      authors: [selfPubkey],
      "#p": [otherPubkey],
      since,
      limit: 200,
    },
    {
      kinds: [DM_KIND, EPHEMERAL_DM_KIND, EPHEMERAL_TYPING_KIND],
      authors: [otherPubkey],
      "#p": [selfPubkey],
      since,
      limit: 200,
    },
  ];
}

function buildDirectMessageFiltersUntil(selfPubkey, otherPubkey, untilMs) {
  const until = Math.floor(untilMs / 1000);
  const since = getRetentionCutoffSec();
  return [
    {
      kinds: [DM_KIND, EPHEMERAL_DM_KIND, EPHEMERAL_TYPING_KIND],
      authors: [selfPubkey],
      "#p": [otherPubkey],
      since,
      until,
      limit: 200,
    },
    {
      kinds: [DM_KIND, EPHEMERAL_DM_KIND, EPHEMERAL_TYPING_KIND],
      authors: [otherPubkey],
      "#p": [selfPubkey],
      since,
      until,
      limit: 200,
    },
  ];
}

async function parseDirectEvents(events, privkeyHex, selfPubkey, resolveCounterparty) {
  const parsed = [];

  for (const event of events) {
    try {
      const counterparty = resolveCounterparty(event);
      if (!counterparty) continue;

      const plaintext = await decryptDm(privkeyHex, counterparty, event.content);
      let payload;
      try {
        payload = JSON.parse(plaintext);
      } catch {
        payload = { type: "text", text: plaintext, ts: event.created_at * 1000 };
      }

      parsed.push({
        ...payload,
        id: event.id,
        sender: event.pubkey,
        mine: event.pubkey === selfPubkey,
        type: payload.type || "text",
        text: payload.text || payload.name || "",
        ts: payload.ts || event.created_at * 1000,
        media: payload.media || null,
        privkey: payload.privkey || undefined,
        created_at: event.created_at * 1000,
      });
    } catch {
      // Ignore messages that cannot be decrypted or parsed
    }
  }

  parsed.sort(
    (left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id),
  );
  return parsed;
}

async function publishEvent(event) {
  const relays = await ensureConnectedRelays(writeRelays());
  const outcomes = await publishToEachRelay(relays, event);
  const publishedRelays = outcomes.filter((entry) => entry.ok).map((entry) => entry.relay);

  if (!publishedRelays.length) {
    throw buildRelayFailureFromOutcomes("Could not publish to any relay.", outcomes);
  }

  setActiveRelays([...activeRelays, ...publishedRelays]);
  return event;
}

export async function initRelays(extraRelays = []) {
  const previousKnownRelays = [...knownRelays];
  refreshKnownRelays(extraRelays);
  const removedRelays = previousKnownRelays.filter((relay) => !knownRelays.includes(relay));
  if (removedRelays.length) {
    pool.close(removedRelays);
  }

  // Bandit selects the 5 best + 2 random explore relays to connect to.
  // We still keep the full knownRelays list so readRelays() can re-select
  // on every call — the bandit's selection rotates explore slots each time.
  const candidateRelays = selectRelays(knownRelays);
  const results = await Promise.allSettled(candidateRelays.map((relay) => connectRelay(relay)));
  setActiveRelays(
    results.filter((result) => result.status === "fulfilled").map((result) => result.value),
  );

  // Flush scores when the page is hidden (tab close, navigation, etc.)
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushBanditScores();
    }, { once: false, passive: true });
  }
}

export async function rememberRelayHint(relay) {
  const normalized = normalizeRelay(relay);
  if (!normalized) return null;
  refreshKnownRelays([normalized]);
  if (!activeRelays.includes(normalized)) {
    try {
      await connectRelay(normalized);
      setActiveRelays([...activeRelays, normalized]);
    } catch {
      // The relay may still be readable/writable later even if the initial probe fails.
    }
  }
  return normalized;
}

export function getKnownRelays() {
  refreshKnownRelays();
  return [...knownRelays];
}

export function isDefaultRelay(relay) {
  const normalized = normalizeRelay(relay);
  return normalized ? DEFAULT_RELAY_SET.has(normalized) : false;
}

export async function addRelay(relay) {
  const normalized = normalizeRelay(relay);
  if (!normalized) throw new Error("Enter a valid relay URL starting with ws:// or wss://");
  refreshKnownRelays([normalized]);
  try {
    await connectRelay(normalized);
    setActiveRelays([...activeRelays, normalized]);
  } catch {
    // Keep the relay saved even if it is temporarily offline.
  }
  return normalized;
}

export function removeRelay(relay) {
  const normalized = normalizeRelay(relay);
  if (!normalized) return;
  refreshKnownRelays();
  setActiveRelays(activeRelays.filter((entry) => entry !== normalized));
  pool.close([normalized]);
}

export function getActiveRelays() {
  return [...activeRelays];
}

export async function requestEventsFromRelays(relays, filters, maxWait = RELAY_QUERY_TIMEOUT_MS) {
  const normalizedRelays = await ensureConnectedRelays(relays?.length ? relays : readRelays());
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

  const queryOutcomes = outcomes.map(({ relay, ok, latencyMs, error }) => ({ relay, ok, latencyMs, error }));
  void recordRelayOutcomes("query", queryOutcomes).catch(() => {});
  recordBanditOutcomes(queryOutcomes);

  const successfulRelays = outcomes.filter((entry) => entry.ok).map((entry) => entry.relay);
  if (!successfulRelays.length) {
    throw buildRelayFailureFromOutcomes("Could not read from any relay.", outcomes);
  }

  setActiveRelays([...activeRelays, ...successfulRelays]);

  return mergeEvents(
    outcomes.map((entry) =>
      entry.ok
        ? { status: "fulfilled", value: entry.events }
        : { status: "rejected", reason: entry.error },
    ),
  );
}

export async function publishEventToRelays(relays, event, maxWait = RELAY_PUBLISH_TIMEOUT_MS) {
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

  const publishedRelays = outcomes.filter((entry) => entry.ok).map((entry) => entry.relay);
  if (!publishedRelays.length) {
    throw buildRelayFailureFromOutcomes("Could not publish to any relay.", outcomes);
  }

  setActiveRelays([...activeRelays, ...publishedRelays]);

  return response;
}

export function subscribeToRelays(relays, filters, observer, maxWait = RELAY_SUBSCRIBE_EOSE_MS) {
  const normalizedRelays = dedupeRelays(relays?.length ? relays : readRelays());
  const filtersArray = toFiltersArray(filters);

  // SimplePool.subscribeMany in nostr-tools v2 takes a SINGLE filter per call
  // (it wraps it into a per-URL array internally). Passing an array of filters
  // causes it to be nested as [[f1,f2]] which relays reject as "filter is not
  // an object". Use subscribeMap directly so each relay gets all filters correctly.
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
      // Intentional unsubscribe — suppress error and complete silently.
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

export const api = {
  async listDirectPeers(myPubkey) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) throw new Error("Invalid local pubkey");

    const since = getRetentionCutoffSec();
    const events = await queryMany(
      [
        { kinds: [DM_KIND], authors: [selfPubkey], since, limit: 200 },
        { kinds: [DM_KIND], "#p": [selfPubkey], since, limit: 200 },
      ],
      2500,
    );

    const peers = new Set();
    const sentToPeers = new Set();
    for (const event of events) {
      const tagPeer = event.tags.find((tag) => tag[0] === "p")?.[1] ?? null;
      if (event.pubkey === selfPubkey && tagPeer) {
        peers.add(tagPeer);
        sentToPeers.add(tagPeer);
      }
      if (tagPeer === selfPubkey) peers.add(event.pubkey);
    }

    return { peers: [...peers], sentToPeers };
  },

  async prepareDirectMessage(privkeyHex, recipientPubkey, payload) {
    const peerPubkey = normalizeNostrPubkey(recipientPubkey);
    if (!peerPubkey) throw new Error("Enter a valid Nostr public key");

    const content = await encryptDm(privkeyHex, peerPubkey, JSON.stringify(payload));
    const isWebrtcEphemeral = payload?.type?.startsWith("webrtc-");
    const isTyping = payload?.type === "typing";
    const kind = isWebrtcEphemeral ? EPHEMERAL_DM_KIND : isTyping ? EPHEMERAL_TYPING_KIND : DM_KIND;
    const isEphemeral = isWebrtcEphemeral || isTyping;
    const event = signedEvent(privkeyHex, {
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", peerPubkey],
        ["t", DM_TAG],
        ...(isEphemeral ? [] : [expiryTag()]), // NIP-40: relay may prune after RETENTION_DAYS
      ],
      content,
    });

    return { id: event.id, publish: () => publishEvent(event) };
  },

  async postDirectMessage(privkeyHex, recipientPubkey, payload) {
    const { id, publish } = await this.prepareDirectMessage(privkeyHex, recipientPubkey, payload);
    await publish();
    return { ok: true, id };
  },

  async getDirectMessages(privkeyHex, myPubkey, peerPubkey, sinceMs = 0) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    const otherPubkey = normalizeNostrPubkey(peerPubkey);
    if (!selfPubkey || !otherPubkey) throw new Error("Invalid conversation pubkey");

    const events = await queryMany(
      buildDirectMessageFilters(selfPubkey, otherPubkey, sinceMs),
      RELAY_QUERY_TIMEOUT_MS,
    );

    return {
      messages: await parseDirectEvents(events, privkeyHex, selfPubkey, (event) =>
        event.pubkey === selfPubkey ? otherPubkey : event.pubkey,
      ),
    };
  },

  async getOlderDirectMessages(privkeyHex, myPubkey, peerPubkey, untilMs) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    const otherPubkey = normalizeNostrPubkey(peerPubkey);
    if (!selfPubkey || !otherPubkey) throw new Error("Invalid conversation pubkey");

    const events = await queryMany(
      buildDirectMessageFiltersUntil(selfPubkey, otherPubkey, untilMs),
      RELAY_QUERY_TIMEOUT_MS,
    );

    return {
      messages: await parseDirectEvents(events, privkeyHex, selfPubkey, (event) =>
        event.pubkey === selfPubkey ? otherPubkey : event.pubkey,
      ),
    };
  },

  async getIncomingDirectMessages(privkeyHex, myPubkey, sinceMs = 0) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) throw new Error("Invalid local pubkey");

    const cutoff = getRetentionCutoffSec();
    const since = Math.max(
      cutoff,
      sinceMs ? Math.max(0, Math.floor((sinceMs - 1000) / 1000)) : cutoff,
    );
    const events = await queryMany(
      [{ kinds: [DM_KIND], "#p": [selfPubkey], since, limit: 200 }],
      RELAY_QUERY_TIMEOUT_MS,
    );

    return {
      messages: await parseDirectEvents(events, privkeyHex, selfPubkey, (event) => event.pubkey),
    };
  },

  async getOlderIncomingDirectMessages(privkeyHex, myPubkey, untilMs) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) throw new Error("Invalid local pubkey");

    const until = Math.floor(untilMs / 1000);
    const since = getRetentionCutoffSec();
    const events = await queryMany(
      [{ kinds: [DM_KIND], "#p": [selfPubkey], since, until, limit: 200 }],
      RELAY_QUERY_TIMEOUT_MS,
    );

    return {
      messages: await parseDirectEvents(events, privkeyHex, selfPubkey, (event) => event.pubkey),
    };
  },

  uploadFile,

  resolveMediaUrls,

  subscribeDirectMessages(privkeyHex, myPubkey, peerPubkey, observer, sinceMs = Date.now()) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    const otherPubkey = normalizeNostrPubkey(peerPubkey);
    if (!selfPubkey || !otherPubkey) throw new Error("Invalid conversation pubkey");

    return subscribeToRelays(null, buildDirectMessageFilters(selfPubkey, otherPubkey, sinceMs), {
      async next(event) {
        const rows = await parseDirectEvents([event], privkeyHex, selfPubkey, (entry) =>
          entry.pubkey === selfPubkey ? otherPubkey : entry.pubkey,
        );
        for (const row of rows) {
          observer?.next?.(row);
        }
      },
      error(error) {
        observer?.error?.(error);
      },
      complete() {
        observer?.complete?.();
      },
    });
  },

  async fetchProfile(pubkeyHex) {
    const normalizedPubkey = normalizeNostrPubkey(pubkeyHex);
    if (!normalizedPubkey) return null;
    const events = await queryEvents(
      { kinds: [0], authors: [normalizedPubkey], limit: 5 },
      2000,
    ).catch(() => []);
    if (!events.length) return null;
    const latest = events.reduce((best, e) => (e.created_at > best.created_at ? e : best));
    try {
      return JSON.parse(latest.content);
    } catch {
      return null;
    }
  },

  async publishProfile(privkeyHex, metadata) {
    const safe = {};
    if (typeof metadata.name === "string") safe.name = metadata.name.trim().slice(0, 100);
    if (typeof metadata.about === "string") safe.about = metadata.about.trim().slice(0, 500);
    if (typeof metadata.picture === "string") safe.picture = metadata.picture.trim().slice(0, 2000);
    if (typeof metadata.website === "string") safe.website = metadata.website.trim().slice(0, 500);
    if (typeof metadata.status === "string") safe.status = metadata.status.trim().slice(0, 150);
    const event = signedEvent(privkeyHex, {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(safe),
    });
    await publishEvent(event);
    return { ok: true, id: event.id };
  },

  async fetchProfiles(pubkeys) {
    const normalized = [...new Set((pubkeys || []).map(normalizeNostrPubkey).filter(Boolean))];
    if (!normalized.length) return {};
    const events = await queryEvents(
      { kinds: [0], authors: normalized, limit: normalized.length * 5 },
      2500,
    ).catch(() => []);
    const latest = {};
    for (const event of events) {
      if (!latest[event.pubkey] || event.created_at > latest[event.pubkey].created_at) {
        latest[event.pubkey] = event;
      }
    }
    const result = {};
    for (const [pk, event] of Object.entries(latest)) {
      try {
        const parsed = JSON.parse(event.content);
        result[pk] = {
          name: typeof parsed?.name === "string" ? parsed.name : "",
          about: typeof parsed?.about === "string" ? parsed.about : "",
          picture: typeof parsed?.picture === "string" ? parsed.picture : "",
          website: typeof parsed?.website === "string" ? parsed.website : "",
          status: typeof parsed?.status === "string" ? parsed.status : "",
        };
      } catch {}
    }
    return result;
  },

  subscribeAllDirectMessages(privkeyHex, myPubkey, observer, sinceMs = Date.now()) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) throw new Error("Invalid local pubkey");

    const since = Math.max(0, Number(sinceMs || 0));

    return subscribeToRelays(
      null,
      [
        {
          kinds: [DM_KIND, EPHEMERAL_DM_KIND, EPHEMERAL_TYPING_KIND],
          authors: [selfPubkey],
          ...(since ? { since: Math.floor((since - 1000) / 1000) } : {}),
          limit: 200,
        },
        {
          kinds: [DM_KIND, EPHEMERAL_DM_KIND, EPHEMERAL_TYPING_KIND],
          "#p": [selfPubkey],
          ...(since ? { since: Math.floor((since - 1000) / 1000) } : {}),
          limit: 200,
        },
      ],
      {
        async next(event) {
          const taggedPeer = normalizeNostrPubkey(
            event.tags.find((tag) => tag[0] === "p")?.[1] || "",
          );
          const counterparty = event.pubkey === selfPubkey ? taggedPeer : event.pubkey;
          if (!counterparty) return;

          const rows = await parseDirectEvents([event], privkeyHex, selfPubkey, () => counterparty);
          for (const row of rows) {
            observer?.next?.({
              ...row,
              peerPubkey: counterparty,
            });
          }
        },
        error(error) {
          observer?.error?.(error);
        },
        complete() {
          observer?.complete?.();
        },
      },
    );
  },
};
