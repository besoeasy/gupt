import { hexToBytes } from "@noble/hashes/utils.js";
import {
  generateKeypair,
  normalizeNostrPubkey,
  getPublicKey,
  encryptDm,
  decryptDm,
  finalizeEvent,
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

const GROUP_ROSTER_TYPE = "group-roster";
const GROUP_MESSAGE_TYPE = "text";
const GROUP_MEDIA_TYPE = "media";

function ensureArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

async function getRoster(groupPubkey, groupPrivkey) {
  const events = await query({
    kinds: [4],
    authors: [groupPubkey],
    "#p": [groupPubkey],
    limit: 10,
  });

  let latestRoster = null;
  for (const event of events) {
    try {
      const plaintext = await decryptDm(groupPrivkey, groupPubkey, event.content);
      const payload = JSON.parse(plaintext);
      if (payload.type === GROUP_ROSTER_TYPE) {
        void putRawEvent(event, "group-roster", { groupId: groupPubkey }).catch(() => {});
        if (!latestRoster || event.created_at > latestRoster.created_at) {
          latestRoster = { ...payload, created_at: event.created_at };
        }
      }
    } catch {}
  }
  return latestRoster;
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
    const groupKp = generateKeypair();
    const groupPubkey = groupKp.pubkeyHex;

    const members = [...new Set([identity.pubkeyHex, ...ensureArray(memberPubkeys)])];

    const roster = {
      type: GROUP_ROSTER_TYPE,
      name: name || "Unnamed Group",
      description: description || "",
      members,
      createdBy: identity.pubkeyHex,
      createdAt: Date.now(),
    };

    // Publish roster as Self-DM on Group Identity
    const content = await encryptDm(groupKp.privkeyHex, groupPubkey, JSON.stringify(roster));
    const rosterEvent = finalizeEvent(
      {
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", groupPubkey]],
        content,
      },
      hexToBytes(groupKp.privkeyHex),
    );

    await publishToRelays(getKnownRelays(), rosterEvent);

    
    const groupRecord = {
      groupId: groupPubkey,
      groupPrivkey: groupKp.privkeyHex,
      name: roster.name,
      description: roster.description,
      members: roster.members,
      admins: [identity.pubkeyHex],
      createdBy: roster.createdBy,
      createdAt: roster.createdAt,
      updatedAt: roster.createdAt,
      lastMessageTs: roster.createdAt,
      isRemoved: false,
    };
    await putStoredGroup(groupRecord);

    
    for (const member of members) {
      if (member !== identity.pubkeyHex) {
        const privkey = identity.privkeyHex;
        const groupPrivkey = groupKp.privkeyHex;
        enqueueSend({
          id: `group-invite:${groupKp.pubkeyHex}:${member}`,
          meta: { kind: "group-admin", conversationId: `group:${groupKp.pubkeyHex}` },
          fn: () =>
            api.postDirectMessage(privkey, member, {
              type: "group-invite",
              privkey: groupPrivkey,
            }),
          onFailed() {},
        });
      }
    }

    return groupRecord;
  },

  async getGroup(identity, groupId) {
    return getStoredGroup(groupId);
  },

  async syncGroup(identity, groupId) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");

    
    const roster = await getRoster(groupId, group.groupPrivkey);
    if (roster && roster.created_at * 1000 > group.updatedAt) {
      group.name = roster.name || group.name;
      group.description = roster.description || group.description;
      group.members = roster.members || group.members;
      group.updatedAt = roster.created_at * 1000;
      await putStoredGroup(group);
    }

    
    const events = await query({ kinds: [4], "#p": [groupId] });

    const messages = [];
    for (const event of events) {
      
      if (event.pubkey === groupId) continue;

      try {
        const plaintext = await decryptDm(group.groupPrivkey, event.pubkey, event.content);
        const payload = JSON.parse(plaintext);

        void putRawEvent(event, "group", {
          groupId,
          type: payload.type || GROUP_MESSAGE_TYPE,
        }).catch(() => {});

        const msg = {
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
        await indexGroupMessage(msg);
        messages.push(msg);
        if (msg.ts > group.lastMessageTs) {
          group.lastMessageTs = msg.ts;
        }
      } catch {}
    }
    await putStoredGroup(group);

    return { group, messages: messages.sort((a, b) => a.ts - b.ts) };
  },

  async acceptInvite(identity, groupPrivkey) {
    const groupPubkey = getPublicKey(hexToBytes(groupPrivkey));
    const existing = await getStoredGroup(groupPubkey);
    if (existing && !existing.isRemoved) return existing;

    const roster = await getRoster(groupPubkey, groupPrivkey).catch(() => null);

    const groupRecord = {
      groupId: groupPubkey,
      groupPrivkey: groupPrivkey,
      name: roster?.name || "Unnamed Group",
      description: roster?.description || "",
      members: roster?.members || [],
      admins: roster?.createdBy ? [roster.createdBy] : [],
      createdBy: roster?.createdBy || "",
      createdAt: roster?.createdAt || Date.now(),
      updatedAt: roster?.createdAt || Date.now(),
      lastMessageTs: roster?.createdAt || Date.now(),
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

    // Scan for missed group invites
    const events = await query({
      kinds: [4],
      "#p": [identity.pubkeyHex],
      limit: 100,
    });
    for (const event of events) {
      try {
        const plaintext = await decryptDm(identity.privkeyHex, event.pubkey, event.content);
        const payload = JSON.parse(plaintext);
        if (payload.type === "group-invite" && payload.privkey) {
          await groupsApi.acceptInvite(identity, payload.privkey).catch(() => null);
        }
      } catch {}
    }
  },

  async loadOlderGroupMessages(identity, groupId, untilMs) {
    return { messages: [], hasMore: false }; 
  },

  async sendGroupMessage(identity, groupId, payload) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");

    const messagePayload = {
      type: payload.type || GROUP_MESSAGE_TYPE,
      text: payload.text || "",
      media: payload.media,
      replyTo: payload.replyTo,
      emoji: payload.emoji,
      ts: Date.now(),
    };

    const { id, publish } = await api.prepareDirectMessage(
      identity.privkeyHex,
      groupId,
      messagePayload,
    );
    await publish();

    const msg = {
      id,
      groupId,
      sender: identity.pubkeyHex,
      ...messagePayload,
    };
    group.lastMessageTs = msg.ts;
    await putStoredGroup(group);

    return msg;
  },

  subscribeGroupMessages(identity, groupId, observer, sinceMs = Date.now()) {
    const since = Math.floor(sinceMs / 1000);
    return subscribe(
      null,
      { kinds: [4], "#p": [groupId], since },
      {
        async next(event) {
          if (event.pubkey === groupId) return;
          const group = await getStoredGroup(groupId);
          if (!group) return;
          try {
            const plaintext = await decryptDm(group.groupPrivkey, event.pubkey, event.content);
            const payload = JSON.parse(plaintext);
            const msg = {
              id: event.id,
              groupId,
              sender: event.pubkey,
              type: payload.type || GROUP_MESSAGE_TYPE,
              text: payload.text || "",
              media: payload.media,
              ts: event.created_at * 1000,
              replyTo: payload.replyTo,
              emoji: payload.emoji,
            };
            void putRawEvent(event, "group", {
              groupId,
              type: payload.type || GROUP_MESSAGE_TYPE,
            }).catch(() => {});
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
      const groupIds = groups.map((g) => g.groupId);
      if (!groupIds.length) return;

      sub = subscribe(
        null,
        { kinds: [4], "#p": groupIds, since },
        {
          async next(event) {
            const groupId = event.tags.find((t) => t[0] === "p")?.[1];
            if (!groupId || event.pubkey === groupId) return;

            const group = await getStoredGroup(groupId);
            if (!group) return;

            try {
              const plaintext = await decryptDm(group.groupPrivkey, event.pubkey, event.content);
              const payload = JSON.parse(plaintext);
              const msg = {
                id: event.id,
                groupId,
                sender: event.pubkey,
                type: payload.type || GROUP_MESSAGE_TYPE,
                text: payload.text || "",
                media: payload.media,
                ts: event.created_at * 1000,
                replyTo: payload.replyTo,
                emoji: payload.emoji,
              };
              void putRawEvent(event, "group", {
                groupId,
                type: payload.type || GROUP_MESSAGE_TYPE,
              }).catch(() => {});
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

    const roster = {
      type: GROUP_ROSTER_TYPE,
      name: patch.name !== undefined ? patch.name : group.name,
      description: patch.description !== undefined ? patch.description : group.description,
      members: group.members,
      createdBy: group.createdBy,
      createdAt: group.createdAt,
    };

    const content = await encryptDm(group.groupPrivkey, groupId, JSON.stringify(roster));
    const rosterEvent = finalizeEvent(
      {
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", groupId]],
        content,
      },
      hexToBytes(group.groupPrivkey),
    );
    await publishToRelays(getKnownRelays(), rosterEvent);

    group.name = roster.name;
    group.description = roster.description;
    group.updatedAt = Date.now();
    await putStoredGroup(group);
    return group;
  },

  async addMembers(identity, groupId, memberPubkeys) {
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");

    const newMembers = ensureArray(memberPubkeys).filter((p) => !group.members.includes(p));
    if (!newMembers.length) return group;

    group.members.push(...newMembers);

    const roster = {
      type: GROUP_ROSTER_TYPE,
      name: group.name,
      description: group.description,
      members: group.members,
      createdBy: group.createdBy,
      createdAt: group.createdAt,
    };

    const content = await encryptDm(group.groupPrivkey, groupId, JSON.stringify(roster));
    const rosterEvent = finalizeEvent(
      {
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", groupId]],
        content,
      },
      hexToBytes(group.groupPrivkey),
    );
    await publishToRelays(getKnownRelays(), rosterEvent);

    for (const member of newMembers) {
      const privkey = identity.privkeyHex;
      const groupPrivkey = group.groupPrivkey;
      enqueueSend({
        id: `group-invite:${groupId}:${member}`,
        meta: { kind: "group-admin", conversationId: `group:${groupId}` },
        fn: () =>
          api.postDirectMessage(privkey, member, {
            type: "group-invite",
            privkey: groupPrivkey,
          }),
        onFailed() {},
      });
    }

    group.updatedAt = Date.now();
    await putStoredGroup(group);
    return group;
  },

  async removeMember(identity, groupId, pubkeyToRemove) {
    
    const group = await getStoredGroup(groupId);
    if (!group) throw new Error("Group not found");

    const nextMembers = group.members.filter((p) => p !== pubkeyToRemove);

    
    const newKp = generateKeypair();
    const newGroupId = newKp.pubkeyHex;

    
    const roster = {
      type: GROUP_ROSTER_TYPE,
      name: group.name,
      description: group.description,
      members: nextMembers,
      createdBy: group.createdBy,
      createdAt: group.createdAt,
    };
    const content = await encryptDm(newKp.privkeyHex, newGroupId, JSON.stringify(roster));
    const rosterEvent = finalizeEvent(
      {
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", newGroupId]],
        content,
      },
      hexToBytes(newKp.privkeyHex),
    );
    await publishToRelays(getKnownRelays(), rosterEvent);

    
    for (const member of nextMembers) {
      if (member !== identity.pubkeyHex) {
        const privkey = identity.privkeyHex;
        const newPrivkey = newKp.privkeyHex;
        enqueueSend({
          id: `group-invite:${newGroupId}:${member}`,
          meta: { kind: "group-admin", conversationId: `group:${newGroupId}` },
          fn: () =>
            api.postDirectMessage(privkey, member, {
              type: "group-invite",
              privkey: newPrivkey,
            }),
          onFailed() {},
        });
      }
    }

    
    group.isRemoved = true;
    await putStoredGroup(group);

    
    const newGroupRecord = {
      ...group,
      groupId: newGroupId,
      groupPrivkey: newKp.privkeyHex,
      members: nextMembers,
      isRemoved: false,
      updatedAt: Date.now(),
    };
    await putStoredGroup(newGroupRecord);
    return newGroupRecord;
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
