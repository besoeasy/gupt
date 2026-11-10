import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent } from "./crypto.js";

import { getExpiryTimestampSec } from "@/config/retention";
import { normalizeNostrPubkey } from "./crypto";
import { encryptDm, decryptDm, dmRoomId } from "./crypto";
import { GROUP_COLLECTION } from "./groupIdentity.js";
import {
  getRawEventsByOrigin,
  getStoredProfile,
  listRoomEventsBefore,
  putRawEvent,
  putStoredProfile,
} from "./idb";
import { uploadFile } from "./upload";
import { debugLog } from "./debugLog";
import { publishLocal } from "./engine/index.js";

import {
  ensureConnectedRelays,
  subscribe as relaySubscribe,
  publish as relayPublish,
  readRelays,
  CONNECT_TIMEOUT_MS,
} from "./relay";
const DM_KIND = 4;
const EPHEMERAL_DM_KIND = 20004;
export const DM_TAG = "gupt-dm";
export const GROUP_MSG_TAG = "gupt:group-msg";

function signedEvent(privkeyHex, template) {
  return finalizeEvent(template, hexToBytes(privkeyHex));
}

function expiryTag() {
  return ["expiration", String(getExpiryTimestampSec())];
}

function profileFromEvent(event) {
  try {
    const parsed =
      typeof event?.data === "object" && event.data !== null && !event.data.ciphertext
        ? event.data
        : JSON.parse(event?.content || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      about: typeof parsed.about === "string" ? parsed.about : "",
      website: typeof parsed.website === "string" ? parsed.website : "",
      status: typeof parsed.status === "string" ? parsed.status : "",
    };
  } catch {
    return null;
  }
}

/** Read only engine-owned profile events (never the public profile cache). */
async function readEngineProfile(pubkeyHex) {
  const pubkey = normalizeNostrPubkey(pubkeyHex);
  if (!pubkey) return null;
  const rows = await getRawEventsByOrigin("profile").catch(() => []);
  let latest = null;
  for (const row of rows) {
    const event = row?.event;
    if (normalizeNostrPubkey(event?.pubkey) !== pubkey) continue;
    if (!latest || Number(event.created_at || 0) > Number(latest.created_at || 0)) {
      latest = event;
    }
  }
  return latest ? profileFromEvent(latest) : null;
}

async function readLocalProfile(pubkeyHex) {
  const engineProfile = await readEngineProfile(pubkeyHex);
  if (engineProfile) return engineProfile;
  const pubkey = normalizeNostrPubkey(pubkeyHex);
  if (!pubkey) return null;
  return getStoredProfile(pubkey).catch(() => null);
}

async function parseDirectEvents(events, privkeyHex, selfPubkey, resolveCounterparty) {
  const parsed = [];
  let skippedNoCounterparty = 0;
  let skippedDecryptFail = 0;

  for (const event of events) {
    try {
      // v2 group events have their own parser and decryption layout.
      if (String(event.collection || "") === GROUP_COLLECTION) continue;

      const eventTag = event.tags?.find((t) => t[0] === "t")?.[1];
      // Relays keep labels but not tags, so a pulled group DM only carries
      // `gupt:group-msg` in labels. The decrypted payload's groupId is the
      // final fallback.
      const labels = Array.isArray(event.labels) ? event.labels : [];
      let isGroupDm = eventTag === GROUP_MSG_TAG || labels.includes(GROUP_MSG_TAG);

      const isEphemeral =
        event.collection === "gupt/calls/signal" || event.kind === EPHEMERAL_DM_KIND;

      const counterparty = resolveCounterparty(event);
      if (!counterparty) {
        skippedNoCounterparty++;
        continue;
      }

      const plaintext = await decryptDm(privkeyHex, counterparty, event.data || event.content);
      const payload = JSON.parse(plaintext);
      if (payload?.groupId) isGroupDm = true;

      const roomId = await dmRoomId(selfPubkey, counterparty);
      const isStandardDm =
        !eventTag || eventTag === DM_TAG || eventTag === "gupt-dm" || eventTag === "gupt/chat/dm";
      if (!isEphemeral && !isGroupDm && isStandardDm) {
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
  debugLog(
    `parse: ${events.length} events -> ${parsed.length} rows (noCounterparty=${skippedNoCounterparty} decryptFail=${skippedDecryptFail})`,
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
  const candidateRelays = await readRelays();
  await ensureConnectedRelays(candidateRelays).catch(() => {});
}

// ---------------------------------------------------------------------------
// DM API
// ---------------------------------------------------------------------------

async function parseStoredDmRows(rows, privkeyHex, selfPubkey) {
  const events = [];
  const peerByEvent = new Map();
  for (const row of rows) {
    if (!row?.event) continue;
    const counterparty = normalizeNostrPubkey(
      row.peerPubkey || (row.event.pubkey === selfPubkey ? "" : row.event.pubkey),
    );
    if (!counterparty) continue;
    events.push(row.event);
    peerByEvent.set(row.event.id, counterparty);
  }
  if (!events.length) return [];
  const parsed = await parseDirectEvents(
    events,
    privkeyHex,
    selfPubkey,
    (event) => peerByEvent.get(event.id) || null,
  );
  return parsed.map((row) => ({
    ...row,
    peerPubkey: peerByEvent.get(row.id) || null,
    origin: "dm",
  }));
}

export const api = {
  async parseStoredDmRows(rows, identity) {
    const selfPubkey = normalizeNostrPubkey(identity?.pubkeyHex);
    if (!selfPubkey || !identity?.privkeyHex) return [];
    return parseStoredDmRows(rows, identity.privkeyHex, selfPubkey);
  },

  async listDirectPeers(myPubkey) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) throw new Error("Invalid local pubkey");

    const rows = await getRawEventsByOrigin("dm").catch(() => []);
    const peers = new Set();
    const sentToPeers = new Set();
    for (const row of rows) {
      const peer = normalizeNostrPubkey(row?.peerPubkey);
      if (!peer || peer === selfPubkey) continue;
      peers.add(peer);
      if (normalizeNostrPubkey(row?.pubkey) === selfPubkey) sentToPeers.add(peer);
    }
    return { peers: [...peers], sentToPeers };
  },

  async prepareDirectMessage(privkeyHex, recipientPubkey, payload, options = {}) {
    const peerPubkey = normalizeNostrPubkey(recipientPubkey);
    if (!peerPubkey) throw new Error("Enter a valid public key");

    const encrypted = await encryptDm(privkeyHex, peerPubkey, JSON.stringify(payload));
    const isCall = payload?.type?.startsWith("call-");
    const collection = isCall ? "gupt/calls/signal" : "gupt/chat/dm";
    const isEphemeral = isCall;
    const kind = isCall ? EPHEMERAL_DM_KIND : DM_KIND;

    const tTag = options.tTag || DM_TAG;

    const blobs = [];
    if (payload?.media) {
      if (Array.isArray(payload.media)) {
        for (const m of payload.media) {
          const h = m?.hash || m?.cid;
          if (typeof h === "string" && h.trim()) blobs.push(h.trim().toLowerCase());
        }
      } else {
        const h = payload.media.hash || payload.media.cid;
        if (typeof h === "string" && h.trim()) blobs.push(h.trim().toLowerCase());
      }
    }

    const labels = [tTag, peerPubkey];
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = isEphemeral ? now + 24 * 60 * 60 : getExpiryTimestampSec();

    const event = signedEvent(privkeyHex, {
      collection,
      blobs,
      labels,
      data: {
        v: 1,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
      },
      created_at: now,
      expires_at: expiresAt,
      kind,
      tags: [
        ["p", peerPubkey],
        ["t", tTag],
        isEphemeral ? ["expiration", String(now + 24 * 60 * 60)] : expiryTag(),
      ],
    });

    return {
      id: event.id,
      event,
      publish: () => publishEvent(event),
    };
  },

  async postDirectMessage(privkeyHex, recipientPubkey, payload) {
    const { id, publish } = await this.prepareDirectMessage(privkeyHex, recipientPubkey, payload);
    await publish();
    return { ok: true, id };
  },

  async getOlderDirectMessages(privkeyHex, myPubkey, peerPubkey, untilMs) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    const otherPubkey = normalizeNostrPubkey(peerPubkey);
    if (!selfPubkey || !otherPubkey) throw new Error("Invalid conversation pubkey");

    const roomId = await dmRoomId(selfPubkey, otherPubkey);
    const rows = await listRoomEventsBefore(roomId, untilMs, 100);
    return { messages: await parseStoredDmRows(rows, privkeyHex, selfPubkey) };
  },

  uploadFile,

  async getLocalProfile(pubkeyHex) {
    return readLocalProfile(pubkeyHex);
  },

  /** Engine-owned profile event for this account, if one is stored. */
  async getEngineProfile(pubkeyHex) {
    return readEngineProfile(pubkeyHex);
  },

  async publishProfile(privkeyHex, metadata) {
    const safe = {};
    if (typeof metadata.name === "string") safe.name = metadata.name.trim().slice(0, 100);
    if (typeof metadata.about === "string") safe.about = metadata.about.trim().slice(0, 500);
    if (typeof metadata.website === "string") safe.website = metadata.website.trim().slice(0, 500);
    if (typeof metadata.status === "string") safe.status = metadata.status.trim().slice(0, 150);
    const event = signedEvent(privkeyHex, {
      collection: "gupt/profiles",
      data: safe,
      blobs: [],
      created_at: Math.floor(Date.now() / 1000),
      kind: 0,
      tags: [],
      content: JSON.stringify(safe),
    });
    await publishLocal(event, { origin: "profile" });
    await putStoredProfile(event.pubkey, safe).catch(() => {});
    return { ok: true, id: event.id };
  },

  /** Live poll for ephemeral call signals. DM data belongs to the engine. */
  subscribeCallSignals(privkeyHex, myPubkey, observer) {
    const selfPubkey = normalizeNostrPubkey(myPubkey);
    if (!selfPubkey) throw new Error("Invalid local pubkey");

    return relaySubscribe(
      null,
      [{ collection: "gupt/calls/signal", labels: [selfPubkey], limit: 100 }],
      {
        async next(event) {
          debugLog(
            `live signal id=${event.id?.slice(0, 12)} kind=${event.kind} collection=${event.collection} pub=${String(event.pubkey).slice(0, 8)}`,
          );
          const taggedPeer = normalizeNostrPubkey(
            event.tags?.find((tag) => tag[0] === "p")?.[1] || event.recipientPubkey || "",
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
