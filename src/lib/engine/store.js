// Dexie-backed engine store. Works identically on the main thread and in the
// replication worker — Dexie supports concurrent connections.
import {
  getEngineBlob,
  getEngineCursor,
  getLatestRawEventCreatedAt,
  getOutboxSnapshot,
  getRawEventsByIds,
  getReplicationCandidates,
  hasEngineBlob,
  markEventsReplicated,
  putEngineBlob,
  putEngineCursor,
  putRawEvent,
  recordOutboxResult as recordRawOutboxResult,
  evictEngineBlobs,
} from "../idb.js";
import { dmRoomId, normalizeNostrPubkey } from "../crypto.js";
import { GROUP_COLLECTION, groupIdForMembers, parseGroupMembers } from "../groupIdentity.js";
import { verifyEvent } from "../rabta/index.js";
import {
  ENGINE_APP_COLLECTIONS,
  ENGINE_CHAT_COLLECTION,
  ENGINE_FAILED_AFTER_ATTEMPTS,
  ENGINE_ORIGINS,
} from "./core.js";

export { ENGINE_ORIGINS } from "./core.js";
const ENGINE_APPLIED_ORIGIN = "dm";
const GROUP_MSG_TAG = "gupt:group-msg";
const APP_ORIGIN_BY_COLLECTION = new Map(
  ENGINE_APP_COLLECTIONS.map(({ origin, collection }) => [collection, origin]),
);
// Engine pulls must stay inside the collections the store knows how to
// route; the umbrella glob spec can surface anything else we own (call
// signaling, misc defaults) and those rows would pollute the DM store.
const ENGINE_KNOWN_COLLECTIONS = new Set([
  ...APP_ORIGIN_BY_COLLECTION.keys(),
  ENGINE_CHAT_COLLECTION,
  GROUP_COLLECTION,
]);
const HEX_RE = /^[0-9a-f]{64}$/i;

function normalizeHex(value) {
  return normalizeNostrPubkey(
    String(value || "")
      .toLowerCase()
      .replace(/^ed25519:/, ""),
  );
}

function groupTagOf(event) {
  return event?.tags?.find((t) => t[0] === "t")?.[1] === GROUP_MSG_TAG;
}

function counterpartyOf(event, selfHex) {
  const owner = normalizeHex(event?.owner || event?.pubkey);
  if (owner && owner !== selfHex) return owner;
  const labels = Array.isArray(event?.labels) ? event.labels : [];
  return labels.map(normalizeHex).find((l) => l && l !== selfHex) || null;
}

// Relay responses drop tags and return pubkey as owner. App-level parsers still
// expect both, so rebuild them before storing an inbound app event.
function appEventShape(event) {
  const next = { ...event };
  if (!next.pubkey && next.owner) next.pubkey = normalizeHex(next.owner);
  if (!Array.isArray(next.tags)) {
    const tags = [];
    for (const label of Array.isArray(next.labels) ? next.labels : []) {
      if (HEX_RE.test(String(label))) tags.push(["p", String(label)]);
      else tags.push(["t", String(label)]);
    }
    if (next.expires_at) tags.push(["expiration", String(next.expires_at)]);
    next.tags = tags;
  }
  if (next.kind === undefined) {
    next.kind =
      next.collection === "gupt/profiles"
        ? 0
        : next.collection === ENGINE_CHAT_COLLECTION || next.collection === GROUP_COLLECTION
          ? 4
          : 1;
  }
  return next;
}

export function createEngineStore({ blobs, log = () => {}, selfHex = null } = {}) {
  const self = normalizeHex(selfHex);
  // Outbox = events we authored. Inbound events addressed to us also carry our
  // label; re-pushing those would turn every received message into relay work.
  const authoredBySelf = (row) => {
    if (!self) return true;
    const event = row?.event;
    if (!event) return false;
    return normalizeHex(event.owner || event.pubkey) === self;
  };

  return {
    async listUnsyncedEvents(limit = 25) {
      return getReplicationCandidates({
        limit,
        origins: ENGINE_ORIGINS,
        filter: authoredBySelf,
      });
    },

    async markEventsSynced(ids, ts) {
      await markEventsReplicated(ids, ts);
    },

    async recordOutboxResult(result) {
      return recordRawOutboxResult(result);
    },

    async getOutboxStatus({ failedAfter = ENGINE_FAILED_AFTER_ATTEMPTS } = {}) {
      return getOutboxSnapshot({
        origins: ENGINE_ORIGINS,
        filter: authoredBySelf,
        failedAfter,
      });
    },

    async hasEventIds(ids) {
      const rows = await getRawEventsByIds(ids);
      return new Set(rows.map((r) => r.id));
    },

    async getEventsByIds(ids) {
      return getRawEventsByIds(ids);
    },

    async putInboundEvent(event, selfHex) {
      if (!event?.id) return false;
      if (!selfHex) throw new Error("putInboundEvent requires self pubkey");
      if (!verifyEvent(event)) {
        log(`rejected invalid event ${String(event.id).slice(0, 12)}`);
        return false;
      }
      if (!ENGINE_KNOWN_COLLECTIONS.has(String(event.collection || ""))) return false;

      const owner = normalizeHex(event.owner || event.pubkey);
      const appOrigin = APP_ORIGIN_BY_COLLECTION.get(String(event.collection || ""));
      if (appOrigin) {
        if (owner !== normalizeHex(selfHex)) return false;
        await putRawEvent(appEventShape(event), appOrigin);
        return true;
      }

      if (String(event.collection || "") === GROUP_COLLECTION) {
        const members = parseGroupMembers(event.labels);
        if (!members || !members.includes(normalizeHex(selfHex))) return false;
        if (!members.includes(normalizeHex(owner))) return false;
        if (Number(event.data?.v) !== 2) return false;
        if (!Array.isArray(event.data?.copies) || event.data.copies.length !== members.length) {
          return false;
        }
        await putRawEvent(appEventShape(event), "group", {
          groupId: groupIdForMembers(members),
        });
        return true;
      }

      const isGroup = groupTagOf(event);
      const peer = counterpartyOf(event, selfHex);

      // A group fan-out copy aimed at another member is delivery-only; the
      // sender's self copy is the record and recipients pull their own copy.
      if (isGroup && owner === selfHex && peer && peer !== selfHex) {
        return false;
      }

      // Group ids live in the encrypted payload; the main thread upgrades the
      // denorm once it decrypts this row. Our own self copy must stay
      // addressable so a fresh device can rebuild group history.
      if (isGroup) {
        const groupPeer = peer || (owner === selfHex ? selfHex : null);
        if (!groupPeer) return false;
        await putRawEvent(event, ENGINE_APPLIED_ORIGIN, { peerPubkey: groupPeer, roomId: null });
        return true;
      }

      if (!peer) return false;
      const roomId = await dmRoomId(selfHex, peer).catch(() => null);
      await putRawEvent(appEventShape(event), ENGINE_APPLIED_ORIGIN, {
        peerPubkey: peer,
        roomId,
      });
      return true;
    },

    async getBlobBytes(hash) {
      // Blob adapter re-hashes local bytes, drops corrupt rows, and fetches a
      // verified copy from a relay when needed. Never return raw cache bytes.
      if (blobs?.getBlobBytesFromRelays) return blobs.getBlobBytesFromRelays(hash);
      return getEngineBlob(hash);
    },

    async hasLocalBlob(hash) {
      return hasEngineBlob(hash);
    },

    async putBlobBytes(hash, bytes, { expiresAt = null } = {}) {
      const stored = await putEngineBlob(hash, bytes, { expiresAt });
      void evictEngineBlobs().catch(() => {});
      return stored;
    },

    async getPullCursor(key) {
      return getEngineCursor(key);
    },

    async putPullCursor(key, cursor) {
      return putEngineCursor(key, cursor);
    },

    async getLatestCreatedAt(origin = null) {
      return getLatestRawEventCreatedAt({ origin });
    },
  };
}
