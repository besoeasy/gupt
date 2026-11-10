// ===========================================================================
// Stateless groups — a group is just a tag on a kind-4 E2EE DM.
//
// There is no shared group key, no admin, no roster, no escrow. Every group
// event is an ordinary direct message fan-out to every member (and to
// yourself, so your own copy survives a wipe). Chat events carry a
// `t=gupt:group-msg` tag and a self-describing payload (name + members).
//
// The groupId hashes the SORTED member pubkeys together with the name:
//     groupId = sha256( normalizedName + ":" + sortedPubkeys.join(",") )
// Same name + same members is the same group. Recipients verify that hash
// on ingest; there is nothing extra to announce.
// ===========================================================================

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { decryptDm, normalizeNostrPubkey } from "./crypto.js";
import { api, GROUP_MSG_TAG } from "./api.js";
import { getKnownRelays } from "./relay";
import {
  getRawEventsByOrigin,
  getStoredGroup,
  listGroupEvents,
  listGroupEventsBefore,
  listStoredGroups,
  putRawEvent,
  putStoredGroup,
} from "./idb.js";
import { publishLocal } from "./engine/index.js";

function ensureArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeMembers(pubkeys) {
  return [
    ...new Set(
      ensureArray(pubkeys)
        .map(
          (p) =>
            normalizeNostrPubkey(p) ||
            String(p || "")
              .trim()
              .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ].sort();
}

/**
 * Deterministic group id: sha256(name:sortedPubkeys). The member list is
 * sorted (order-independent) and deduped.
 */
export function groupIdFor(name, pubkeys = []) {
  const sorted = normalizeMembers(pubkeys).join(",");
  const input = `${normalizeName(name)}:${sorted}`;
  return bytesToHex(sha256(new TextEncoder().encode(input)));
}

/**
 * Decrypt a group DM event. For inbound events the counterparty is the author;
 * for self-authored fan-out events it is the `p` tag (self-DMs included). ECDH
 * is symmetric, so both sides derive the same key.
 */
async function decryptDmEvent(privkeyHex, selfPubkey, event) {
  const pTag = event.tags?.find((t) => t[0] === "p")?.[1] || event.recipientPubkey;
  const counterparty = event.pubkey === selfPubkey ? pTag || selfPubkey : event.pubkey;
  return JSON.parse(await decryptDm(privkeyHex, counterparty, event.data || event.content));
}

/** Build the payload that is fanned out to every member plus yourself. */
function buildGroupMessagePayload(groupId, group, payload) {
  const lastReadTs = Number(payload.lastReadTs || 0);
  return {
    type: payload.type || "text",
    groupId,
    name: group.name || "",
    members: normalizeMembers(group.members),
    text: String(payload.text || ""),
    media: payload.media || null,
    replyTo: payload.replyTo,
    emoji: payload.emoji,
    ts: Date.now(),
    ...(payload.type === "read" && lastReadTs ? { lastReadTs } : {}),
  };
}

/**
 * Publish `payload` as a tagged kind-4 DM to every member plus yourself. Each
 * recipient gets their own copy, so a group message is just N private DMs.
 *
 * Every DM is prepared first (so all ids are known up front) and then
 * published. The returned `id`/`selfEvent` always come from the SELF DM: even
 * if its publish reports failure, the event may still have reached a relay and
 * be echoed, so `msg.id` must match that echo id or the UI would show two
 * copies of the same message (one persisted, one not — which a reload hides).
 *
 * Throws when NO relay accepted any copy, so callers that want delivery
 * guarantees (e.g. the send queue) can retry instead of reporting success.
 */
async function fanOut(identity, group, payload, tTag, selfPrepared = null) {
  const self = normalizeNostrPubkey(identity.pubkeyHex);
  const recipients = [
    ...new Set(
      [...ensureArray(group.members), identity.pubkeyHex]
        .map((pubkey) => normalizeNostrPubkey(pubkey) || pubkey)
        .filter(Boolean),
    ),
  ];
  const prepared = await Promise.all(
    recipients.map(async (pubkey) => {
      if (selfPrepared && pubkey === self) return { pubkey, prepared: selfPrepared };
      try {
        const p = await api.prepareDirectMessage(identity.privkeyHex, pubkey, payload, {
          tTag,
        });
        return { pubkey, prepared: p };
      } catch (err) {
        return { pubkey, prepared: null };
      }
    }),
  );
  const selfEntry = prepared.find((e) => e.pubkey === self && e.prepared);
  const results = [];
  for (const entry of prepared.filter((e) => e.prepared)) {
    const isSelf = entry.pubkey === self;
    try {
      // Local-first: every copy lands in Dexie; the worker fans them out to
      // relays. The self copy is the group history record.
      await publishLocal(entry.prepared.event, {
        origin: isSelf ? "group" : "dm",
        peerPubkey: entry.pubkey,
        groupId: isSelf ? group.groupId : null,
        roomId: null,
        type: payload.type || "text",
      });
      results.push({
        status: "fulfilled",
        value: { pubkey: entry.pubkey, id: entry.prepared.id, event: entry.prepared.event },
      });
    } catch (err) {
      results.push({ status: "rejected", reason: err });
    }
  }
  if (!results.some((r) => r.status === "fulfilled")) {
    const firstError = results.find((r) => r.status === "rejected")?.reason;
    throw firstError || new Error("Could not store group message");
  }
  return {
    id:
      selfEntry?.prepared?.id ||
      results.find((r) => r.status === "fulfilled")?.value?.id ||
      shortIdLike(),
    selfEvent: selfEntry?.prepared?.event || null,
    published: results.filter((r) => r.status === "fulfilled").length,
  };
}

function shortIdLike() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Fan-out copies we sent to OTHER members are delivery-only — our own
 * self→self DM is the record of a sent message. Skip these everywhere so a
 * group message never renders (or persists) once per member.
 */
function isSelfFanOutCopy(selfPubkey, event) {
  if (!event || event.pubkey !== selfPubkey) return false;
  const pTag = event.tags?.find((t) => t[0] === "p")?.[1];
  return Boolean(pTag && pTag !== selfPubkey);
}

/** Read locally stored kind-4 DMs; the engine owns relay history. */
async function collectLocalDmEvents() {
  const rows = await getRawEventsByOrigin("dm").catch(() => []);
  return rows
    .map((row) => row?.event)
    .filter(Boolean)
    .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0));
}

/** Decrypt group message rows stored in Dexie (ECDH against the sender). */
export async function decryptLocalGroupRows(privkeyHex, selfPubkey, rawRows) {
  if (!privkeyHex || !rawRows?.length) return [];
  const out = [];
  for (const row of rawRows) {
    try {
      if (isSelfFanOutCopy(selfPubkey, row.event)) continue;
      const payload = JSON.parse(
        await decryptDm(privkeyHex, row.pubkey, row.event.data || row.event.content),
      );
      out.push({
        ...payload,
        id: row.id,
        groupId: row.groupId,
        sender: row.event.pubkey,
        mine: row.event.pubkey === selfPubkey,
        type: row.type || payload.type || "text",
        text: payload.text ?? "",
        media: payload.media ?? null,
        ts: payload.ts ?? row.createdAt,
        created_at: row.createdAt,
      });
    } catch {}
  }
  return out;
}

export const groupsApi = {
  async prepareIdentity(identity) {
    return { pubkey: identity.pubkeyHex, relays: getKnownRelays() };
  },

  async listGroups(identity) {
    const groups = await listStoredGroups();
    return groups
      .filter((g) => !g.isRemoved)
      .sort((a, b) => Number(b.lastMessageTs || 0) - Number(a.lastMessageTs || 0));
  },

  /** Local-only. Invitees learn the group from the first chat message. */
  async createGroup(identity, { name, memberPubkeys = [] }) {
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    if (!self || !identity.privkeyHex) throw new Error("Identity not initialized");
    const normalizedName = normalizeName(name);
    if (!normalizedName) throw new Error("Enter a group name (letters and numbers).");

    const now = Date.now();
    const members = normalizeMembers([self, ...ensureArray(memberPubkeys)]);
    const groupId = groupIdFor(normalizedName, members);

    const groupRecord = {
      groupId,
      name: normalizedName,
      members,
      createdAt: now,
      updatedAt: now,
      lastMessageTs: now,
      isRemoved: false,
    };
    await putStoredGroup(groupRecord);
    return groupRecord;
  },

  /**
   * Upsert a group from a self-describing chat payload. Sender and self must
   * both be listed, and groupId must match the hash of name + members.
   */
  async applyGroupFromMessage(identity, row) {
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    const sender = normalizeNostrPubkey(row?.sender);
    const name = normalizeName(row?.name);
    const members = normalizeMembers(row?.members);
    const groupId = String(row?.groupId || "").trim();
    if (!self || !sender || !name || !groupId || members.length < 1) return null;
    if (!members.includes(self) || !members.includes(sender)) return null;
    if (groupId !== groupIdFor(name, members)) return null;

    const existing = await getStoredGroup(groupId).catch(() => null);
    const groupRecord = {
      groupId,
      name,
      members,
      createdAt: Number(existing?.createdAt || row?.ts || row?.createdAt || Date.now()),
      updatedAt: Date.now(),
      isRemoved: false,
    };
    await putStoredGroup(groupRecord);
    return groupRecord;
  },

  /** Store an inbound group message DM in Dexie (origin "group"). */
  async ingestGroupMessage(identity, row) {
    const groupId = String(row?.groupId || "").trim();
    const event = row?._event;
    if (!groupId || !event) return;
    void putRawEvent(event, "group", { groupId, type: row.type || "text" }).catch(() => {});
  },

  /**
   * Rebuild groups and message history from our own locally stored kind-4
   * DMs. The engine fills that table; this is a pure Dexie pass.
   */
  async syncAll(identity) {
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    if (!self || !identity.privkeyHex) return [];

    const events = await collectLocalDmEvents();
    for (const event of events) {
      if (isSelfFanOutCopy(self, event)) continue;
      try {
        const payload = await decryptDmEvent(identity.privkeyHex, self, event);
        if (!payload?.groupId) continue;
        const applied = await groupsApi
          .applyGroupFromMessage(identity, { ...payload, sender: event.pubkey })
          .catch(() => null);
        if (!applied) continue;
        void putRawEvent(event, "group", {
          groupId: payload.groupId,
          type: payload.type || "text",
        }).catch(() => {});
      } catch {}
    }

    return (await listStoredGroups()).filter((g) => !g.isRemoved);
  },

  async getGroup(identity, groupId) {
    return getStoredGroup(groupId);
  },

  /** Refresh one group from local Dexie; relay history is the engine's job. */
  async syncGroup(identity, groupId) {
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    if (!self || !identity.privkeyHex) return { group: null, messages: [] };
    await groupsApi.syncAll(identity);
    const group = await getStoredGroup(groupId).catch(() => null);
    if (!group) return { group: null, messages: [] };
    const rows = await listGroupEvents(groupId);
    const messages = await decryptLocalGroupRows(identity.privkeyHex, self, rows);
    messages.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
    return { group, messages };
  },

  async loadOlderGroupMessages(identity, groupId, untilMs) {
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    if (!self || !identity.privkeyHex) return { messages: [], hasMore: false };
    const rows = await listGroupEventsBefore(groupId, untilMs, 101);
    const page = rows.slice(0, 100);
    const messages = await decryptLocalGroupRows(identity.privkeyHex, self, page);
    messages.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
    return { messages, hasMore: rows.length > 100 };
  },

  /**
   * Build the exact fan-out payload for a group message and pre-prepare (but
   * NOT publish) the self-DM, so callers can use its real event id as the
   * optimistic row id. The temp row, the confirmed echo and the confirmation
   * then all share one id and can never render as two copies.
   */
  async prepareSelfMessage(identity, groupId, payload) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    const messagePayload = buildGroupMessagePayload(groupId, group, payload);
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    const selfPrepared = await api.prepareDirectMessage(identity.privkeyHex, self, messagePayload, {
      tTag: GROUP_MSG_TAG,
    });
    return { selfPrepared, messagePayload };
  },

  /** Fan a message out as tagged DMs and keep our own copy for history. */
  async sendGroupMessage(identity, groupId, payload, options = {}) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");

    const messagePayload =
      options.messagePayload || buildGroupMessagePayload(groupId, group, payload);
    const result = await fanOut(
      identity,
      group,
      messagePayload,
      GROUP_MSG_TAG,
      options.selfPrepared || null,
    );
    // fanOut already stored the self copy (origin group, groupId) locally.
    const msg = { id: result.id, groupId, sender: identity.pubkeyHex, ...messagePayload };
    if (messagePayload.type !== "read" && msg.ts > Number(group.lastMessageTs || 0)) {
      group.lastMessageTs = msg.ts;
      await putStoredGroup(group).catch(() => {});
    }
    return msg;
  },

  async leaveGroup(identity, groupId) {
    const group = await getStoredGroup(groupId);
    if (!group) return;
    group.isRemoved = true;
    await putStoredGroup(group);
  },

  async deleteGroup(identity, groupId) {
    const group = await getStoredGroup(groupId);
    if (!group) return;
    group.isRemoved = true;
    await putStoredGroup(group);
  },
};
