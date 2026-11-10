// Dexie-backed engine store. Works identically on the main thread and in the
// replication worker — Dexie supports concurrent connections.
import {
  getEngineBlob,
  getEngineCursor,
  getRawEventsByIds,
  getReplicationCandidates,
  hasEngineBlob,
  markEventsReplicated,
  putEngineBlob,
  putEngineCursor,
  putRawEvent,
  evictEngineBlobs,
} from "../idb.js";
import { dmRoomId, normalizeNostrPubkey } from "../crypto.js";
import { verifyEvent } from "../rabta/index.js";

export const ENGINE_ORIGINS = ["dm", "group"];
const ENGINE_APPLIED_ORIGIN = "dm";
const GROUP_MSG_TAG = "gupt:group-msg";

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

    async hasEventIds(ids) {
      const rows = await getRawEventsByIds(ids);
      return new Set(rows.map((r) => r.id));
    },

    async putInboundEvent(event, selfHex) {
      if (!event?.id) return false;
      if (!selfHex) throw new Error("putInboundEvent requires self pubkey");
      if (!verifyEvent(event)) {
        log(`rejected invalid event ${String(event.id).slice(0, 12)}`);
        return false;
      }

      const owner = normalizeHex(event.owner || event.pubkey);
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
      await putRawEvent(event, ENGINE_APPLIED_ORIGIN, {
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
  };
}
