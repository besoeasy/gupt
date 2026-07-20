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
  dedupeRelays,
  normalizeRelay,
  QUERY_TIMEOUT_MS,
  CONNECT_TIMEOUT_MS,
  getKnownRelays,
  storePeerRelayHint as _storePeerRelayHint,
  addHintRelay,
} from "./relay";
import { DEFAULT_RELAYS } from "@/config/servers";

const DM_KIND = 4;
const EPHEMERAL_DM_KIND = 20004;
const EPHEMERAL_TYPING_KIND = 21004;
const DM_TAG = "gupt-dm";

function pickRandomRelay(relays) {
  if (!relays.length) return null;
  return relays[Math.floor(Math.random() * relays.length)];
}

function signedEvent(privkeyHex, template) {
  return finalizeEvent(template, hexToBytes(privkeyHex));
}

function expiryTag() {
  return ["expiration", String(getExpiryTimestampSec())];
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

  for (const event of events) {
    try {
      const counterparty = resolveCounterparty(event);
      if (!counterparty) continue;

      const pTag = event.tags.find((t) => t[0] === "p");
      const relayHint = pTag?.[2] || null;

      const plaintext = await decryptDm(privkeyHex, counterparty, event.content);
      const payload = JSON.parse(plaintext);

      const roomId = await dmRoomId(selfPubkey, counterparty);
      const isTyping = payload?.type === "typing";
      if (!isTyping) {
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

async function publishEvent(event, peerPubkey = null) {
  return relayPublish(event, peerPubkey);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function initRelays() {
  // Seed position-based scores for DEFAULT_RELAYS before connecting so the
  // relay selection algorithm starts with a meaningful ranking on fresh installs.
  void seedDefaultRelayScores([...DEFAULT_RELAYS]);

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
    const events = await relayQueryMany(
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
    const isTyping = payload?.type === "typing";
    const kind = isTyping ? EPHEMERAL_TYPING_KIND : DM_KIND;
    const isEphemeral = isTyping;
    const activeRelays = await readRelays();
    const myRelayHint = pickRandomRelay(activeRelays.slice(0, 3)) || null;

    const event = signedEvent(privkeyHex, {
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        myRelayHint ? ["p", peerPubkey, myRelayHint] : ["p", peerPubkey],
        ["t", DM_TAG],
        ...(isEphemeral ? [] : [expiryTag()]),
      ],
      content,
    });

    console.log("[gupt-api-prepare] DM prepared", {
      kind,
      relayHint: myRelayHint?.slice(0, 30),
      eventId: event.id?.slice(0, 12),
      relayCount: activeRelays.length,
    });

    return {
      id: event.id,
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

    const events = await relayQueryMany(
      buildDirectMessageFilters(selfPubkey, otherPubkey, sinceMs),
      QUERY_TIMEOUT_MS,
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

    const events = await relayQueryMany(
      buildDirectMessageFiltersUntil(selfPubkey, otherPubkey, untilMs),
      QUERY_TIMEOUT_MS,
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
    const events = await relayQueryMany(
      [{ kinds: [DM_KIND], "#p": [selfPubkey], since, limit: 200 }],
      QUERY_TIMEOUT_MS,
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
    const events = await relayQueryMany(
      [{ kinds: [DM_KIND], "#p": [selfPubkey], since, until, limit: 200 }],
      QUERY_TIMEOUT_MS,
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

    return relaySubscribe(null, buildDirectMessageFilters(selfPubkey, otherPubkey, sinceMs), {
      async next(event) {
        const rows = await parseDirectEvents([event], privkeyHex, selfPubkey, (entry) =>
          entry.pubkey === selfPubkey ? otherPubkey : entry.pubkey,
        );
        for (const row of rows) {
          if (row.relayHint && !row.mine) {
            addHintRelay(row.relayHint);
            void _storePeerRelayHint(otherPubkey, row.relayHint).catch(() => {});
          }
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
    console.log("[gupt-api-sub] subscribeAllDirectMessages", {
      self: selfPubkey?.slice(0, 8),
      since: since ? new Date(since).toISOString() : "none",
    });

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

          console.log("[gupt-api-sub] raw event received", {
            eventId: event.id?.slice(0, 12),
            eventPubkey: event.pubkey?.slice(0, 8),
            counterparty: counterparty?.slice(0, 8),
            isMine: event.pubkey === selfPubkey,
            kind: event.kind,
          });

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
          console.error("[gupt-api-sub] subscription error", { error: error?.message });
          observer?.error?.(error);
        },
        complete() {
          console.log("[gupt-api-sub] subscription complete/EOSE");
          observer?.complete?.();
        },
      },
    );
  },
};
