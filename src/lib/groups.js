// ===========================================================================
// Stateless groups — a group is just a tag on a kind-4 E2EE DM.
//
// There is no shared group key, no admin, no control key, no escrow. Every
// group event is an ordinary direct message fan-out to every member (and to
// yourself, so your own copy survives a wipe). Each event carries a `t` tag
// that routes it to the group store:
//   - "gupt:group-roster" — the group definition (name, description, members,
//     version). Any listed member may publish one.
//   - "gupt:group-msg"    — a chat message.
//
// The groupId hashes the SORTED member pubkeys together with the name:
//     groupId = sha256( normalizedName + ":" + sortedPubkeys.join(",") )
// Sorting makes it order-independent; the roster DM carries the exact member
// list so every member derives the same id. Membership is the identity —
// nobody owns the group.
// ===========================================================================

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { decryptDm, normalizeNostrPubkey } from "./crypto.js";
import { api, GROUP_MSG_TAG, GROUP_ROSTER_TAG } from "./api.js";
import { queryMany, getKnownRelays } from "./relay";
import { getRetentionCutoffSec } from "@/config/retention";
import { putStoredGroup, getStoredGroup, listStoredGroups, putRawEvent } from "./idb.js";

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
  ];
}

function memberSet(pubkeys) {
  return new Set(normalizeMembers(pubkeys));
}

function requireMembership(identity, group) {
  const self = normalizeNostrPubkey(identity.pubkeyHex);
  if (!self) throw new Error("Identity not initialized");
  if (!memberSet(group?.members).has(self)) throw new Error("Not a member of this group");
  return self;
}

function buildRoster(group, overrides = {}) {
  return {
    type: "group-roster",
    groupId: group.groupId,
    name: group.name || "",
    description: group.description || "",
    members: group.members || [],
    createdAt: group.createdAt,
    version: Number(group.version || 0),
    ...overrides,
  };
}

/**
 * Deterministic group id: sha256(name:sortedPubkeys). The member list is
 * sorted (order-independent) and deduped.
 */
export function groupIdFor(name, pubkeys = []) {
  const sorted = [...new Set(ensureArray(pubkeys))]
    .map((p) =>
      String(p || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .sort()
    .join(",");
  const input = `${normalizeName(name)}:${sorted}`;
  return bytesToHex(sha256(new TextEncoder().encode(input)));
}

/**
 * Decrypt a group DM event. For inbound events the counterparty is the author;
 * for self-authored fan-out events it is the `p` tag (self-DMs included). ECDH
 * is symmetric, so both sides derive the same key.
 */
async function decryptDmEvent(privkeyHex, selfPubkey, event) {
  const pTag = event.tags.find((t) => t[0] === "p")?.[1];
  const counterparty = event.pubkey === selfPubkey ? pTag?.[1] || selfPubkey : event.pubkey;
  return JSON.parse(await decryptDm(privkeyHex, counterparty, event.content));
}

/** Build the payload that is fanned out to every member plus yourself. */
function buildGroupMessagePayload(groupId, group, payload) {
  return {
    type: payload.type || "text",
    groupId,
    name: group.name || "",
    text: String(payload.text || ""),
    media: payload.media || null,
    replyTo: payload.replyTo,
    emoji: payload.emoji,
    ts: Date.now(),
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
  const results = await Promise.allSettled(
    prepared
      .filter((e) => e.prepared)
      .map(async (e) => {
        await e.prepared.publish();
        return { pubkey: e.pubkey, id: e.prepared.id, event: e.prepared.event };
      }),
  );
  if (!results.some((r) => r.status === "fulfilled")) {
    throw new Error("Could not publish group message to any relay");
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

/** Scan kind-4 DMs to/from self, paginating back to the retention cutoff. */
async function collectDmEvents(selfPubkey) {
  const since = getRetentionCutoffSec();
  let currentUntil = Math.floor(Date.now() / 1000);
  const collected = [];
  let hasMore = true;
  let iterations = 0;
  while (hasMore && iterations < 20) {
    iterations++;
    const events = await queryMany(
      [
        { kinds: [4], authors: [selfPubkey], since, until: currentUntil, limit: 500 },
        { kinds: [4], "#p": [selfPubkey], since, until: currentUntil, limit: 500 },
      ],
      3000,
    ).catch(() => []);
    if (!events.length) break;
    collected.push(...events);
    let oldestTs = currentUntil;
    for (const event of events) {
      if (event.created_at < oldestTs) oldestTs = event.created_at;
    }
    if (events.length < 500) {
      hasMore = false;
    } else {
      currentUntil = oldestTs > 0 ? oldestTs - 1 : 0;
      if (currentUntil <= since) hasMore = false;
    }
  }
  return collected;
}

/** Decrypt group message rows stored in Dexie (ECDH against the sender). */
export async function decryptLocalGroupRows(privkeyHex, selfPubkey, rawRows) {
  if (!privkeyHex || !rawRows?.length) return [];
  const out = [];
  for (const row of rawRows) {
    try {
      if (isSelfFanOutCopy(selfPubkey, row.event)) continue;
      const payload = JSON.parse(await decryptDm(privkeyHex, row.pubkey, row.event.content));
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

  async createGroup(identity, { name, description, memberPubkeys = [] }) {
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    if (!self || !identity.privkeyHex) throw new Error("Identity not initialized");
    const normalizedName = normalizeName(name);
    if (!normalizedName) throw new Error("Enter a group name (letters and numbers).");

    const now = Date.now();
    const members = normalizeMembers([self, ...ensureArray(memberPubkeys)]);
    const groupId = groupIdFor(normalizedName, members);

    const roster = buildRoster({
      groupId,
      name: normalizedName,
      description: description || "",
      members,
      createdAt: now,
      version: 1,
    });
    const groupRecord = {
      groupId,
      name: roster.name,
      description: roster.description,
      members,
      createdAt: now,
      updatedAt: now,
      lastMessageTs: now,
      version: 1,
      isRemoved: false,
    };
    await putStoredGroup(groupRecord);
    await fanOut(identity, groupRecord, roster, GROUP_ROSTER_TAG).catch(() => null);
    return groupRecord;
  },
  /** Apply an incoming roster DM. Sender and self must both be listed members. */
  async applyRoster(identity, row) {
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    const roster = row || {};
    const groupId = String(roster.groupId || "").trim();
    if (!groupId || roster.type !== "group-roster") return null;
    const members = normalizeMembers(roster.members);
    const sender = normalizeNostrPubkey(row.sender);
    if (!self || !members.includes(self)) return null;
    if (!sender || !members.includes(sender)) return null;
    const version = Number(roster.version || 0);
    const existing = await getStoredGroup(groupId).catch(() => null);
    if (existing && version <= Number(existing.version || 0)) return existing;

    const groupRecord = {
      groupId,
      name:
        normalizeName(roster.name || roster.code || existing?.name || existing?.code) ||
        existing?.name ||
        "Unnamed Group",
      description: roster.description ?? existing?.description ?? "",
      members: members.length ? members : existing?.members || [],
      createdAt: Number(roster.createdAt || existing?.createdAt || Date.now()),
      version,
      updatedAt: Date.now(),
      isRemoved: false,
    };
    await putStoredGroup(groupRecord);
    return groupRecord;
  },

  /** Backward-compatible alias — a roster DM is the new "invite". */
  async acceptInvite(identity, row) {
    return groupsApi.applyRoster(identity, row);
  },

  /** Store an inbound group message DM in Dexie (origin "group"). */
  async ingestGroupMessage(identity, row) {
    const groupId = String(row?.groupId || "").trim();
    const event = row?._event;
    if (!groupId || !event) return;
    void putRawEvent(event, "group", { groupId, type: row.type || "text" }).catch(() => {});
  },

  /**
   * Rebuild groups and message history from our own kind-4 DMs. This is the
   * whole recovery story: re-derive the identity and re-scan — no escrows, no
   * keys to lose.
   */
  async syncAll(identity) {
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    if (!self || !identity.privkeyHex) return [];

    const events = await collectDmEvents(self);
    const rosters = [];
    const messages = [];
    for (const event of events) {
      try {
        const payload = await decryptDmEvent(identity.privkeyHex, self, event);
        if (payload?.type === "group-roster" && payload.groupId) {
          rosters.push({ ...payload, sender: event.pubkey });
        } else if (payload?.type === "group-msg" && payload.groupId) {
          messages.push({ event, payload });
        }
      } catch {}
    }

    // Newest version first — applyRoster ignores stale versions.
    rosters.sort(
      (a, b) =>
        Number(b.version || 0) - Number(a.version || 0) ||
        Number(b.createdAt || 0) - Number(a.createdAt || 0),
    );
    for (const roster of rosters) {
      await groupsApi.applyRoster(identity, roster).catch(() => null);
    }

    // Store messages for groups we know (in or formerly in).
    const groups = await listStoredGroups();
    const known = new Set(groups.map((g) => g.groupId));
    for (const { event, payload } of messages) {
      if (!known.has(payload.groupId)) continue;
      if (isSelfFanOutCopy(self, event)) continue;
      void putRawEvent(event, "group", {
        groupId: payload.groupId,
        type: payload.type || "text",
      }).catch(() => {});
    }
    return groups.filter((g) => !g.isRemoved);
  },

  async getGroup(identity, groupId) {
    return getStoredGroup(groupId);
  },

  /** Pull fresh rosters + messages for one group from relays. */
  async syncGroup(identity, groupId) {
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    const group = await getStoredGroup(groupId).catch(() => null);
    if (!group) return { group: null, messages: [] };
    const events = await queryMany(
      [
        { kinds: [4], authors: [self], limit: 300 },
        { kinds: [4], "#p": [self], limit: 300 },
      ],
      3000,
    ).catch(() => []);
    const messages = [];
    for (const event of events) {
      try {
        const payload = await decryptDmEvent(identity.privkeyHex, self, event);
        if (isSelfFanOutCopy(self, event)) continue;
        if (payload?.type === "group-msg" && payload.groupId === groupId) {
          const msg = { id: event.id, groupId, sender: event.pubkey, ...payload };
          void putRawEvent(event, "group", { groupId, type: payload.type || "text" }).catch(
            () => {},
          );
          messages.push(msg);
        } else if (payload?.type === "group-roster" && payload.groupId === groupId) {
          await groupsApi
            .applyRoster(identity, { ...payload, sender: event.pubkey })
            .catch(() => null);
        }
      } catch {}
    }
    const fresh = await getStoredGroup(groupId).catch(() => group);
    return {
      group: fresh,
      messages: messages.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0)),
    };
  },

  async loadOlderGroupMessages(identity, groupId, untilMs) {
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    if (!self || !identity.privkeyHex) return { messages: [], hasMore: false };
    const until = Math.floor(Math.max(0, untilMs || 0) / 1000);
    const since = getRetentionCutoffSec();
    const events = await queryMany(
      [
        { kinds: [4], authors: [self], since, ...(until ? { until } : {}), limit: 200 },
        { kinds: [4], "#p": [self], since, ...(until ? { until } : {}), limit: 200 },
      ],
      3000,
    ).catch(() => []);
    const messages = [];
    for (const event of events) {
      if (until && event.created_at >= until) continue;
      try {
        const payload = await decryptDmEvent(identity.privkeyHex, self, event);
        if (payload?.type !== "group-msg" || payload.groupId !== groupId) continue;
        if (isSelfFanOutCopy(self, event)) continue;
        const msg = { id: event.id, groupId, sender: event.pubkey, ...payload };
        void putRawEvent(event, "group", { groupId, type: payload.type || "text" }).catch(() => {});
        messages.push(msg);
      } catch {}
    }
    return {
      messages: messages.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0)),
      hasMore: events.length >= 200,
    };
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
    if (result.selfEvent) {
      void putRawEvent(result.selfEvent, "group", { groupId, type: messagePayload.type }).catch(
        () => {},
      );
    }
    const msg = { id: result.id, groupId, sender: identity.pubkeyHex, ...messagePayload };
    if (msg.ts > Number(group.lastMessageTs || 0)) {
      group.lastMessageTs = msg.ts;
      await putStoredGroup(group).catch(() => {});
    }
    return msg;
  },

  async updateGroup(identity, groupId, patch) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    requireMembership(identity, group);

    const roster = buildRoster(group, {
      name: patch.name !== undefined ? normalizeName(patch.name) || group.name : group.name,
      description: patch.description !== undefined ? patch.description : group.description,
      version: Number(group.version || 0) + 1,
    });
    await fanOut(identity, group, roster, GROUP_ROSTER_TAG).catch(() => null);
    group.name = roster.name;
    group.description = roster.description;
    group.version = roster.version;
    group.updatedAt = Date.now();
    await putStoredGroup(group);
    return group;
  },

  async addMembers(identity, groupId, memberPubkeys) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    requireMembership(identity, group);
    const nextMembers = normalizeMembers([...(group.members || []), ...ensureArray(memberPubkeys)]);
    if (nextMembers.length === (group.members || []).length) return group;

    const roster = buildRoster(group, {
      members: nextMembers,
      version: Number(group.version || 0) + 1,
    });
    await fanOut(identity, group, roster, GROUP_ROSTER_TAG).catch(() => null);
    group.members = nextMembers;
    group.version = roster.version;
    group.updatedAt = Date.now();
    await putStoredGroup(group);
    return group;
  },

  async removeMember(identity, groupId, pubkeyToRemove) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    requireMembership(identity, group);
    const nextMembers = normalizeMembers(group.members).filter(
      (p) => p !== (normalizeNostrPubkey(pubkeyToRemove) || pubkeyToRemove),
    );
    if (nextMembers.length === (group.members || []).length) return group;

    const roster = buildRoster(group, {
      members: nextMembers,
      version: Number(group.version || 0) + 1,
    });
    await fanOut(identity, group, roster, GROUP_ROSTER_TAG).catch(() => null);
    group.members = nextMembers;
    group.version = roster.version;
    group.updatedAt = Date.now();
    await putStoredGroup(group);
    return group;
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
