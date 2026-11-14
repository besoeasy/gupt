// ===========================================================================
// Self-contained group events.
//
// A group is exactly its member set: 2–8 public keys including yourself.
// There is no name, admin, roster owner, shared key, or key rotation. The
// full identity is
//
//     groupId = sha256("gupt:group:v1:" + sortedMembers.join(":"))
//
// and the visible name is only a suffix of that hash.
//
// Every chat event is ONE signed event in `gupt/chat/group`. Its labels are
// the sorted members (so any member can discover it), and its data carries
// one AES-GCM copy per member, aligned with those labels. A relay may delete
// any event at any time, so every event must stand alone: any single event
// recreates the group and its roster.
//
// Old name+members groups are kept read-only. They are still displayed, but
// no new group event is ever sent to them.
// ===========================================================================

import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { getExpiryTimestampSec } from "@/config/retention";
import { decryptDm, encryptDm, finalizeEvent, normalizePubkey } from "./crypto.js";
import { publishLocal } from "./engine/index.js";
import {
  GROUP_COLLECTION,
  GROUP_MAX_MEMBERS,
  GROUP_MIN_MEMBERS,
  GROUP_MODEL,
  groupIdForMembers,
  isLegacyGroup,
  legacyGroupIdFor,
  normalizeGroupMembers,
  parseGroupMembers,
} from "./groupIdentity.js";
import {
  getRawEventsByOrigin,
  getStoredGroup,
  listGroupEvents,
  listGroupEventsBefore,
  listStoredGroups,
  markRawEventsApplied,
  putRawEvent,
  putStoredGroup,
} from "./idb.js";
import { getKnownRelays } from "./relay";

const HEX64 = /^[0-9a-f]{64}$/;
const MSG_ID_RE = /^[0-9a-f]{16,64}$/i;

function randomHex(bytes = 16) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function payloadBlobs(payload) {
  const hashes = [];
  const media = payload?.media;
  const mediaItems = Array.isArray(media) ? media : media ? [media] : [];
  for (const item of mediaItems) {
    for (const part of Array.isArray(item?.parts) ? item.parts : []) {
      const h = String(part || "").trim().toLowerCase();
      if (HEX64.test(h)) hashes.push(h);
    }
    const legacy = item?.hash || item?.cid;
    if (typeof legacy === "string" && HEX64.test(legacy.trim().toLowerCase())) {
      hashes.push(legacy.trim().toLowerCase());
    }
  }
  return [...new Set(hashes)].slice(0, 8);
}

/** Payload carried inside every member's encrypted copy. */
function buildPlaintext(groupId, msgId, payload) {
  const plaintext = {
    type: payload.type || "text",
    groupId,
    msgId,
    text: String(payload.text || ""),
    media: payload.media ?? null,
    replyTo: payload.replyTo,
    replyExcerpt: payload.replyExcerpt,
    emoji: payload.emoji,
    ts: Number(payload.ts) || Date.now(),
    durationMs: Number(payload.durationMs || 0),
    lat: payload.lat,
    lon: payload.lon,
    accuracy: payload.accuracy,
    approximate: payload.approximate,
    label: payload.label,
  };
  if (payload.type === "read") {
    plaintext.lastReadTs = Number(payload.lastReadTs || 0);
  }
  return plaintext;
}

function isV2GroupEvent(event) {
  if (!event) return false;
  if (String(event.collection || "") === GROUP_COLLECTION) return true;
  return Number(event.data?.v) === 2 && Array.isArray(event.data?.copies);
}

/** Build the one event that carries every member's copy. */
async function buildGroupEvent(identity, members, payload) {
  const self = normalizePubkey(identity?.pubkeyHex);
  if (!self || !identity?.privkeyHex) throw new Error("Identity not initialized");

  const sorted = normalizeGroupMembers(members);
  if (sorted.length < GROUP_MIN_MEMBERS || sorted.length > GROUP_MAX_MEMBERS) {
    throw new Error(`A group needs between ${GROUP_MIN_MEMBERS} and ${GROUP_MAX_MEMBERS} members.`);
  }
  if (!sorted.includes(self)) throw new Error("You must be a member of the group.");

  const groupId = groupIdForMembers(sorted);
  const msgId = randomHex(16);
  const plaintext = buildPlaintext(groupId, msgId, payload);

  const copies = [];
  for (const member of sorted) {
    const encrypted = await encryptDm(identity.privkeyHex, member, JSON.stringify(plaintext));
    copies.push({ nonce: encrypted.nonce, ciphertext: encrypted.ciphertext });
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = getExpiryTimestampSec();
  const event = finalizeEvent(
    {
      collection: GROUP_COLLECTION,
      labels: sorted,
      blobs: payloadBlobs(plaintext),
      data: { v: 2, msgId, copies },
      created_at: now,
      expires_at: expiresAt,
      kind: 4,
      tags: [
        ...sorted.map((member) => ["p", member]),
        ["t", GROUP_COLLECTION],
        ["expiration", String(expiresAt)],
      ],
    },
    hexToBytes(identity.privkeyHex),
  );

  return { id: event.id, event, messagePayload: plaintext, members: sorted, groupId };
}

/**
 * Decrypt our copy of a v2 group event. The signed labels are the roster;
 * the decrypted groupId/msgId must match the roster and the event envelope.
 */
async function parseGroupEvent(privkeyHex, selfPubkey, event) {
  const self = normalizePubkey(selfPubkey);
  const sender = normalizePubkey(event?.pubkey || event?.owner);
  if (!self || !sender) return null;
  if (event.collection !== GROUP_COLLECTION) return null;

  const members = parseGroupMembers(event.labels);
  if (!members || !members.includes(self) || !members.includes(sender)) return null;

  const data = event.data || {};
  const msgId = String(data.msgId || "");
  const copies = Array.isArray(data.copies) ? data.copies : [];
  if (Number(data.v) !== 2 || !MSG_ID_RE.test(msgId)) return null;
  if (copies.length !== members.length) return null;

  const copy = copies[members.indexOf(self)];
  if (!copy?.nonce || !copy?.ciphertext) return null;

  const payload = JSON.parse(await decryptDm(privkeyHex, sender, copy));
  const groupId = groupIdForMembers(members);
  if (payload?.groupId !== groupId || payload?.msgId !== msgId) return null;

  const createdAt = Number(event.created_at || 0) * 1000;
  const ts = Number(payload.ts) || createdAt;
  return {
    ...payload,
    id: event.id,
    groupId,
    msgId,
    members,
    model: GROUP_MODEL,
    sender,
    mine: sender === self,
    type: payload.type || "text",
    text: payload.text ?? "",
    media: payload.media ?? null,
    ts,
    created_at: createdAt,
  };
}

/** Legacy kind-4 fan-out payload (name + members) — read-only. */
async function parseLegacyGroupRow(privkeyHex, selfPubkey, row) {
  const event = row?.event;
  if (!event) return null;
  const self = normalizePubkey(selfPubkey);
  const author = normalizePubkey(event.pubkey);
  if (!self || !author) return null;

  const pTag = normalizePubkey(
    event.tags?.find((tag) => tag[0] === "p")?.[1] || event.recipientPubkey,
  );
  const counterparty = author === self ? pTag || self : author;
  const payload = JSON.parse(
    await decryptDm(privkeyHex, counterparty, event.data || event.content),
  );
  if (!payload?.groupId) return null;

  const createdAt = Number(event.created_at || 0) * 1000;
  return {
    ...payload,
    id: event.id,
    groupId: payload.groupId,
    sender: author,
    mine: author === self,
    type: payload.type || "text",
    text: payload.text ?? "",
    media: payload.media ?? null,
    ts: Number(payload.ts) || createdAt,
    created_at: createdAt,
    model: 1,
    members: normalizeGroupMembers(payload.members),
    name: String(payload.name || ""),
  };
}

/** Decrypt locally stored group rows (v2 events and legacy copies). */
export async function decryptLocalGroupRows(privkeyHex, selfPubkey, rawRows) {
  if (!privkeyHex || !rawRows?.length) return [];
  const out = [];
  for (const row of rawRows) {
    try {
      const event = row?.event;
      if (!event) continue;
      const parsed = isV2GroupEvent(event)
        ? await parseGroupEvent(privkeyHex, selfPubkey, event)
        : await parseLegacyGroupRow(privkeyHex, selfPubkey, row);
      if (!parsed) continue;
      out.push({ ...parsed, origin: row.origin || "group", _event: event });
    } catch {
      // A deleted/corrupt copy is skipped; other members' events still stand.
    }
  }
  return out;
}

async function upsertV2Group(identity, row) {
  const self = normalizePubkey(identity.pubkeyHex);
  const sender = normalizePubkey(row?.sender);
  const members = normalizeGroupMembers(row?.members);
  const groupId = String(row?.groupId || "").trim();
  if (!self || !sender || !groupId) return null;
  if (members.length < GROUP_MIN_MEMBERS || members.length > GROUP_MAX_MEMBERS) return null;
  if (!members.includes(self) || !members.includes(sender)) return null;
  if (groupId !== groupIdForMembers(members)) return null;

  const existing = await getStoredGroup(groupId).catch(() => null);
  const now = Date.now();
  const groupRecord = {
    ...(existing || {}),
    groupId,
    name: "",
    members,
    model: GROUP_MODEL,
    isRemoved: false,
    createdAt: Number(existing?.createdAt || row?.ts || row?.created_at || now),
    updatedAt: now,
  };
  await putStoredGroup(groupRecord);
  return groupRecord;
}

async function upsertLegacyGroup(identity, row) {
  const self = normalizePubkey(identity.pubkeyHex);
  const sender = normalizePubkey(row?.sender);
  const members = normalizeGroupMembers(row?.members);
  const groupId = String(row?.groupId || "").trim();
  if (!self || !sender || !groupId) return null;
  if (!members.includes(self) || !members.includes(sender)) return null;
  if (groupId !== legacyGroupIdFor(row?.name, members)) return null;

  const existing = await getStoredGroup(groupId).catch(() => null);
  if (existing && Number(existing.model) === GROUP_MODEL) return null;
  const now = Date.now();
  const groupRecord = {
    ...(existing || {}),
    groupId,
    name: String(row?.name || existing?.name || ""),
    members,
    model: 1,
    isRemoved: false,
    createdAt: Number(existing?.createdAt || row?.ts || row?.created_at || now),
    updatedAt: now,
  };
  await putStoredGroup(groupRecord);
  return groupRecord;
}

export const groupsApi = {
  async prepareIdentity(identity) {
    return { pubkey: identity.pubkeyHex, relays: getKnownRelays() };
  },

  async listGroups() {
    const groups = await listStoredGroups();
    return groups
      .filter((group) => !group.isRemoved)
      .sort((a, b) => Number(b.lastMessageTs || 0) - Number(a.lastMessageTs || 0));
  },

  /** Local-only: contacts learn the group from the first event you send. */
  async createGroup(identity, { memberPubkeys = [] } = {}) {
    const self = normalizePubkey(identity?.pubkeyHex);
    if (!self || !identity?.privkeyHex) throw new Error("Identity not initialized");

    const members = normalizeGroupMembers([self, ...(memberPubkeys || [])]);
    if (members.length < GROUP_MIN_MEMBERS) throw new Error("Add at least one member.");
    if (members.length > GROUP_MAX_MEMBERS) {
      throw new Error(`A group can have at most ${GROUP_MAX_MEMBERS} members including you.`);
    }

    const now = Date.now();
    const groupRecord = {
      groupId: groupIdForMembers(members),
      name: "",
      members,
      model: GROUP_MODEL,
      createdAt: now,
      updatedAt: now,
      lastMessageTs: now,
      isRemoved: false,
    };
    await putStoredGroup(groupRecord);
    return groupRecord;
  },

  /** Upsert a group from an already decrypted v2 message or a legacy DM row. */
  async applyGroupFromMessage(identity, row) {
    if (Number(row?.model) === GROUP_MODEL) return upsertV2Group(identity, row);
    if (row?.members?.length && row?.name !== undefined) {
      return upsertLegacyGroup(identity, row);
    }
    return upsertV2Group(identity, row);
  },

  /** Parse raw rows with origin "group" into decrypted message rows. */
  async parseStoredGroupRows(rows, identity) {
    const self = normalizePubkey(identity?.pubkeyHex);
    if (!self || !identity?.privkeyHex) return [];
    const out = await decryptLocalGroupRows(identity.privkeyHex, self, rows);
    out.sort(
      (left, right) =>
        Number(left.ts || 0) - Number(right.ts || 0) || left.id.localeCompare(right.id),
    );
    return out;
  },

  /**
   * Keep a legacy DM row addressable as group history. v2 rows are already
   * stored under origin "group" by the engine, so they need no rewrite.
   */
  async ingestGroupMessage(identity, row) {
    const event = row?._event;
    const groupId = String(row?.groupId || "").trim();
    if (!event?.id || !groupId) return;
    if (row.origin === "group") return;
    await putRawEvent(event, "group", { groupId, type: row.type || "text" }).catch(() => {});
    await markRawEventsApplied([event.id]).catch(() => {});
  },

  /** Rebuild groups from local raw events. Relays own remote history. */
  async syncAll(identity) {
    const self = normalizePubkey(identity?.pubkeyHex);
    if (!self || !identity?.privkeyHex) return [];

    const rows = await getRawEventsByOrigin("group").catch(() => []);
    for (const row of rows) {
      try {
        const parsed = isV2GroupEvent(row.event)
          ? await parseGroupEvent(identity.privkeyHex, self, row.event)
          : await parseLegacyGroupRow(identity.privkeyHex, self, row);
        if (!parsed) continue;
        await groupsApi.applyGroupFromMessage(identity, parsed);
      } catch {
        // Ignore corrupt or undecryptable rows.
      }
    }

    return (await listStoredGroups()).filter((group) => !group.isRemoved);
  },

  async getGroup(identity, groupId) {
    return getStoredGroup(groupId);
  },

  async syncGroup(identity, groupId) {
    const self = normalizePubkey(identity.pubkeyHex);
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
    const self = normalizePubkey(identity.pubkeyHex);
    if (!self || !identity.privkeyHex) return { messages: [], hasMore: false };
    const rows = await listGroupEventsBefore(groupId, untilMs, 101);
    const page = rows.slice(0, 100);
    const messages = await decryptLocalGroupRows(identity.privkeyHex, self, page);
    messages.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
    return { messages, hasMore: rows.length > 100 };
  },

  /** Build (but do not store) the event, so the optimistic row uses its id. */
  async prepareGroupMessage(identity, groupId, payload) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    if (isLegacyGroup(group)) {
      throw new Error("This legacy group is read-only. Create a new group to continue.");
    }
    return buildGroupEvent(identity, group.members, payload);
  },

  async sendGroupMessage(identity, groupId, payload, options = {}) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    if (isLegacyGroup(group)) {
      throw new Error("This legacy group is read-only. Create a new group to continue.");
    }

    const prepared = options.prepared || (await buildGroupEvent(identity, group.members, payload));
    const type = prepared.messagePayload?.type || payload?.type || "text";

    await publishLocal(prepared.event, { origin: "group", groupId, type });

    const msg = {
      ...prepared.messagePayload,
      id: prepared.id,
      groupId,
      sender: normalizePubkey(identity.pubkeyHex),
    };
    const ts = Number(msg.ts || 0);
    if (type !== "read" && ts > Number(group.lastMessageTs || 0)) {
      group.lastMessageTs = ts;
      group.updatedAt = Date.now();
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

export { GROUP_COLLECTION, GROUP_MODEL, isLegacyGroup };
