import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent } from "./crypto.js";

import { getRetentionCutoffSec, getExpiryTimestampSec } from "@/config/retention";
import { getPeerRelayHints } from "./idb";
import { normalizeNostrPubkey } from "./crypto";
import { encryptDm, decryptDm, dmRoomId } from "./crypto";
import { putRawEvent, seedDefaultRelayScores } from "./idb";
import { resolveMediaUrls, uploadFile } from "./upload";

import {
  pool,
  query as relayQuery,
  queryMany as relayQueryMany,
  subscribe as relaySubscribe,
  publish as relayPublish,
  readRelays,
  pickRelayHint,
  QUERY_TIMEOUT_MS,
  CONNECT_TIMEOUT_MS,
  storePeerRelayHint as _storePeerRelayHint,
  addHintRelay,
  startNetworkDiscoveryLoop,
} from "./relay";
import { DEFAULT_RELAYS } from "@/config/servers";

const DM_KIND = 4;
const EPHEMERAL_DM_KIND = 20004;
const EPHEMERAL_TYPING_KIND = 21004;
export const DM_TAG = "gupt-dm";
export const GROUP_MSG_TAG = "gupt:group-msg";
export const GROUP_ROSTER_TAG = "gupt:group-roster";

function signedEvent(privkeyHex, template) {
  return finalizeEvent(template, hexToBytes(privkeyHex));
}

function expiryTag() {
  return ["expiration", String(getExpiryTimestampSec())];
}

const HINT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

async function resolvePeerHintUrls(peerPubkey) {
  if (!peerPubkey) return [];
  const peerHints = await getPeerRelayHints(peerPubkey).catch(() => null);
  return (peerHints?.hints || [])
    .filter((h) => Date.now() - (h.lastSeenAt || 0) < HINT_MAX_AGE_MS)
    .map((h) => h.url);
}

function buildDirectMessageFilters(selfPubkey, otherPubkey, sinceMs = 0) {
  const cutoff = getRetentionCutoffSec();
  const since = Math.max(
    cutoff,
    sinceMs ? Math.max(0, Math.floor((sinceMs - 1000) / 1000)) : cutoff,
  );

  return [
    {
      kinds: [DM_KIND, EPHEMERAL_DM_KIND],
      authors: [selfPubkey],
      "#p": [otherPubkey],
      since,
      limit: 200,
    },
    {
      kinds: [DM_KIND, EPHEMERAL_DM_KIND],
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
      kinds: [DM_KIND, EPHEMERAL_DM_KIND],
      authors: [selfPubkey],
      "#p": [otherPubkey],
      since,
      until,
      limit: 200,
    },
    {
      kinds: [DM_KIND, EPHEMERAL_DM_KIND],
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
  let skippedNoCounterparty = 0;
  let skippedDecryptFail = 0;

  for (const event of events) {
    try {
      const eventTag = event.tags.find((t) => t[0] === "t")?.[1];
      const isGroupDm = eventTag === GROUP_MSG_TAG || eventTag === GROUP_ROSTER_TAG;

      const isEphemeral = event.kind === EPHEMERAL_DM_KIND || event.kind === EPHEMERAL_TYPING_KIND;

      const counterparty = resolveCounterparty(event);
      if (!counterparty) {
        skippedNoCounterparty++;
        continue;
      }

      const pTag = event.tags.find((t) => t[0] === "p");
      const relayHint = pTag?.[2] || null;

      const plaintext = await decryptDm(privkeyHex, counterparty, event.content);
      const payload = JSON.parse(plaintext);

      const roomId = await dmRoomId(selfPubkey, counterparty);
      const isTyping = payload?.type === "typing";
      if (!isTyping && !isEphemeral && !isGroupDm) {
        void putRawEvent(event, "dm", {
          peerPubkey: counterparty,
          roomId,
          type: payload.type,
        }).catch(() => {});
      }

      parsed.push({
        ...payload,
        id: event.id,
        sender: event.pubkey,
        mine: event.pubkey === selfPubkey,
        type: payload.type,
        text: payload.text ?? "",
        ts: payload.ts,
        media: payload.media ?? null,
        created_at: event.created_at * 1000,
        relayHint,
        _event: event,
        isGroup: isGroupDm,
      });
    } catch (err) {
      skippedDecryptFail++;
    }
  }

  parsed.sort(
    (left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id),
  );
  return parsed;
}

async function publishEvent(event, peerPubkey = null) {
  return relayPublish(event, peerPubkey);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function initRelays() {
  void seedDefaultRelayScores([...DEFAULT_RELAYS]);
  startNetworkDiscoveryLoop();

  const candidateRelays = await readRelays();
  await Promise.allSettled(
    candidateRelays.map(async (relay) => {
      await pool.ensureRelay(relay, { connectionTimeout: CONNECT_TIMEOUT_MS });
    }),
  );
}

// ---------------------------------------------------------------------------
// DM API
// ---------------------------------------------------------------------------

export const api = {
  async listDirectPeers(myPubkey) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) throw new Error("Invalid local pubkey");

    const since = getRetentionCutoffSec();
    let currentUntil = Math.floor(Date.now() / 1000);
    const peers = new Set();
    const sentToPeers = new Set();

    let hasMore = true;
    let iterations = 0;

    // Loop until we reach the 100 day cutoff or run out of events
    while (hasMore && iterations < 20) {
      iterations++;
      const events = await relayQueryMany(
        [
          { kinds: [DM_KIND], authors: [selfPubkey], since, until: currentUntil, limit: 500 },
          { kinds: [DM_KIND], "#p": [selfPubkey], since, until: currentUntil, limit: 500 },
        ],
        3000,
      );

      if (!events.length) break;

      let oldestTs = currentUntil;

      for (const event of events) {
        if (event.created_at < oldestTs) {
          oldestTs = event.created_at;
        }

        const eTag = event.tags.find((t) => t[0] === "t")?.[1];
        if (eTag === GROUP_MSG_TAG || eTag === GROUP_ROSTER_TAG) continue;

        const tagPeer = event.tags.find((tag) => tag[0] === "p")?.[1] ?? null;
        if (event.pubkey === selfPubkey && tagPeer) {
          peers.add(tagPeer);
          sentToPeers.add(tagPeer);
        }
        if (tagPeer === selfPubkey) peers.add(event.pubkey);
      }

      // If we got fewer than 500 events in total, neither filter could have hit its 500 limit,
      // which means we have fetched all remaining history.
      if (events.length < 500) {
        hasMore = false;
      } else {
        // Step backwards to just before the oldest event in this batch
        currentUntil = oldestTs > 0 ? oldestTs - 1 : 0;
        if (currentUntil <= since) hasMore = false;
      }
    }

    return { peers: [...peers], sentToPeers };
  },

  async prepareDirectMessage(privkeyHex, recipientPubkey, payload, options = {}) {
    const peerPubkey = normalizeNostrPubkey(recipientPubkey);
    if (!peerPubkey) throw new Error("Enter a valid Nostr public key");

    const content = await encryptDm(privkeyHex, peerPubkey, JSON.stringify(payload));
    const isTyping = payload?.type === "typing";
    const isCall = payload?.type?.startsWith("call-");
    const kind = isTyping ? EPHEMERAL_TYPING_KIND : isCall ? EPHEMERAL_DM_KIND : DM_KIND;
    const isEphemeral = isTyping || isCall;
    const myRelayHint = await pickRelayHint();

    const tTag = options.tTag || DM_TAG;

    const event = signedEvent(privkeyHex, {
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        myRelayHint ? ["p", peerPubkey, myRelayHint] : ["p", peerPubkey],
        ["t", tTag],
        ...(isEphemeral ? [] : [expiryTag()]),
      ],
      content,
    });

    return {
      id: event.id,
      event,
      publish: () => publishEvent(event, peerPubkey),
    };
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

    const peerHintRelays = await resolvePeerHintUrls(otherPubkey);

    const events = await relayQueryMany(
      buildDirectMessageFilters(selfPubkey, otherPubkey, sinceMs),
      QUERY_TIMEOUT_MS,
      peerHintRelays,
    );

    const result = {
      messages: await parseDirectEvents(events, privkeyHex, selfPubkey, (event) =>
        event.pubkey === selfPubkey ? otherPubkey : event.pubkey,
      ),
    };

    return result;
  },

  async getOlderDirectMessages(privkeyHex, myPubkey, peerPubkey, untilMs) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    const otherPubkey = normalizeNostrPubkey(peerPubkey);
    if (!selfPubkey || !otherPubkey) throw new Error("Invalid conversation pubkey");

    const peerHintRelays = await resolvePeerHintUrls(otherPubkey);

    const events = await relayQueryMany(
      buildDirectMessageFiltersUntil(selfPubkey, otherPubkey, untilMs),
      QUERY_TIMEOUT_MS,
      peerHintRelays,
    );

    return {
      messages: await parseDirectEvents(events, privkeyHex, selfPubkey, (event) =>
        event.pubkey === selfPubkey ? otherPubkey : event.pubkey,
      ),
    };
  },

  uploadFile,

  resolveMediaUrls,

  async fetchProfile(pubkeyHex) {
    const normalizedPubkey = normalizeNostrPubkey(pubkeyHex);
    if (!normalizedPubkey) return null;
    const events = await relayQuery(
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
    const events = await relayQuery(
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

    return relaySubscribe(
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
            if (row.relayHint && !row.mine) {
              addHintRelay(row.relayHint);
              void _storePeerRelayHint(counterparty, row.relayHint).catch(() => {});
            }
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
