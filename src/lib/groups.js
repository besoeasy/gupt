import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import {
  generateKeypair,
  finalizeEvent,
  aesEncrypt,
  aesDecrypt,
  decryptDm,
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
const GROUP_MESSAGE_TYPE = "text";

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
      prev: null,
      isRemoved: false,
    };
    await putStoredGroup(groupRecord);

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
      prev: oldGroupId,
      isRemoved: false,
    };
    await putStoredGroup(newGroupRecord);

    // Retire the old generation.
    oldGroup.isRemoved = true;
    await putStoredGroup(oldGroup);

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
