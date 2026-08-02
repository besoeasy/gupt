import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import {
  generateKeypair,
  finalizeEvent,
  aesEncrypt,
  aesDecrypt,
  decryptDm,
  getDmSharedSecret,
} from "./crypto.js";
import { api } from "./api.js";
import { getKnownRelays, publishToRelays, query, subscribe } from "./relay";
import { enqueueSend } from "./sendQueue.js";
import {
  putStoredGroup,
  getStoredGroup,
  listStoredGroups,
  putRawEvent,
  indexGroupMessage,
} from "./idb.js";

// Groups are encrypted "boxes" that are remade whenever membership changes.
// Each generation has:
//   - a CONTROL keypair (admin-only): its pubkey is the groupId and signs the
//     group state (roster). The private key is never shared with members.
//   - a MESSAGE key (shared with all members): a symmetric key that encrypts
//     both group messages and the group state content.
// State and message events are both kind 1, tagged #p:[groupId] so relays can
// route them and clients can subscribe with one filter. Content is encrypted
// (kind 1 is public), and state events are only trusted when authored by the
// control key. Every membership change publishes a new generation whose state
// carries `prev: <oldGroupId>`, giving forward secrecy for free.
const GROUP_KIND = 1;
const GROUP_STATE_TAG = "gupt:gstate";
const GROUP_MESSAGE_TAG = "gupt:gmsg";
const GROUP_ESCROW_TAG = "gupt:group-escrow";
const GROUP_MESSAGE_TYPE = "text";

// Escrows are re-published on a 25% chance per group message, throttled to at
// most once per interval, so active groups always keep a fresh escrow inside
// whatever relay retention window applies (self-healing). Quiet groups rely on
// plain relay retention, which is unavoidable.
const ESCROW_REFRESH_CHANCE = 0.25;
const ESCROW_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

function ensureArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function randomMessageKeyHex() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

async function encryptGroupPayload(messageKeyHex, payload) {
  return aesEncrypt(hexToBytes(messageKeyHex), JSON.stringify(payload));
}

async function decryptGroupPayload(messageKeyHex, content) {
  return JSON.parse(await aesDecrypt(hexToBytes(messageKeyHex), content));
}

function isGroupState(event) {
  return event.tags.some((t) => t[0] === "t" && t[1] === GROUP_STATE_TAG);
}

function isGroupMessage(event) {
  return event.tags.some((t) => t[0] === "t" && t[1] === GROUP_MESSAGE_TAG);
}

/** Build + publish the encrypted state event signed by the control key. */
async function publishState(controlPrivkeyHex, groupId, messageKeyHex, state) {
  const content = await encryptGroupPayload(messageKeyHex, state);
  const event = finalizeEvent(
    {
      kind: GROUP_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", groupId],
        ["t", GROUP_STATE_TAG],
      ],
      content,
    },
    hexToBytes(controlPrivkeyHex),
  );
  await publishToRelays(getKnownRelays(), event);
  return event;
}

/**
 * Publish a higher-version "retired" tombstone on an old generation, signed by
 * its control key and encrypted with the old message key. Anyone still holding
 * that key — including members who were removed and never learn the new
 * generation's groupId — can discover the group was superseded and stop
 * resurrecting it after a wipe.
 */
async function publishRetirement(oldGroup, newGroupId) {
  const state = {
    type: "state",
    retired: true,
    newGroupId,
    version: (oldGroup.version || 1) + 1,
    ts: Date.now(),
  };
  await publishState(oldGroup.controlPrivkey, oldGroup.groupId, oldGroup.messageKey, state);
  return state;
}

/**
 * Creator-only backup of a generation's message key + control key, published as
 * a kind-1 event tagged #p:[self] and encrypted with a key derived from the
 * identity alone. It survives a local wipe: after restoring the identity from
 * password+PIN the same key is re-derived, so the creator can recover the group
 * (including admin powers) from relays.
 */
async function publishGroupEscrow(identity, groupRecord, recipientPubkey = identity.pubkeyHex) {
  if (!groupRecord?.groupId || !groupRecord?.messageKey) return null;
  const isSelf = recipientPubkey === identity.pubkeyHex;
  // ECDH shared secret so only the recipient (and the sender) can decrypt.
  const escrowKey = getDmSharedSecret(identity.privkeyHex, recipientPubkey);
  const payload = {
    type: "group-escrow",
    groupId: groupRecord.groupId,
    messageKey: groupRecord.messageKey,
    // Only the control-key holder (the creator) keeps admin powers; member
    // escrows carry the message key + roster but never the control key.
    controlPrivkey: isSelf ? groupRecord.controlPrivkey || "" : "",
    name: groupRecord.name,
    description: groupRecord.description,
    admins: groupRecord.admins,
    members: groupRecord.members,
    createdBy: groupRecord.createdBy,
    createdAt: groupRecord.createdAt,
    version: groupRecord.version || 1,
    generation: groupRecord.generation || 1,
    prev: groupRecord.prev || null,
  };
  const content = await aesEncrypt(escrowKey, JSON.stringify(payload));
  const event = finalizeEvent(
    {
      kind: GROUP_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", recipientPubkey],
        ["t", GROUP_ESCROW_TAG],
      ],
      content,
    },
    hexToBytes(identity.privkeyHex),
  );
  await publishToRelays(getKnownRelays(), event);
  return event;
}

/** Publish escrows to the creator (self) and every member of the group. */
async function publishGroupEscrows(identity, groupRecord) {
  if (!groupRecord?.groupId || !groupRecord?.messageKey) return;
  const recipients = [
    identity.pubkeyHex,
    ...ensureArray(groupRecord.members).filter((m) => m && m !== identity.pubkeyHex),
  ];
  await Promise.allSettled(
    [...new Set(recipients)].map((pubkey) => publishGroupEscrow(identity, groupRecord, pubkey)),
  );
  groupRecord.escrowRefreshedAt = Date.now();
  await putStoredGroup(groupRecord).catch(() => {});
}

/** Refresh escrows on a per-message dice roll, throttled to one per interval. */
async function maybeRefreshGroupEscrows(identity, groupRecord) {
  if (!groupRecord?.groupId || !groupRecord?.messageKey) return;
  if (Math.random() > ESCROW_REFRESH_CHANCE) return;
  if (Date.now() - Number(groupRecord.escrowRefreshedAt || 0) < ESCROW_REFRESH_INTERVAL_MS) return;
  await publishGroupEscrows(identity, groupRecord);
}

/**
 * Fetch the latest state (roster) for a group from relays.
 * Only events authored by the group's control key (groupId) are trusted, and
 * the highest `version` wins regardless of publish order.
 */
async function fetchLatestState(groupId, messageKeyHex) {
  const events = await query({
    kinds: [GROUP_KIND],
    "#p": [groupId],
    limit: 50,
  });
  let latest = null;
  for (const event of events) {
    if (!isGroupState(event)) continue;
    if (event.pubkey !== groupId) continue; // only control-key signed states
    try {
      const payload = await decryptGroupPayload(messageKeyHex, event.content);
      if (payload && typeof payload.version === "number") {
        if (!latest || payload.version > latest.version) {
          latest = { ...payload, _eventId: event.id };
        }
      }
    } catch {}
  }
  return latest;
}

/** Turn a decrypted message payload into a displayable message row. */
function buildMessageRow(event, groupId, payload) {
  return {
    id: event.id,
    groupId,
    sender: event.pubkey,
    type: payload.type || GROUP_MESSAGE_TYPE,
    text: payload.text || "",
    media: payload.media || null,
    ts: event.created_at * 1000,
    replyTo: payload.replyTo,
    emoji: payload.emoji,
  };
}

async function storeGroupEvent(event, groupId, payload) {
  void putRawEvent(event, "group", {
    groupId,
    type: payload.type || GROUP_MESSAGE_TYPE,
  }).catch(() => {});
}

/** Decrypt group message rows stored in Dexie using the symmetric key. */
export async function decryptLocalGroupRows(messageKeyHex, rawRows, selfPubkey) {
  if (!messageKeyHex || !rawRows?.length) return [];
  const keyBytes = hexToBytes(messageKeyHex);
  const out = [];
  for (const row of rawRows) {
    try {
      const payload = JSON.parse(await aesDecrypt(keyBytes, row.event.content));
      out.push({
        ...payload,
        id: row.id,
        groupId: row.groupId,
        sender: row.event.pubkey,
        mine: row.event.pubkey === selfPubkey,
        type: row.type || payload.type || GROUP_MESSAGE_TYPE,
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
    return groups.sort((a, b) => b.lastMessageTs - a.lastMessageTs);
  },

  async createGroup(identity, { name, description, memberPubkeys = [] }) {
    const controlKp = generateKeypair();
    const groupId = controlKp.pubkeyHex;
    const messageKey = randomMessageKeyHex();

    const members = [...new Set([identity.pubkeyHex, ...ensureArray(memberPubkeys)])];
    const now = Date.now();

    const state = {
      type: "state",
      name: name || "Unnamed Group",
      description: description || "",
      members,
      admins: [identity.pubkeyHex],
      createdBy: identity.pubkeyHex,
      createdAt: now,
      version: 1,
      prev: null,
    };
    await publishState(controlKp.privkeyHex, groupId, messageKey, state);

    const groupRecord = {
      groupId,
      controlPrivkey: controlKp.privkeyHex,
      messageKey,
      name: state.name,
      description: state.description,
      members: state.members,
      admins: state.admins,
      createdBy: state.createdBy,
      createdAt: state.createdAt,
      updatedAt: state.createdAt,
      lastMessageTs: state.createdAt,
      version: state.version,
      generation: 1,
      prev: null,
      isRemoved: false,
    };
    await putStoredGroup(groupRecord);

    // Publish key-escrows to the creator and every member so anyone in the
    // group can recover after a local wipe.
    await publishGroupEscrows(identity, groupRecord).catch(() => null);

    await groupsApi.sendInvites(identity, groupRecord, members);
    return groupRecord;
  },

  /** Deliver the message key to members via existing kind-4 DMs. */
  async sendInvites(identity, groupRecord, memberPubkeys) {
    for (const member of ensureArray(memberPubkeys)) {
      if (member === identity.pubkeyHex) continue;
      const payload = {
        type: "group-invite",
        groupId: groupRecord.groupId,
        messageKey: groupRecord.messageKey,
        name: groupRecord.name,
        description: groupRecord.description,
        admins: groupRecord.admins,
        createdBy: groupRecord.createdBy,
        createdAt: groupRecord.createdAt,
        generation: groupRecord.generation || 1,
        prev: groupRecord.prev || null,
      };
      enqueueSend({
        id: `group-invite:${groupRecord.groupId}:${member}`,
        meta: { kind: "group-admin", conversationId: `group:${groupRecord.groupId}` },
        fn: () => api.postDirectMessage(identity.privkeyHex, member, payload),
        onFailed() {},
      });
    }
  },

  async getGroup(identity, groupId) {
    return getStoredGroup(groupId);
  },

  async syncGroup(identity, groupId) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    if (!group.messageKey) return { group, messages: [] };

    // Apply the newest state (roster) — versioned, not clock-based.
    const state = await fetchLatestState(groupId, group.messageKey).catch(() => null);
    if (state?.retired) {
      // Generation superseded — retire it (covers members removed mid-sync).
      if (!group.isRemoved) {
        group.isRemoved = true;
        await putStoredGroup(group);
      }
      return { group, messages: [] };
    }
    if (state) {
      const needsUpdate =
        !group.version || state.version > group.version || !group.name || !group.members?.length;
      if (needsUpdate) {
        group.name = state.name || group.name;
        group.description =
          state.description !== undefined ? state.description : group.description;
        group.members = state.members || group.members;
        group.admins = state.admins || group.admins;
        group.version = state.version;
        group.updatedAt = Math.max(group.updatedAt || 0, Date.now());
        await putStoredGroup(group);
      }
    }

    const events = await query({
      kinds: [GROUP_KIND],
      "#p": [groupId],
      limit: 100,
    });

    const messages = [];
    for (const event of events) {
      if (!isGroupMessage(event) || event.pubkey === groupId) continue;
      try {
        const payload = await decryptGroupPayload(group.messageKey, event.content);
        const msg = buildMessageRow(event, groupId, payload);
        await storeGroupEvent(event, groupId, payload);
        await indexGroupMessage(msg);
        messages.push(msg);
        if (msg.ts > group.lastMessageTs) group.lastMessageTs = msg.ts;
      } catch {}
    }
    await putStoredGroup(group);

    return { group, messages: messages.sort((a, b) => a.ts - b.ts) };
  },

  async acceptInvite(identity, invite) {
    const groupId = String(invite?.groupId || "").trim();
    const messageKey = String(invite?.messageKey || "").trim();
    if (!groupId || !messageKey) throw new Error("Invalid group invite");

    const existing = await getStoredGroup(groupId);
    if (existing && !existing.isRemoved) return existing;

    // Members never hold the control key; pull the full roster from relays.
    const state = await fetchLatestState(groupId, messageKey).catch(() => null);

    // Superseded generation (remake after removal) — don't bring it back from
    // a stale invite.
    if (state?.retired) return null;

    const groupRecord = {
      groupId,
      controlPrivkey: "",
      messageKey,
      name: state?.name || invite.name || "Unnamed Group",
      description: state?.description ?? invite.description ?? "",
      members: state?.members || ensureArray(invite.members) || [],
      admins: state?.admins || ensureArray(invite.admins) || [],
      createdBy: state?.createdBy || invite.createdBy || "",
      createdAt: state?.createdAt || Number(invite.createdAt || Date.now()),
      updatedAt: Number(state?.createdAt || invite.createdAt || Date.now()),
      lastMessageTs: Number(state?.createdAt || invite.createdAt || Date.now()),
      version: state?.version || 1,
      generation: Number(invite.generation || 1),
      prev: state?.prev ?? invite.prev ?? null,
      isRemoved: false,
    };
    await putStoredGroup(groupRecord);

    // A remake retires the previous generation — hide it from the list.
    if (invite.prev) {
      const prevGroup = await getStoredGroup(invite.prev).catch(() => null);
      if (prevGroup) {
        prevGroup.isRemoved = true;
        await putStoredGroup(prevGroup).catch(() => {});
      }
    }
    return groupRecord;
  },

  /** Recreate a creator-owned group from an escrow self-event after a wipe. */
  async restoreFromEscrow(identity, escrow) {
    const groupId = String(escrow?.groupId || "").trim();
    if (!groupId || !escrow?.messageKey) return null;

    const existing = await getStoredGroup(groupId);
    if (existing) {
      // Already known — upgrade a live member-only copy with admin keys.
      if (!existing.isRemoved && !existing.controlPrivkey && escrow.controlPrivkey) {
        existing.controlPrivkey = escrow.controlPrivkey;
        existing.messageKey = escrow.messageKey || existing.messageKey;
        await putStoredGroup(existing);
      }
      return existing.isRemoved ? null : existing;
    }

    // Pull the authoritative roster from relays (state is encrypted with messageKey).
    const state = await fetchLatestState(groupId, escrow.messageKey).catch(() => null);

    // Superseded generation (member removed, group remade) — don't resurrect it.
    if (state?.retired) return null;

    const groupRecord = {
      groupId,
      controlPrivkey: escrow.controlPrivkey || "",
      messageKey: escrow.messageKey,
      name: state?.name || escrow.name || "Unnamed Group",
      description: state?.description ?? escrow.description ?? "",
      members: state?.members || ensureArray(escrow.members) || [],
      admins: state?.admins || ensureArray(escrow.admins) || [],
      createdBy: escrow.createdBy || "",
      createdAt: Number(escrow.createdAt || Date.now()),
      updatedAt: Number(state?.createdAt || escrow.createdAt || Date.now()),
      lastMessageTs: Number(state?.createdAt || escrow.createdAt || Date.now()),
      version: state?.version || escrow.version || 1,
      generation: Number(escrow.generation || 1),
      prev: state?.prev ?? escrow.prev ?? null,
      isRemoved: false,
    };
    await putStoredGroup(groupRecord);
    return groupRecord;
  },

  async syncAll(identity) {
    const groups = await listStoredGroups();
    for (const group of groups) {
      if (group.groupId && !group.isRemoved) {
        await groupsApi.syncGroup(identity, group.groupId).catch(() => null);
      }
    }

    // Scan kind-4 DMs for missed group invites.
    const events = await query({
      kinds: [4],
      "#p": [identity.pubkeyHex],
      limit: 100,
    });
    for (const event of events) {
      try {
        const plaintext = await decryptDm(identity.privkeyHex, event.pubkey, event.content);
        const payload = JSON.parse(plaintext);
        if (payload.type === "group-invite" && payload.groupId && payload.messageKey) {
          await groupsApi.acceptInvite(identity, payload).catch(() => null);
        }
      } catch {}
    }

    // Restore groups from escrow events (kind-1): the creator's self-escrow and
    // per-member escrows published by other members — newest first, deduped per
    // group so repeated refreshes of the same generation don't re-run work.
    const escrowEvents = await query({
      kinds: [GROUP_KIND],
      "#p": [identity.pubkeyHex],
      limit: 200,
    });
    const escrows = [];
    for (const event of escrowEvents) {
      if (!event.tags.some((t) => t[0] === "t" && t[1] === GROUP_ESCROW_TAG)) continue;
      try {
        // ECDH is symmetric, so key(senderPriv, myPub) === key(myPriv, senderPub).
        const senderKey = getDmSharedSecret(identity.privkeyHex, event.pubkey);
        const payload = JSON.parse(await aesDecrypt(senderKey, event.content));
        if (payload?.type === "group-escrow" && payload.groupId && payload.messageKey) {
          escrows.push({
            ...payload,
            escrowPublishedAt: Number(event.created_at || 0) * 1000,
          });
        }
      } catch {}
    }
    // Newest publication first, keeping only the freshest escrow per groupId.
    escrows.sort((a, b) => Number(b.escrowPublishedAt || 0) - Number(a.escrowPublishedAt || 0));
    const newestPerGroup = new Map();
    for (const escrow of escrows) {
      if (!newestPerGroup.has(escrow.groupId)) newestPerGroup.set(escrow.groupId, escrow);
    }
    const uniqueEscrows = [...newestPerGroup.values()];

    // Restore each generation we have an escrow for, then retire any generation
    // that is the `prev` of a newer one.
    const restoredGroupIds = [];
    for (const escrow of uniqueEscrows) {
      const restored = await groupsApi.restoreFromEscrow(identity, escrow).catch(() => null);
      if (restored?.groupId) restoredGroupIds.push(restored.groupId);
    }
    const successorPrevs = new Set(uniqueEscrows.map((e) => e.prev).filter(Boolean));
    for (const groupId of restoredGroupIds) {
      if (successorPrevs.has(groupId)) {
        const g = await getStoredGroup(groupId).catch(() => null);
        if (g) {
          g.isRemoved = true;
          await putStoredGroup(g).catch(() => {});
        }
      }
    }
    for (const groupId of restoredGroupIds) {
      const g = await getStoredGroup(groupId).catch(() => null);
      if (g && !g.isRemoved) {
        await groupsApi.syncGroup(identity, groupId).catch(() => null);
      }
    }
  },

  async loadOlderGroupMessages(identity, groupId, untilMs) {
    const group = await getStoredGroup(groupId);
    if (!group?.messageKey) return { messages: [], hasMore: false };

    const until = Math.floor(Math.max(0, untilMs || 0) / 1000);
    const events = await query({
      kinds: [GROUP_KIND],
      "#p": [groupId],
      ...(until ? { until } : {}),
      limit: 100,
    });

    const messages = [];
    for (const event of events) {
      if (!isGroupMessage(event) || event.pubkey === groupId) continue;
      if (until && event.created_at >= until) continue;
      try {
        const payload = await decryptGroupPayload(group.messageKey, event.content);
        const msg = buildMessageRow(event, groupId, payload);
        await storeGroupEvent(event, groupId, payload);
        await indexGroupMessage(msg);
        messages.push(msg);
      } catch {}
    }
    return { messages: messages.sort((a, b) => a.ts - b.ts), hasMore: events.length >= 100 };
  },

  async sendGroupMessage(identity, groupId, payload) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    if (!group.messageKey) throw new Error("Group key unavailable");

    const messagePayload = {
      type: payload.type || GROUP_MESSAGE_TYPE,
      text: payload.text || "",
      media: payload.media || null,
      replyTo: payload.replyTo,
      emoji: payload.emoji,
      ts: Date.now(),
    };
    const content = await encryptGroupPayload(group.messageKey, messagePayload);
    const event = finalizeEvent(
      {
        kind: GROUP_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["p", groupId],
          ["t", GROUP_MESSAGE_TAG],
        ],
        content,
      },
      hexToBytes(identity.privkeyHex),
    );
    await publishToRelays(getKnownRelays(), event);
    await storeGroupEvent(event, groupId, messagePayload);

    const msg = { id: event.id, groupId, sender: identity.pubkeyHex, ...messagePayload };
    group.lastMessageTs = msg.ts;
    await putStoredGroup(group);

    // Chance-based, throttled escrow refresh keeps group keys recoverable.
    await maybeRefreshGroupEscrows(identity, group).catch(() => {});

    return msg;
  },

  subscribeGroupMessages(identity, groupId, observer, sinceMs = Date.now()) {
    const since = Math.floor(sinceMs / 1000);
    return subscribe(
      null,
      { kinds: [GROUP_KIND], "#p": [groupId], since },
      {
        async next(event) {
          if (!isGroupMessage(event) || event.pubkey === groupId) return;
          const group = await getStoredGroup(groupId);
          if (!group?.messageKey) return;
          try {
            const payload = await decryptGroupPayload(group.messageKey, event.content);
            const msg = buildMessageRow(event, groupId, payload);
            await storeGroupEvent(event, groupId, payload);
            observer.next(msg);
          } catch {}
        },
        error: observer.error,
        complete: observer.complete,
      },
    );
  },

  subscribeAllGroups(identity, observer, sinceMs = Date.now()) {
    const since = Math.floor(sinceMs / 1000);
    let sub = null;
    let isActive = true;

    listStoredGroups().then((groups) => {
      if (!isActive) return;
      const groupIds = groups.map((g) => g.groupId).filter(Boolean);
      if (!groupIds.length) return;

      sub = subscribe(
        null,
        { kinds: [GROUP_KIND], "#p": groupIds, since },
        {
          async next(event) {
            const groupId = event.tags.find((t) => t[0] === "p")?.[1];
            if (!groupId) return;
            const group = await getStoredGroup(groupId);
            if (!group?.messageKey) return;

            // State (roster) events: only trust control-key signed states.
            if (isGroupState(event)) {
              if (event.pubkey !== groupId) return;
              try {
                const payload = await decryptGroupPayload(group.messageKey, event.content);
                if (!payload || typeof payload.version !== "number") return;
                if (payload.version > (group.version || 0)) {
                  if (payload.retired) {
                    // Generation superseded — drop it live: removed members get
                    // kicked as soon as the tombstone arrives on the sub.
                    group.isRemoved = true;
                    await putStoredGroup(group);
                    observer.metaChanged?.(groupId);
                    return;
                  }
                  group.name = payload.name || group.name;
                  group.description =
                    payload.description !== undefined ? payload.description : group.description;
                  group.members = payload.members || group.members;
                  group.admins = payload.admins || group.admins;
                  group.version = payload.version;
                  group.updatedAt = Date.now();
                  await putStoredGroup(group);
                  observer.metaChanged?.(groupId);
                }
              } catch {}
              return;
            }

            if (!isGroupMessage(event) || event.pubkey === groupId) return;
            try {
              const payload = await decryptGroupPayload(group.messageKey, event.content);
              const msg = buildMessageRow(event, groupId, payload);
              await storeGroupEvent(event, groupId, payload);
              observer.next(msg);
            } catch {}
          },
          error: observer.error,
          complete: observer.complete,
        },
      );
    });

    return {
      unsubscribe() {
        isActive = false;
        if (sub) sub.unsubscribe();
      },
    };
  },

  async updateGroup(identity, groupId, patch) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    if (!group.controlPrivkey) throw new Error("Only the group admin can edit the group");

    const state = {
      type: "state",
      name: patch.name !== undefined ? patch.name : group.name,
      description: patch.description !== undefined ? patch.description : group.description,
      members: group.members,
      admins: group.admins,
      createdBy: group.createdBy,
      createdAt: group.createdAt,
      version: (group.version || 0) + 1,
      prev: group.prev || null,
    };
    await publishState(group.controlPrivkey, groupId, group.messageKey, state);

    group.name = state.name;
    group.description = state.description;
    group.version = state.version;
    group.updatedAt = Date.now();
    await putStoredGroup(group);
    return group;
  },

  /**
   * Membership changes REMake the group: a fresh control key + message key so
   * removed members lose access and new members never see old traffic.
   */
  async remakeGroup(identity, oldGroupId, { members }) {
    const oldGroup = await getStoredGroup(oldGroupId);
    if (!oldGroup) throw new Error("Group not found");

    const controlKp = generateKeypair();
    const groupId = controlKp.pubkeyHex;
    const messageKey = randomMessageKeyHex();
    const nextMembers = [...new Set(ensureArray(members))];
    const now = Date.now();

    const state = {
      type: "state",
      name: oldGroup.name,
      description: oldGroup.description,
      members: nextMembers,
      admins: oldGroup.admins,
      createdBy: oldGroup.createdBy,
      createdAt: oldGroup.createdAt,
      version: 1,
      prev: oldGroupId,
    };
    await publishState(controlKp.privkeyHex, groupId, messageKey, state);

    const newGroupRecord = {
      groupId,
      controlPrivkey: controlKp.privkeyHex,
      messageKey,
      name: state.name,
      description: state.description,
      members: state.members,
      admins: state.admins,
      createdBy: state.createdBy,
      createdAt: state.createdAt,
      updatedAt: now,
      lastMessageTs: now,
      version: 1,
      generation: (oldGroup.generation || 1) + 1,
      prev: oldGroupId,
      isRemoved: false,
    };
    await putStoredGroup(newGroupRecord);

    // Publish key-escrows to the creator and every member.
    await publishGroupEscrows(identity, newGroupRecord).catch(() => null);

    // Retire the old generation locally, and publish a tombstone on it so
    // removed members can learn they're out even after a wipe (they never
    // discover the new generation's groupId).
    oldGroup.isRemoved = true;
    await putStoredGroup(oldGroup);
    await publishRetirement(oldGroup, groupId).catch(() => null);

    // Re-invite everyone to the new generation.
    await groupsApi.sendInvites(identity, newGroupRecord, nextMembers);
    return newGroupRecord;
  },

  async addMembers(identity, groupId, memberPubkeys) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    if (!group.controlPrivkey) throw new Error("Only the group admin can add members");

    const nextMembers = [...new Set([...group.members, ...ensureArray(memberPubkeys)])];
    if (nextMembers.length === group.members.length) return group;
    return groupsApi.remakeGroup(identity, groupId, { members: nextMembers });
  },

  async removeMember(identity, groupId, pubkeyToRemove) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");
    if (!group.controlPrivkey) throw new Error("Only the group admin can remove members");

    const nextMembers = group.members.filter((p) => p !== pubkeyToRemove);
    if (nextMembers.length === group.members.length) return group;
    return groupsApi.remakeGroup(identity, groupId, { members: nextMembers });
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
