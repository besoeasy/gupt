import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { decrypt, encrypt } from "nostr-tools/nip04";
import { wrapEvent, wrapManyEvents } from "nostr-tools/nip17";

import { DEFAULT_RELAYS, normalizeRelayUrl, readConfiguredRelays } from "@/config/servers";
import { getRetentionCutoffSec } from "@/config/retention";
import { normalizeNostrPubkey } from "./crypto";
import { resolveMediaUrls, uploadFile } from "./upload";

const DM_KIND = 4;
const DM_TAG = "gupt-dm";
const GIFT_WRAP_KIND = 1059;
// Kind 4096: custom unrestricted regular event for encrypted group messages.
// Avoids relay NIP-42 auth restrictions that apply to kind 4 / kind 44
// (encrypted DM kinds) — relays often deny reads to non-authors/non-#p-tagged.
const GROUP_EVENT_KIND = 4096;
// Parameterized replaceable kind used for group manifests.
// Each admin publishes one event per group (kind:35000:adminPubkey:groupId),
// tagged with all member pubkeys so members can discover their groups on any device.
const GROUP_MANIFEST_KIND = 35000;
const DEFAULT_RELAY_SET = new Set(DEFAULT_RELAYS);

const pool = new SimplePool({ enablePing: true, enableReconnect: true });

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
  await pool.ensureRelay(relay, { connectionTimeout: 2500 });
  return relay;
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function queryEvents(filter, maxWait = 2500) {
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

async function queryMany(filters, maxWait = 2500) {
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
  return knownRelays.length ? [...knownRelays] : [...DEFAULT_RELAYS];
}

function writeRelays() {
  return activeRelays.length ? [...activeRelays] : readRelays();
}

function signedEvent(privkeyHex, template) {
  return finalizeEvent(template, hexToBytes(privkeyHex));
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
    { kinds: [DM_KIND], authors: [selfPubkey], "#p": [otherPubkey], since, limit: 200 },
    { kinds: [DM_KIND], authors: [otherPubkey], "#p": [selfPubkey], since, limit: 200 },
  ];
}

function buildDirectMessageFiltersUntil(selfPubkey, otherPubkey, untilMs) {
  const until = Math.floor(untilMs / 1000);
  const since = getRetentionCutoffSec();
  return [
    { kinds: [DM_KIND], authors: [selfPubkey], "#p": [otherPubkey], since, until, limit: 200 },
    { kinds: [DM_KIND], authors: [otherPubkey], "#p": [selfPubkey], since, until, limit: 200 },
  ];
}

function parseDirectEvents(events, privkeyHex, selfPubkey, resolveCounterparty) {
  const parsed = [];

  for (const event of events) {
    try {
      const counterparty = resolveCounterparty(event);
      if (!counterparty) continue;

      const plaintext = decrypt(privkeyHex, counterparty, event.content);
      let payload;
      try {
        payload = JSON.parse(plaintext);
      } catch {
        payload = { type: "text", text: plaintext, ts: event.created_at * 1000 };
      }

      parsed.push({
        // Spread payload first so a peer-controlled JSON body cannot override
        // the canonical event fields below (id/sender/mine). Without this, a
        // payload with a `sender` key would render the bubble under a different
        // user's identity — making it look like another user's message landed
        // in the conversation.
        ...payload,
        id: event.id,
        sender: event.pubkey,
        mine: event.pubkey === selfPubkey,
        type: payload.type || "text",
        text: payload.text || payload.mediaName || payload.name || "",
        ts: payload.ts || event.created_at * 1000,
        created_at: event.created_at * 1000,
      });
    } catch {
      // Ignore undecryptable or malformed DM events.
    }
  }

  parsed.sort(
    (left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id),
  );
  return parsed;
}

async function publishEvent(event) {
  const relays = await ensureConnectedRelays(writeRelays());
  const results = await Promise.allSettled(pool.publish(relays, event, { maxWait: 4000 }));
  const publishedRelays = results
    .map((result, index) => ({ result, relay: relays[index] }))
    .filter(({ result }) => result.status === "fulfilled")
    .map(({ relay }) => relay);

  if (!publishedRelays.length) {
    throw buildRelayFailure("Could not publish to any relay.", relays, results);
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
  const results = await Promise.allSettled(knownRelays.map((relay) => connectRelay(relay)));
  setActiveRelays(
    results.filter((result) => result.status === "fulfilled").map((result) => result.value),
  );
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

export async function requestEventsFromRelays(relays, filters, maxWait = 2500) {
  const normalizedRelays = await ensureConnectedRelays(relays?.length ? relays : readRelays());
  const requests = toFiltersArray(filters);
  const settled = await Promise.allSettled(
    normalizedRelays.map(async (relay) => pool.querySync([relay], requests, { maxWait })),
  );

  const successfulRelays = settled
    .map((result, index) => ({ result, relay: normalizedRelays[index] }))
    .filter(({ result }) => result.status === "fulfilled")
    .map(({ relay }) => relay);

  if (!successfulRelays.length) {
    throw buildRelayFailure("Could not read from any relay.", normalizedRelays, settled);
  }

  setActiveRelays([...activeRelays, ...successfulRelays]);

  return mergeEvents(settled);
}

export async function publishEventToRelays(relays, event, maxWait = 4000) {
  const normalizedRelays = await ensureConnectedRelays(relays?.length ? relays : writeRelays());
  const settled = await Promise.allSettled(pool.publish(normalizedRelays, event, { maxWait }));
  const response = {};

  for (let index = 0; index < normalizedRelays.length; index += 1) {
    const relay = normalizedRelays[index];
    const result = settled[index];
    response[relay] =
      result.status === "fulfilled"
        ? { from: relay, ok: true, message: result.value }
        : { from: relay, ok: false, message: formatRelayError(result.reason) };
  }

  const publishedRelays = Object.values(response)
    .filter((entry) => entry.ok)
    .map((entry) => entry.from);

  if (!publishedRelays.length) {
    throw new Error(
      Object.values(response)
        .map((entry) => `${entry.from}: ${entry.message || (entry.ok ? "ok" : "failed")}`)
        .join(" | "),
    );
  }

  setActiveRelays([...activeRelays, ...publishedRelays]);

  return response;
}

export function subscribeToRelays(relays, filters, observer, maxWait = 2500) {
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

  prepareDirectMessage(privkeyHex, recipientPubkey, payload) {
    const peerPubkey = normalizeNostrPubkey(recipientPubkey);
    if (!peerPubkey) throw new Error("Enter a valid Nostr public key");

    const event = signedEvent(privkeyHex, {
      kind: DM_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", peerPubkey],
        ["t", DM_TAG],
      ],
      content: encrypt(privkeyHex, peerPubkey, JSON.stringify(payload)),
    });

    return { id: event.id, publish: () => publishEvent(event) };
  },

  async postDirectMessage(privkeyHex, recipientPubkey, payload) {
    const { id, publish } = this.prepareDirectMessage(privkeyHex, recipientPubkey, payload);
    await publish();
    return { ok: true, id };
  },

  async getDirectMessages(privkeyHex, myPubkey, peerPubkey, sinceMs = 0) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    const otherPubkey = normalizeNostrPubkey(peerPubkey);
    if (!selfPubkey || !otherPubkey) throw new Error("Invalid conversation pubkey");

    const events = await queryMany(
      buildDirectMessageFilters(selfPubkey, otherPubkey, sinceMs),
      2500,
    );

    return {
      messages: parseDirectEvents(events, privkeyHex, selfPubkey, (event) =>
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
      2500,
    );

    return {
      messages: parseDirectEvents(events, privkeyHex, selfPubkey, (event) =>
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
      2500,
    );

    return {
      messages: parseDirectEvents(events, privkeyHex, selfPubkey, (event) => event.pubkey),
    };
  },

  async getOlderIncomingDirectMessages(privkeyHex, myPubkey, untilMs) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) throw new Error("Invalid local pubkey");

    const until = Math.floor(untilMs / 1000);
    const since = getRetentionCutoffSec();
    const events = await queryMany(
      [{ kinds: [DM_KIND], "#p": [selfPubkey], since, until, limit: 200 }],
      2500,
    );

    return {
      messages: parseDirectEvents(events, privkeyHex, selfPubkey, (event) => event.pubkey),
    };
  },

  uploadFile,

  resolveMediaUrls,

  async publishPrivateEnvelopeBatch(
    privkeyHex,
    recipients,
    plaintext,
    subject = "gupt-private",
    relays = [],
    options = {},
  ) {
    const senderPrivkey = hexToBytes(privkeyHex);
    const senderPublicKey = getPublicKey(senderPrivkey);
    const includeSelf = options?.includeSelf !== false;
    const normalizedRecipients = [
      ...new Set(
        (Array.isArray(recipients) ? recipients : [])
          .map((recipient) =>
            normalizeNostrPubkey(recipient?.publicKey || recipient?.pubkey || recipient),
          )
          .filter((pubkey) => Boolean(pubkey) && pubkey !== senderPublicKey),
      ),
    ];

    const wrappedEvents = normalizedRecipients.length
      ? wrapManyEvents(
          senderPrivkey,
          normalizedRecipients.map((publicKey) => ({ publicKey })),
          plaintext,
          subject,
        )
      : includeSelf
        ? [wrapEvent(senderPrivkey, { publicKey: senderPublicKey }, plaintext, subject)]
        : [];

    const finalWrappedEvents =
      includeSelf || !normalizedRecipients.length
        ? wrappedEvents
        : wrappedEvents.filter(
            (event) => event.tags.find((tag) => tag[0] === "p")?.[1] !== senderPublicKey,
          );

    const targetRelays = dedupeRelays([...(Array.isArray(relays) ? relays : []), ...writeRelays()]);
    await Promise.all(finalWrappedEvents.map((event) => publishEventToRelays(targetRelays, event)));
    return finalWrappedEvents;
  },

  async queryPrivateInbox(myPubkey, { sinceMs = 0, untilMs = 0, limit = 500 } = {}) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) return [];

    const cutoff = getRetentionCutoffSec();
    const since = Math.max(
      cutoff,
      sinceMs ? Math.max(0, Math.floor((sinceMs - 1000) / 1000)) : cutoff,
    );
    const until = untilMs ? Math.floor(untilMs / 1000) : undefined;
    return queryEvents({
      kinds: [GIFT_WRAP_KIND],
      "#p": [selfPubkey],
      since,
      ...(until ? { until } : {}),
      limit,
    }).catch(() => []);
  },

  subscribePrivateInbox(myPubkey, observer, sinceMs = Date.now()) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) throw new Error("Invalid local pubkey");

    const cutoff = getRetentionCutoffSec();
    const requestedSince = Math.floor(Math.max(0, Number(sinceMs || 0) - 1000) / 1000);
    const since = Math.max(cutoff, requestedSince);
    return subscribeToRelays(
      null,
      {
        kinds: [GIFT_WRAP_KIND],
        "#p": [selfPubkey],
        since,
        limit: 500,
      },
      {
        next(event) {
          observer?.next?.(event);
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

  async publishGroupEvent(privkeyHex, groupId, encryptedContent) {
    const event = signedEvent(privkeyHex, {
      kind: GROUP_EVENT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["g", groupId]],
      content: encryptedContent,
    });
    await publishEvent(event);
    return { ok: true, id: event.id };
  },

  async publishGroupManifest(privkeyHex, groupId, members, encryptedSlots) {
    const pTags = members.map((pubkey) => ["p", pubkey]);
    const event = signedEvent(privkeyHex, {
      kind: GROUP_MANIFEST_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["d", groupId], ...pTags],
      content: JSON.stringify(encryptedSlots),
    });
    await publishEvent(event);
    return { ok: true, id: event.id };
  },

  async queryGroupManifests(myPubkey) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) return [];
    return queryEvents({ kinds: [GROUP_MANIFEST_KIND], "#p": [selfPubkey], limit: 500 }).catch(
      () => [],
    );
  },

  async queryGroupEvents(groupId, { sinceMs = 0, untilMs = 0 } = {}) {
    const since = sinceMs ? Math.max(0, Math.floor((sinceMs - 1000) / 1000)) : undefined;
    const until = untilMs ? Math.floor(untilMs / 1000) : undefined;
    return queryEvents({
      kinds: [GROUP_EVENT_KIND],
      "#g": [groupId],
      ...(since ? { since } : {}),
      ...(until ? { until } : {}),
      limit: 500,
    });
  },

  subscribeGroupEvents(groupId, observer, sinceMs = Date.now()) {
    const normalizedGroupId = String(groupId || "").trim();
    if (!normalizedGroupId) throw new Error("Invalid group id");

    const since = Math.max(0, Number(sinceMs || 0));

    return subscribeToRelays(
      null,
      {
        kinds: [GROUP_EVENT_KIND],
        "#g": [normalizedGroupId],
        ...(since ? { since: Math.floor((since - 1000) / 1000) } : {}),
        limit: 500,
      },
      {
        next(event) {
          observer?.next?.(event);
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

  subscribeDirectMessages(privkeyHex, myPubkey, peerPubkey, observer, sinceMs = Date.now()) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    const otherPubkey = normalizeNostrPubkey(peerPubkey);
    if (!selfPubkey || !otherPubkey) throw new Error("Invalid conversation pubkey");

    return subscribeToRelays(null, buildDirectMessageFilters(selfPubkey, otherPubkey, sinceMs), {
      next(event) {
        const rows = parseDirectEvents([event], privkeyHex, selfPubkey, (entry) =>
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
          kinds: [DM_KIND],
          authors: [selfPubkey],
          ...(since ? { since: Math.floor((since - 1000) / 1000) } : {}),
          limit: 200,
        },
        {
          kinds: [DM_KIND],
          "#p": [selfPubkey],
          ...(since ? { since: Math.floor((since - 1000) / 1000) } : {}),
          limit: 200,
        },
      ],
      {
        next(event) {
          const taggedPeer = normalizeNostrPubkey(
            event.tags.find((tag) => tag[0] === "p")?.[1] || "",
          );
          const counterparty = event.pubkey === selfPubkey ? taggedPeer : event.pubkey;
          if (!counterparty) return;

          const rows = parseDirectEvents([event], privkeyHex, selfPubkey, () => counterparty);
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
