import { hexToBytes } from "@noble/hashes/utils.js";
import { unwrapEvent as unwrapPrivateEvent } from "nostr-tools/nip59";

import { api, getKnownRelays } from "./api";
import { normalizeNostrPubkey } from "./crypto";
import { playMessageSound } from "./notifications";
import {
  getStoredGroup,
  getStoredGroupMessage,
  listStoredGroupMessages,
  listStoredGroups,
  putStoredGroup,
  putStoredGroupMessage,
} from "./idb";

const GROUP_SUBJECT = "gupt-group";
const GROUP_NAMESPACE = "gupt-group/v2";
const PRIVATE_INBOX_LIMIT = 5000;

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniquePubkeys(pubkeys) {
  return [
    ...new Set(
      ensureArray(pubkeys)
        .map((entry) => normalizeNostrPubkey(entry))
        .filter(Boolean),
    ),
  ];
}

function uniqueRelays(relays) {
  return [
    ...new Set(
      ensureArray(relays)
        .map((relay) => String(relay || "").trim())
        .filter(Boolean),
    ),
  ];
}

function randomHex(byteLength = 16) {
  return [...crypto.getRandomValues(new Uint8Array(byteLength))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createContext(identity) {
  identity.init();
  const pubkey = normalizeNostrPubkey(identity.pubkeyHex);
  if (!identity.privkeyHex || !pubkey) {
    throw new Error("Identity not initialized");
  }

  return {
    privkeyHex: identity.privkeyHex,
    privkeyBytes: hexToBytes(identity.privkeyHex),
    pubkey,
  };
}

function sanitizeEpochRecord(epoch) {
  const epochNumber = Math.max(1, Number(epoch?.epoch || epoch?.epochNumber || 0));
  const activatedAt = Math.max(0, Number(epoch?.activatedAt || epoch?.rotatedAt || Date.now()));
  const admins = uniquePubkeys(epoch?.admins);
  const members = uniquePubkeys([...(epoch?.members || []), ...admins]);

  return {
    epoch: epochNumber,
    activatedAt,
    admins,
    members,
    rotatedBy: normalizeNostrPubkey(epoch?.rotatedBy) || admins[0] || members[0] || "",
    reason: String(epoch?.reason || ""),
  };
}

function mergeEpochRecords(...entries) {
  const byEpoch = new Map();

  for (const entry of entries.flat()) {
    if (!entry) continue;
    const normalized = sanitizeEpochRecord(entry);
    const existing = byEpoch.get(normalized.epoch);
    if (!existing) {
      byEpoch.set(normalized.epoch, normalized);
      continue;
    }

    byEpoch.set(normalized.epoch, {
      epoch: normalized.epoch,
      activatedAt: Math.max(existing.activatedAt, normalized.activatedAt),
      admins: uniquePubkeys([...(existing.admins || []), ...(normalized.admins || [])]),
      members: uniquePubkeys([...(existing.members || []), ...(normalized.members || [])]),
      rotatedBy: normalized.rotatedBy || existing.rotatedBy,
      reason: normalized.reason || existing.reason,
    });
  }

  return [...byEpoch.values()].sort((left, right) => left.epoch - right.epoch);
}

function sanitizeGroupRecord(group) {
  const groupId = String(group?.groupId || "").trim();
  if (!groupId) throw new Error("Missing group ID");

  const epochs = mergeEpochRecords(group?.epochs || []);
  const latestEpoch = epochs.at(-1) || null;
  const currentEpoch = Math.max(
    Number(group?.currentEpoch || 0),
    Number(latestEpoch?.epoch || 0),
    1,
  );
  const currentEpochRecord = epochs.find((entry) => entry.epoch === currentEpoch) || latestEpoch;

  const admins = uniquePubkeys(currentEpochRecord?.admins || group?.admins);
  const members = uniquePubkeys([
    ...(currentEpochRecord?.members || group?.members || []),
    ...admins,
  ]);
  const relays = uniqueRelays(group?.relays);
  const createdAt = Math.max(
    0,
    Number(group?.createdAt || currentEpochRecord?.activatedAt || Date.now()),
  );
  const updatedAt = Math.max(
    Number(group?.updatedAt || 0),
    Number(currentEpochRecord?.activatedAt || 0),
    createdAt,
  );
  const lastMessageTs = Math.max(Number(group?.lastMessageTs || 0), 0);
  const removedAt = Math.max(Number(group?.removedAt || 0), 0);

  return {
    groupId,
    name: String(group?.name || "Unnamed group"),
    description: String(group?.description || ""),
    admins,
    members,
    relays: relays.length ? relays : getKnownRelays(),
    createdBy: normalizeNostrPubkey(group?.createdBy) || admins[0] || members[0] || "",
    createdAt,
    updatedAt,
    lastMessageTs,
    currentEpoch,
    epochs,
    removedAt,
    removedBy: normalizeNostrPubkey(group?.removedBy) || "",
    removedEpoch: Math.max(Number(group?.removedEpoch || 0), removedAt ? currentEpoch : 0),
  };
}

function mergeGroupRecords(existing, incoming) {
  if (!existing) return sanitizeGroupRecord(incoming);

  const nextCurrentEpoch = Math.max(
    Number(existing.currentEpoch || 0),
    Number(incoming?.currentEpoch || 0),
  );
  const nextEpochs = mergeEpochRecords(existing.epochs || [], incoming?.epochs || []);
  const nextRemovedEpoch = Math.max(
    Number(existing.removedEpoch || 0),
    Number(incoming?.removedEpoch || 0),
  );
  const incomingRemovedAt = Math.max(Number(incoming?.removedAt || 0), 0);
  const incomingSnapshotEpoch = Math.max(
    Number(incoming?.currentEpoch || 0),
    Number(incoming?.epochs?.at?.(-1)?.epoch || 0),
  );
  const incomingHasMembershipSnapshot = Boolean(
    incomingSnapshotEpoch &&
    (ensureArray(incoming?.epochs).length ||
      ensureArray(incoming?.members).length ||
      ensureArray(incoming?.admins).length),
  );
  const shouldClearRemoval =
    !incomingRemovedAt &&
    incomingHasMembershipSnapshot &&
    incomingSnapshotEpoch >= Number(existing.removedEpoch || 0);

  return sanitizeGroupRecord({
    ...existing,
    ...incoming,
    groupId: existing.groupId,
    name: incoming?.name || existing.name,
    description:
      typeof incoming?.description === "string" ? incoming.description : existing.description,
    relays: uniqueRelays([...(existing.relays || []), ...(incoming?.relays || [])]),
    createdAt: Math.min(
      Number(existing.createdAt || Date.now()),
      Number(incoming?.createdAt || existing.createdAt || Date.now()),
    ),
    updatedAt: Math.max(
      Number(existing.updatedAt || 0),
      Number(incoming?.updatedAt || 0),
      Date.now(),
    ),
    lastMessageTs: Math.max(
      Number(existing.lastMessageTs || 0),
      Number(incoming?.lastMessageTs || 0),
    ),
    currentEpoch: nextCurrentEpoch,
    epochs: nextEpochs,
    removedAt: shouldClearRemoval
      ? 0
      : Math.max(Number(existing.removedAt || 0), incomingRemovedAt),
    removedBy: shouldClearRemoval
      ? ""
      : normalizeNostrPubkey(incoming?.removedBy) || existing.removedBy || "",
    removedEpoch: shouldClearRemoval ? 0 : nextRemovedEpoch,
  });
}

async function getGroupRecord(groupId) {
  const record = await getStoredGroup(groupId);
  return record ? sanitizeGroupRecord(record) : null;
}

async function putGroupRecord(group) {
  const existing = await getGroupRecord(group.groupId);
  const next = mergeGroupRecords(existing, group);
  await putStoredGroup(next);
  return next;
}

async function listGroupRecords() {
  return (await listStoredGroups())
    .filter(Boolean)
    .map(sanitizeGroupRecord)
    .sort(
      (left, right) =>
        right.lastMessageTs - left.lastMessageTs ||
        right.updatedAt - left.updatedAt ||
        left.name.localeCompare(right.name),
    );
}

async function touchGroup(groupId, patch = {}) {
  const group = await getGroupRecord(groupId);
  if (!group) return null;
  return await putGroupRecord({
    ...group,
    ...patch,
    updatedAt: Math.max(Date.now(), Number(patch.updatedAt || 0), Number(group.updatedAt || 0)),
    lastMessageTs: Math.max(Number(group.lastMessageTs || 0), Number(patch.lastMessageTs || 0)),
  });
}

function sanitizeGroupMessage(message) {
  const groupId = String(message?.groupId || "").trim();
  const id = String(message?.id || message?.clientMsgId || "").trim();
  const sender = normalizeNostrPubkey(message?.sender || message?.senderPubkey);
  if (!groupId || !id || !sender) return null;

  const wrapId = String(message?.wrapId || message?.eventId || "").trim();

  return {
    id,
    ...(wrapId ? { wrapId } : {}),
    groupId,
    sender,
    epoch: Math.max(1, Number(message?.epoch || 1)),
    type: String(message?.type || message?.messageType || "text"),
    text: String(message?.text || ""),
    ts: Number(message?.ts || Date.now()),
    media: message?.media
      ? {
          key: String(message.media?.key || ""),
          nonce: String(message.media?.nonce || ""),
          mime: String(message.media?.mime || ""),
          name: String(message.media?.name || ""),
          size: Number(message.media?.size || 0),
          locations: Array.isArray(message.media?.locations)
            ? message.media.locations.map((l) => ({
                type: String(l?.type || ""),
                url: String(l?.url || ""),
                cid: String(l?.cid || ""),
                sha256: String(l?.sha256 || ""),
                server: String(l?.server || ""),
              }))
            : [],
        }
      : null,
    durationMs: Number(message?.durationMs || 0),
    replyTo: message?.replyTo ? String(message.replyTo) : undefined,
    replyExcerpt: message?.replyExcerpt ? String(message.replyExcerpt) : undefined,
    emoji: message?.emoji ? String(message.emoji) : undefined,
  };
}

async function putGroupMessage(message) {
  const next = sanitizeGroupMessage(message);
  if (!next) return null;

  const existing = await getStoredGroupMessage(next.groupId, next.id);
  if (!existing) {
    await putStoredGroupMessage(next);
    await touchGroup(next.groupId, { lastMessageTs: next.ts });
    return next;
  }

  const wrapId = next.wrapId || existing.wrapId;
  if (wrapId && wrapId !== existing.wrapId) {
    await putStoredGroupMessage({ ...existing, ...next, wrapId });
  }

  await touchGroup(next.groupId, { lastMessageTs: next.ts });
  // Return null for already-cached messages so callers can detect truly new ones
  return null;
}

async function listGroupMessages(groupId) {
  return (await listStoredGroupMessages(groupId))
    .filter(Boolean)
    .map(sanitizeGroupMessage)
    .filter(Boolean)
    .sort((left, right) => left.ts - right.ts || left.id.localeCompare(right.id));
}

function toGroupSummary(group) {
  return {
    groupId: group.groupId,
    nostrGroupId: group.groupId,
    name: group.name,
    description: group.description,
    relays: group.relays,
    admins: group.admins,
    members: group.members,
    memberCount: group.members.length,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    currentEpoch: group.currentEpoch,
    removedAt: group.removedAt,
    removedEpoch: group.removedEpoch,
    isRemoved: Boolean(group.removedAt),
  };
}

function normalizeInviteTarget(invitee) {
  if (typeof invitee === "string") {
    const pubkey = normalizeNostrPubkey(invitee);
    if (!pubkey) throw new Error("Enter a valid Nostr public key.");
    return { pubkey };
  }

  const pubkey = normalizeNostrPubkey(invitee?.pubkey || invitee?.senderPubkey);
  if (!pubkey) throw new Error("Enter a valid Nostr public key.");
  return {
    pubkey,
    relays: uniqueRelays(invitee?.relays),
  };
}

function normalizeOutgoingMessagePayload(payload) {
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) throw new Error("Message cannot be empty.");
    return { type: "text", text };
  }

  const messageType = String(payload?.type || "text");

  // Reply/like metadata — passed through on any type that supports it
  const replyMeta = {};
  if (payload?.replyTo) replyMeta.replyTo = String(payload.replyTo);
  if (payload?.replyExcerpt) replyMeta.replyExcerpt = String(payload.replyExcerpt);

  if (messageType === "like") {
    if (!payload?.replyTo) throw new Error("Like must reference a message.");
    return { type: "like", text: "", ...replyMeta };
  }

  if (messageType === "react") {
    if (!payload?.replyTo) throw new Error("Reaction must reference a message.");
    const emoji = String(payload?.emoji || "❤️").trim();
    if (!emoji) throw new Error("Reaction must include an emoji.");
    return { type: "react", text: "", emoji, ...replyMeta };
  }

  if (messageType === "text") {
    const text = String(payload?.text || "").trim();
    if (!text) throw new Error("Message cannot be empty.");
    return { type: "text", text, ...replyMeta };
  }

  if (messageType === "media" || messageType === "voice") {
    // Require the new `media` object shape.
    const mediaObj = payload?.media;
    if (!mediaObj || typeof mediaObj !== "object")
      throw new Error("Missing media object for media message.");
    const firstLoc =
      Array.isArray(mediaObj.locations) && mediaObj.locations.length ? mediaObj.locations[0] : null;
    return {
      type: messageType,
      text: String(payload?.text || mediaObj?.name || ""),
      media: {
        key: String(mediaObj?.key || ""),
        nonce: String(mediaObj?.nonce || ""),
        mime: String(mediaObj?.mime || "application/octet-stream"),
        name: String(mediaObj?.name || "Attachment"),
        size: Number(mediaObj?.size || 0),
        locations: Array.isArray(mediaObj.locations)
          ? mediaObj.locations.map((l) => ({
              type: String(l?.type || ""),
              url: String(l?.url || ""),
              cid: String(l?.cid || ""),
              sha256: String(l?.sha256 || ""),
              server: String(l?.server || ""),
            }))
          : [],
      },
      durationMs: Number(payload?.durationMs || 0),
      ...replyMeta,
    };
  }

  throw new Error("Unsupported group message type.");
}

function buildGroupEnvelope(type, payload = {}) {
  return JSON.stringify({
    namespace: GROUP_NAMESPACE,
    type,
    ...payload,
  });
}

function parseGroupEnvelope(content) {
  const payload = JSON.parse(content);
  if (payload?.namespace !== GROUP_NAMESPACE) return null;
  return payload;
}

function decodeWrappedEnvelope(context, event) {
  try {
    const rumor = unwrapPrivateEvent(event, context.privkeyBytes);
    const subject = rumor.tags.find((tag) => tag[0] === "subject")?.[1] || "";
    if (subject !== GROUP_SUBJECT) return null;

    const payload = parseGroupEnvelope(rumor.content);
    if (!payload?.groupId) return null;

    return {
      wrapId: event.id,
      wrapCreatedAt: Number(event.created_at || 0) * 1000,
      sender: normalizeNostrPubkey(rumor.pubkey),
      payload,
    };
  } catch {
    return null;
  }
}

function buildSnapshotPayload(group, { epoch, members, admins, reason, rotatedBy, rotatedAt }) {
  return {
    groupId: group.groupId,
    name: group.name,
    description: group.description,
    relays: group.relays,
    createdBy: group.createdBy,
    createdAt: group.createdAt,
    epoch,
    members,
    admins,
    reason,
    rotatedBy,
    rotatedAt,
  };
}

async function applySnapshotEnvelope(envelope) {
  const payload = envelope.payload;
  const existing = await getGroupRecord(payload.groupId);
  const epochRecord = sanitizeEpochRecord({
    epoch: payload.epoch,
    admins: payload.admins,
    members: payload.members,
    rotatedBy: payload.rotatedBy || envelope.sender,
    rotatedAt: payload.rotatedAt || envelope.wrapCreatedAt,
    reason: payload.reason,
  });

  return await putGroupRecord({
    ...(existing || {}),
    groupId: payload.groupId,
    name: String(payload.name || existing?.name || "Unnamed group"),
    description: String(payload.description || existing?.description || ""),
    admins: epochRecord.admins,
    members: epochRecord.members,
    relays: uniqueRelays([...(existing?.relays || []), ...(payload.relays || [])]),
    createdBy:
      normalizeNostrPubkey(payload.createdBy) || existing?.createdBy || envelope.sender || "",
    createdAt: Math.min(
      Number(existing?.createdAt || payload.createdAt || epochRecord.activatedAt),
      Number(payload.createdAt || existing?.createdAt || epochRecord.activatedAt),
    ),
    updatedAt: Math.max(
      Number(existing?.updatedAt || 0),
      epochRecord.activatedAt,
      envelope.wrapCreatedAt,
    ),
    lastMessageTs: Number(existing?.lastMessageTs || 0),
    currentEpoch: epochRecord.epoch,
    epochs: mergeEpochRecords(existing?.epochs || [], [epochRecord]),
    removedAt: 0,
    removedBy: "",
    removedEpoch: 0,
  });
}

async function applyRemovalEnvelope(envelope, recipientPubkey = "") {
  const payload = envelope.payload;
  const existing = await getGroupRecord(payload.groupId);
  const normalizedRecipient = normalizeNostrPubkey(recipientPubkey);
  const nextMembers = normalizedRecipient
    ? ensureArray(existing?.members).filter((pubkey) => pubkey !== normalizedRecipient)
    : ensureArray(existing?.members);
  const nextAdmins = normalizedRecipient
    ? ensureArray(existing?.admins).filter((pubkey) => pubkey !== normalizedRecipient)
    : ensureArray(existing?.admins);

  return await putGroupRecord({
    ...(existing || {}),
    groupId: payload.groupId,
    name: String(payload.name || existing?.name || "Unnamed group"),
    description: String(payload.description || existing?.description || ""),
    admins: nextAdmins,
    members: nextMembers,
    relays: uniqueRelays([...(existing?.relays || []), ...(payload.relays || [])]),
    createdBy: normalizeNostrPubkey(payload.createdBy) || existing?.createdBy || "",
    createdAt: Number(existing?.createdAt || payload.createdAt || envelope.wrapCreatedAt),
    updatedAt: Math.max(
      Number(existing?.updatedAt || 0),
      Number(payload.removedAt || envelope.wrapCreatedAt),
      envelope.wrapCreatedAt,
    ),
    currentEpoch: Math.max(Number(existing?.currentEpoch || 0), Number(payload.removedEpoch || 0)),
    removedAt: Math.max(
      Number(existing?.removedAt || 0),
      Number(payload.removedAt || envelope.wrapCreatedAt),
    ),
    removedBy:
      normalizeNostrPubkey(payload.removedBy) || envelope.sender || existing?.removedBy || "",
    removedEpoch: Math.max(Number(existing?.removedEpoch || 0), Number(payload.removedEpoch || 0)),
  });
}

async function persistMessageEnvelope(envelope) {
  const payload = envelope.payload;
  const group = await getGroupRecord(payload.groupId);
  if (!group) return null;

  const sender = normalizeNostrPubkey(payload.sender || envelope.sender);
  const epoch = Math.max(1, Number(payload.epoch || 1));
  const epochRecord = group.epochs.find((entry) => entry.epoch === epoch);
  if (!sender || !epochRecord || !epochRecord.members.includes(sender)) {
    return null;
  }

  return await putGroupMessage({
    id: payload.clientMsgId,
    wrapId: envelope.wrapId,
    groupId: payload.groupId,
    sender,
    epoch,
    type: payload.messageType || payload.type || "text",
    text: payload.text || "",
    ts: Number(payload.ts || envelope.wrapCreatedAt || Date.now()),
    mediaCid: payload.mediaCid || "",
    mediaUrl: payload.mediaUrl || "",
    mediaKey: payload.mediaKey || "",
    mediaNonce: payload.mediaNonce || "",
    mediaMime: payload.mediaMime || "",
    mediaName: payload.mediaName || "",
    mediaSize: payload.mediaSize || 0,
    durationMs: payload.durationMs || 0,
    replyTo: payload.replyTo || undefined,
    replyExcerpt: payload.replyExcerpt || undefined,
    emoji: payload.emoji || undefined,
    rawPayload: payload,
  });
}

async function processEnvelope(envelope, recipientPubkey = "") {
  switch (String(envelope.payload?.type || "")) {
    case "group-snapshot":
      await applySnapshotEnvelope(envelope);
      return null;
    case "group-removed":
      await applyRemovalEnvelope(envelope, recipientPubkey);
      return null;
    case "group-message":
      return await persistMessageEnvelope(envelope);
    default:
      return null;
  }
}

function envelopePriority(envelope) {
  switch (String(envelope.payload?.type || "")) {
    case "group-snapshot":
      return 0;
    case "group-removed":
      return 1;
    case "group-message":
      return 2;
    default:
      return 3;
  }
}

async function syncPrivateGroupInbox(context, { groupId = "" } = {}) {
  const wrappedEvents = await api
    .queryPrivateInbox(context.pubkey, {
      limit: PRIVATE_INBOX_LIMIT,
    })
    .catch(() => []);

  const decoded = wrappedEvents
    .map((event) => decodeWrappedEnvelope(context, event))
    .filter(Boolean)
    .filter((entry) => !groupId || entry.payload.groupId === groupId)
    .sort((left, right) => {
      const leftEpoch = Number(left.payload.epoch || left.payload.removedEpoch || 0);
      const rightEpoch = Number(right.payload.epoch || right.payload.removedEpoch || 0);
      return (
        leftEpoch - rightEpoch ||
        envelopePriority(left) - envelopePriority(right) ||
        left.wrapCreatedAt - right.wrapCreatedAt ||
        left.wrapId.localeCompare(right.wrapId)
      );
    });

  const newRows = [];
  for (const envelope of decoded) {
    const row = await processEnvelope(envelope, context.pubkey);
    if (row) newRows.push(row);
  }

  return newRows;
}

async function publishGroupEnvelope(context, recipients, payload, relays, options = {}) {
  return await api.publishPrivateEnvelopeBatch(
    context.privkeyHex,
    uniquePubkeys(recipients).filter((pubkey) => pubkey !== context.pubkey),
    buildGroupEnvelope(payload.type, payload),
    GROUP_SUBJECT,
    uniqueRelays(relays),
    options,
  );
}

async function publishGroupSnapshot(context, group, { members, admins, epoch, reason }) {
  const rotatedAt = Date.now();
  const payload = buildSnapshotPayload(group, {
    epoch,
    members,
    admins,
    reason,
    rotatedBy: context.pubkey,
    rotatedAt,
  });

  await publishGroupEnvelope(
    context,
    members,
    {
      type: "group-snapshot",
      ...payload,
    },
    group.relays,
  );

  return await applySnapshotEnvelope({
    wrapId: `local-snapshot:${group.groupId}:${epoch}`,
    wrapCreatedAt: rotatedAt,
    sender: context.pubkey,
    payload: {
      type: "group-snapshot",
      ...payload,
    },
  });
}

async function publishRemovalNotice(context, group, removedPubkey, removedEpoch) {
  const removedAt = Date.now();
  await publishGroupEnvelope(
    context,
    [removedPubkey],
    {
      type: "group-removed",
      groupId: group.groupId,
      name: group.name,
      description: group.description,
      relays: group.relays,
      createdBy: group.createdBy,
      createdAt: group.createdAt,
      removedEpoch,
      removedAt,
      removedBy: context.pubkey,
    },
    group.relays,
    { includeSelf: false },
  );
}

function ensureAdmin(group, pubkey) {
  if (!group.admins.includes(pubkey)) {
    throw new Error("Only group admins can do that.");
  }
}

function ensureActiveMember(group, pubkey) {
  if (group.removedAt && !group.members.includes(pubkey)) {
    throw new Error("You are no longer a member of this group.");
  }
  if (!group.members.includes(pubkey)) {
    throw new Error("You are not a member of this group.");
  }
}

function buildGroupDraft(group, patch = {}) {
  return sanitizeGroupRecord({
    ...group,
    ...patch,
    relays: uniqueRelays([...(group?.relays || []), ...(patch?.relays || []), ...getKnownRelays()]),
  });
}

export const groupsApi = {
  async prepareIdentity(identity) {
    const context = createContext(identity);
    return {
      pubkey: context.pubkey,
      relays: getKnownRelays(),
    };
  },

  async listGroups(identity) {
    const context = createContext(identity);
    await syncPrivateGroupInbox(context);
    const groups = await listGroupRecords();
    return groups.map(toGroupSummary);
  },

  async createGroup(identity, { name, description, memberPubkeys = [] }) {
    const context = createContext(identity);
    const trimmedName = String(name || "").trim();
    if (!trimmedName) throw new Error("Enter a group name.");

    const now = Date.now();
    const members = uniquePubkeys([context.pubkey, ...ensureArray(memberPubkeys)]);
    const admins = [context.pubkey];
    const draft = buildGroupDraft({
      groupId: randomHex(16),
      name: trimmedName,
      description: String(description || "").trim(),
      admins,
      members,
      relays: getKnownRelays(),
      createdBy: context.pubkey,
      createdAt: now,
      updatedAt: now,
      lastMessageTs: 0,
      currentEpoch: 1,
      epochs: [
        {
          epoch: 1,
          activatedAt: now,
          admins,
          members,
          rotatedBy: context.pubkey,
          reason: "create",
        },
      ],
    });

    const group = await publishGroupSnapshot(context, draft, {
      members,
      admins,
      epoch: 1,
      reason: "create",
    });

    return toGroupSummary(group);
  },

  async getGroup(identity, groupId) {
    const context = createContext(identity);
    await syncPrivateGroupInbox(context, { groupId });
    const group = await getGroupRecord(groupId);
    if (!group) throw new Error("Group not found");
    return toGroupSummary(group);
  },

  async syncGroup(identity, groupId) {
    const context = createContext(identity);
    await syncPrivateGroupInbox(context, { groupId });
    const group = await getGroupRecord(groupId);
    if (!group) throw new Error("Group not found");

    return {
      group: toGroupSummary(group),
      messages: await listGroupMessages(groupId),
    };
  },

  async loadOlderGroupMessages(identity, groupId, _untilMs) {
    const context = createContext(identity);
    const beforeCount = (await listGroupMessages(groupId)).length;
    await syncPrivateGroupInbox(context, { groupId });
    const messages = await listGroupMessages(groupId);
    return { messages, hasMore: messages.length > beforeCount };
  },

  async sendGroupMessage(identity, groupId, payload) {
    const context = createContext(identity);
    const group = await getGroupRecord(groupId);
    if (!group) throw new Error("Group not found");
    ensureActiveMember(group, context.pubkey);

    const normalizedPayload = normalizeOutgoingMessagePayload(payload);
    const ts = Date.now();
    const clientMsgId = randomHex(16);

    const wrappedEvents = await publishGroupEnvelope(
      context,
      group.members,
      {
        type: "group-message",
        groupId: group.groupId,
        epoch: group.currentEpoch,
        clientMsgId,
        ts,
        sender: context.pubkey,
        messageType: normalizedPayload.type,
        text: normalizedPayload.text,
        media: normalizedPayload.media || null,
        durationMs: normalizedPayload.durationMs || 0,
        replyTo: normalizedPayload.replyTo || undefined,
        replyExcerpt: normalizedPayload.replyExcerpt || undefined,
        emoji: normalizedPayload.emoji || undefined,
      },
      group.relays,
    );

    const selfWrap =
      wrappedEvents.find(
        (event) => event.tags.find((tag) => tag[0] === "p")?.[1] === context.pubkey,
      ) || wrappedEvents[0];
    const wrapId = selfWrap?.id || "";

    await putGroupMessage({
      id: clientMsgId,
      wrapId,
      groupId: group.groupId,
      sender: context.pubkey,
      epoch: group.currentEpoch,
      type: normalizedPayload.type,
      text: normalizedPayload.text,
      ts,
      media: normalizedPayload.media,
      durationMs: normalizedPayload.durationMs,
      replyTo: normalizedPayload.replyTo,
      replyExcerpt: normalizedPayload.replyExcerpt,
      emoji: normalizedPayload.emoji,
    });

    await touchGroup(group.groupId, { lastMessageTs: ts, updatedAt: ts });
    return await listGroupMessages(group.groupId);
  },

  async subscribeGroupMessages(identity, groupId, observer) {
    const context = createContext(identity);
    await syncPrivateGroupInbox(context, { groupId });

    return api.subscribePrivateInbox(
      context.pubkey,
      {
        async next(event) {
          const envelope = decodeWrappedEnvelope(context, event);
          if (!envelope || envelope.payload.groupId !== groupId) return;
          try {
            const row = await processEnvelope(envelope, context.pubkey);
            if (row) observer?.next?.(row);
          } catch {
            // Ignore malformed or unauthorized private group envelopes.
          }
        },
        error(error) {
          observer?.error?.(error);
        },
        complete() {
          observer?.complete?.();
        },
      },
      0,
    );
  },

  /**
   * Live subscription that processes EVERY group envelope (snapshot, removal,
   * message) for this identity across all groups. Used by the messenger store
   * to keep the in-memory state instantly fresh.
   *
   * The observer receives:
   *   next(row)             — a new persisted message row (chat content)
   *   metaChanged(groupId)  — group state changed (snapshot/removal applied)
   *   error(err)            — relay error
   *   complete()            — subscription closed
   */
  subscribeAllGroups(identity, observer) {
    const context = createContext(identity);
    return api.subscribePrivateInbox(
      context.pubkey,
      {
        async next(event) {
          const envelope = decodeWrappedEnvelope(context, event);
          if (!envelope) return;
          try {
            const row = await processEnvelope(envelope, context.pubkey);
            if (row) {
              observer?.next?.(row);
            } else if (envelope.payload?.groupId) {
              observer?.metaChanged?.(envelope.payload.groupId);
            }
          } catch {
            // Ignore malformed or unauthorized envelopes.
          }
        },
        error(error) {
          observer?.error?.(error);
        },
        complete() {
          observer?.complete?.();
        },
      },
      0,
    );
  },

  async syncAll(identity, { selfHandle = "" } = {}) {
    const context = createContext(identity);
    const newRows = await syncPrivateGroupInbox(context);
    if (selfHandle) {
      const handle = selfHandle.replace(/\s+/g, "");
      const mentionRe = new RegExp(`@${handle}(?:\\s|$|[^\\w])`, "i");
      for (const row of newRows) {
        if (
          row.type === "text" &&
          row.sender !== context.pubkey &&
          mentionRe.test(row.text || "")
        ) {
          playMessageSound();
          break; // one sound per sync cycle per group is enough
        }
      }
    }
  },

  async inviteToGroup(identity, groupId, invitee) {
    const context = createContext(identity);
    const group = await getGroupRecord(groupId);
    if (!group) throw new Error("Group not found");
    ensureAdmin(group, context.pubkey);

    const target = normalizeInviteTarget(invitee);
    if (group.members.includes(target.pubkey)) {
      return toGroupSummary(group);
    }

    const nextMembers = uniquePubkeys([...group.members, target.pubkey]);
    const nextEpoch = Math.max(Number(group.currentEpoch || 0), 0) + 1;
    const nextGroup = buildGroupDraft(group, {
      members: nextMembers,
      relays: uniqueRelays([...(group.relays || []), ...(target.relays || [])]),
      currentEpoch: nextEpoch,
      updatedAt: Date.now(),
      epochs: mergeEpochRecords(group.epochs || [], [
        {
          epoch: nextEpoch,
          activatedAt: Date.now(),
          admins: group.admins,
          members: nextMembers,
          rotatedBy: context.pubkey,
          reason: "invite",
        },
      ]),
    });

    const updatedGroup = await publishGroupSnapshot(context, nextGroup, {
      members: nextMembers,
      admins: nextGroup.admins,
      epoch: nextEpoch,
      reason: "invite",
    });

    return toGroupSummary(updatedGroup);
  },

  async rotateGroupEpoch(identity, groupId) {
    const context = createContext(identity);
    const group = await getGroupRecord(groupId);
    if (!group) throw new Error("Group not found");
    ensureAdmin(group, context.pubkey);

    const nextEpoch = Math.max(Number(group.currentEpoch || 0), 0) + 1;
    const updatedGroup = await publishGroupSnapshot(
      context,
      buildGroupDraft(group, {
        currentEpoch: nextEpoch,
        updatedAt: Date.now(),
        epochs: mergeEpochRecords(group.epochs || [], [
          {
            epoch: nextEpoch,
            activatedAt: Date.now(),
            admins: group.admins,
            members: group.members,
            rotatedBy: context.pubkey,
            reason: "manual-rotation",
          },
        ]),
      }),
      {
        members: group.members,
        admins: group.admins,
        epoch: nextEpoch,
        reason: "manual-rotation",
      },
    );

    return toGroupSummary(updatedGroup);
  },

  async removeMember(identity, groupId, memberPubkey) {
    const context = createContext(identity);
    const group = await getGroupRecord(groupId);
    if (!group) throw new Error("Group not found");
    ensureAdmin(group, context.pubkey);

    const targetPubkey = normalizeNostrPubkey(memberPubkey);
    if (!targetPubkey || !group.members.includes(targetPubkey)) {
      throw new Error("Member not found in this group.");
    }
    if (targetPubkey === context.pubkey) {
      throw new Error("Use a dedicated leave flow to remove yourself.");
    }

    const nextMembers = group.members.filter((pubkey) => pubkey !== targetPubkey);
    const nextAdmins = group.admins.filter((pubkey) => pubkey !== targetPubkey);
    const effectiveAdmins = nextAdmins.length ? nextAdmins : [context.pubkey];
    const nextEpoch = Math.max(Number(group.currentEpoch || 0), 0) + 1;

    const nextGroup = buildGroupDraft(group, {
      admins: effectiveAdmins,
      members: nextMembers,
      currentEpoch: nextEpoch,
      updatedAt: Date.now(),
      epochs: mergeEpochRecords(group.epochs || [], [
        {
          epoch: nextEpoch,
          activatedAt: Date.now(),
          admins: effectiveAdmins,
          members: nextMembers,
          rotatedBy: context.pubkey,
          reason: "remove-member",
        },
      ]),
    });

    await publishRemovalNotice(context, group, targetPubkey, nextEpoch);
    const updatedGroup = await publishGroupSnapshot(context, nextGroup, {
      members: nextMembers,
      admins: effectiveAdmins,
      epoch: nextEpoch,
      reason: "remove-member",
    });

    return toGroupSummary(updatedGroup);
  },
};
