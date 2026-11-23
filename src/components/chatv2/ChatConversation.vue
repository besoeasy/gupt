<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import CallEventLine from "@/components/chat/CallEventLine.vue";
import CallRequestCard from "@/components/chat/CallRequestCard.vue";
import NewMessagesPill from "@/components/chat/NewMessagesPill.vue";
import LoadOlderButton from "@/components/LoadOlderButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";

import ChatConversationHeader from "@/components/chatv2/ChatConversationHeader.vue";
import ChatConversationInfoDrawer from "@/components/chatv2/ChatConversationInfoDrawer.vue";
import ChatMessageList from "@/components/chatv2/ChatMessageList.vue";
import ChatMessageBubble from "@/components/chatv2/ChatMessageBubble.vue";
import ChatComposeBar from "@/components/chatv2/ChatComposeBar.vue";

import { useChatScroll } from "@/composables/useChatScroll";
import { useConversationCompose } from "@/composables/useConversationCompose";
import { useProfileStore } from "@/stores/profiles";
import { useLastSeen } from "@/composables/useLastSeen";
import { useEnrichedConversation } from "@/composables/useEnrichedConversation";
import { useCallStore } from "@/stores/calls";
import { useCallNavigation } from "@/composables/useCallNavigation";
import { useIdentityStore } from "@/stores/identity";

import {
  withDateSeparators,
  collectMemberReadWatermarks,
  collectMemberSeenAt,
  groupReadReceiptState,
  latestVisibleChatTs,
} from "@/lib/chatListUtils";
import { buildReplyMeta } from "@/lib/chatUtils";
import { CHAT_TIMER_DEFAULT_SEC, chatTimerLabel as formatChatTimer } from "@/lib/chatTimer";
import { formatTimeAgo } from "@/lib/lastSeen";
import { normalizePubkey } from "@/lib/crypto";
import { avatarUrl, groupAvatarUrl } from "@/lib/avatar";
import { groupDisplayName } from "@/lib/groupIdentity";
import { groupsApi } from "@/lib/groups";
import { addPeerContact, getContactForPeer } from "@/lib/contacts";
import { putDecCached } from "@/lib/idb";
import { api } from "@/lib/api";
import { requestEngineSync } from "@/lib/engine";
import { triggerHaptic, HAPTIC } from "@/lib/haptics";
import { getUnhealthyConfiguredRelays } from "@/lib/relay";
import { sendNtfyPing } from "@/lib/ping";
import { messenger } from "@/stores/messenger";
import { startAppSync } from "@/lib/sync";

const props = defineProps({
  conversationType: { type: String, required: true }, // "dm" or "group"
  conversationId: { type: String, required: true }, // roomId or groupId
});

const emit = defineEmits(["back"]);

const identity = useIdentityStore();
const profileStore = useProfileStore();
const { displayName, profilePicture, prefetch } = profileStore;
const initPromise = identity.init().then(() => void startAppSync(identity));

const inputText = ref("");
const templateMode = ref("auto");
const sending = ref(false);
const error = ref("");
const loadingOlder = ref(false);
const hasMoreOlder = ref(true);
const replyingTo = ref(null);
const editingMessage = ref(null);
const drawerOpen = ref(false);

const composeRef = ref(null);
const messageListRef = ref(null);

const {
  unseenCount,
  onScroll,
  scrollToBottomAfterLayout,
  onMessagesUpdated,
  onLayoutResize,
  settleAtBottom,
  captureScrollHeight,
  restoreScrollAfterPrepend,
} = useChatScroll(() => messageListRef.value?.$el ?? null);

const callStore = useCallStore();
const { openCallSurface } = useCallNavigation();

function handleAcceptCallRequest(message) {
  callStore.acceptCallRequest(message);
  void openCallSurface(message.sender);
}

function handleDeclineCallRequest(message) {
  callStore.declineCallRequest(message);
}

// DM vs Group Computation
const isGroup = computed(() => props.conversationType === "group");
const targetId = computed(() => props.conversationId);

const chatTimerSec = computed(() =>
  Number(messenger.chatTimers[targetId.value]?.ttlSec || CHAT_TIMER_DEFAULT_SEC),
);
const chatTimerText = computed(() => formatChatTimer(chatTimerSec.value));

async function updateChatTimer(sec) {
  if (isGroup.value || !targetId.value) return;
  try {
    await messenger.setChatTimer(identity, targetId.value, sec);
    error.value = "";
  } catch (err) {
    error.value = err?.message || "Could not update the message timer.";
  }
}

// Hydration Watcher
watch(
  [targetId, isGroup],
  ([id, grp]) => {
    if (!id) return;
    if (grp) {
      void messenger.hydrateGroup(id);
      messenger.setActiveConversation(id);
      void messenger.markGroupSeen(id);
    } else {
      void messenger.hydrateRoom(id);
      messenger.setActiveConversation(id);
      void messenger.markConversationSeen(id);
    }
  },
  { immediate: true },
);

// DM Room & Peer Info
const roomInfo = computed(() =>
  !isGroup.value ? messenger.roomMeta[targetId.value] || null : null,
);
const rawDmMessages = computed(() =>
  !isGroup.value ? messenger.roomMessages[targetId.value] || [] : [],
);

const peerPubkey = computed(() => {
  if (isGroup.value) return "";
  const fromMeta = roomInfo.value?.peerPubkey ?? "";
  if (fromMeta) return fromMeta;
  const rows = rawDmMessages.value;
  return (
    rows.find((r) => r.peerPubkey)?.peerPubkey ||
    rows.find((r) => !r.mine && r.sender)?.sender ||
    ""
  );
});

const {
  lastSeenLabel,
  loading: lastSeenLoading,
  refresh: refreshLastSeen,
} = useLastSeen(peerPubkey);

const {
  loading: loadingEnrichment,
  relayEventCount,
  lastActivitySec,
  peerBio,
  peerWebsite,
  relayLatencyMs,
  relayNodeId,
  syncParity,
  syncParityLabel,
  refreshEnrichedData,
} = useEnrichedConversation(
  targetId,
  isGroup,
  peerPubkey,
  computed(() => messages.value.length),
);

const groupTitle = computed(() =>
  isGroup.value ? groupDisplayName(targetId.value, Object.keys(messenger.groupMeta)) : "Group",
);

const roomTitle = computed(() => {
  if (isGroup.value) return groupTitle.value;
  return peerPubkey.value ? displayName(peerPubkey.value) : roomInfo.value?.name || "Conversation";
});

// Group Info
const group = computed(() => (isGroup.value ? messenger.groupMeta[targetId.value] || null : null));
const rawGroupMessages = computed(() =>
  isGroup.value ? messenger.groupMessages[targetId.value] || [] : [],
);
const groupAvatarSrc = computed(() =>
  groupAvatarUrl(group.value?.groupId || targetId.value || "group"),
);
const groupMemberCount = computed(() =>
  Number(group.value?.memberCount || group.value?.members?.length || 0),
);
const selfPubkey = computed(() => normalizePubkey(identity.pubkeyHex) || "");

const isActiveMember = computed(() =>
  isGroup.value
    ? Boolean(selfPubkey.value && group.value?.members?.includes(selfPubkey.value)) &&
      !group.value?.removedAt
    : true,
);

watch(
  peerPubkey,
  (pk) => {
    if (!pk || isGroup.value) return;
    void prefetch([pk]);
    void messenger.refreshPeer(pk);
  },
  { immediate: true },
);

// ─── Add to contacts ────────────────────────────────────────────────────────
// A DM is often the first place a key becomes a person. The header offers a
// one-tap save to the encrypted address book and disappears once a contact
// carrying the same public key exists.
const peerContact = ref(null);
const contactSaving = ref(false);
const contactSaved = ref(false);
let contactSavedTimer = null;

async function loadPeerContact() {
  if (isGroup.value || !peerPubkey.value || !identity.pubkeyHex || !identity.privkeyHex) {
    peerContact.value = null;
    return;
  }
  try {
    peerContact.value = await getContactForPeer(
      identity.privkeyHex,
      identity.pubkeyHex,
      peerPubkey.value,
    );
  } catch {
    peerContact.value = null;
  }
}

watch(
  [peerPubkey, () => identity.pubkeyHex, isGroup],
  () => {
    contactSaved.value = false;
    void loadPeerContact();
  },
  { immediate: true },
);

const isPeerContact = computed(() => Boolean(peerContact.value) || contactSaved.value);

async function handleAddContact() {
  if (isPeerContact.value || contactSaving.value) return;
  await initPromise;
  const peer = peerPubkey.value;
  if (!peer) return;
  contactSaving.value = true;
  error.value = "";
  try {
    const saved = await addPeerContact(identity.privkeyHex, identity.pubkeyHex, {
      pubkey: peer,
      name: displayName(peer),
    });
    peerContact.value = saved || null;
    contactSaved.value = true;
    triggerHaptic(HAPTIC.success);
    clearTimeout(contactSavedTimer);
    contactSavedTimer = setTimeout(() => {
      contactSaved.value = false;
    }, 2200);
  } catch (err) {
    error.value = err?.message || "Could not add this contact.";
  } finally {
    contactSaving.value = false;
  }
}

watch(
  () => group.value?.members,
  (members) => {
    if (!isGroup.value || !members?.length) return;
    void prefetch(members);
  },
  { immediate: true },
);

watch(
  () => rawDmMessages.value.filter((row) => !row.mine).length,
  (count, prev) => {
    if (count > (prev || 0)) void refreshLastSeen();
  },
);

const memberSeenAt = computed(() =>
  isGroup.value ? collectMemberSeenAt(rawGroupMessages.value, selfPubkey.value) : new Map(),
);

function memberSeenLabel(pubkey) {
  if (pubkey === selfPubkey.value) return "You";
  const ts = memberSeenAt.value.get(pubkey);
  // Receipts expire after 30 days, so an absent one is "no record", not proof
  // that the member never read.
  if (!ts) return "No recent read";
  return `Seen ${formatTimeAgo(Math.floor(ts / 1000))}`;
}

// Message processing (cached reaction mapping & edits)
const _msgObjCache = new Map();
function _sameReactions(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].emoji !== b[i].emoji || a[i].count !== b[i].count) return false;
  }
  return true;
}

function _sameStringList(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function _cachedMsg(newData) {
  const prev = _msgObjCache.get(newData.id);
  if (
    prev &&
    prev.id === newData.id &&
    prev.type === newData.type &&
    prev.text === newData.text &&
    prev.expiresAt === newData.expiresAt &&
    prev.status === newData.status &&
    prev.readByPeer === newData.readByPeer &&
    prev.readByAll === newData.readByAll &&
    prev.editedAt === newData.editedAt &&
    prev.template === newData.template &&
    prev.ts === newData.ts &&
    prev.mine === newData.mine &&
    prev.sender === newData.sender &&
    prev.replyTo === newData.replyTo &&
    prev.replyExcerpt === newData.replyExcerpt &&
    prev.error === newData.error &&
    _sameReactions(prev.reactions, newData.reactions) &&
    _sameStringList(prev.readBy, newData.readBy) &&
    _sameStringList(prev.readByNames, newData.readByNames) &&
    _sameStringList(prev.unreadByNames, newData.unreadByNames) &&
    _sameStringList(prev.unknownByNames, newData.unknownByNames)
  ) {
    return prev;
  }
  _msgObjCache.set(newData.id, newData);
  return newData;
}

const messages = computed(() => {
  const rows = isGroup.value ? rawGroupMessages.value : rawDmMessages.value;
  const active = [];
  const reactMap = new Map();
  const editMap = new Map();
  const readSet = new Set();
  const memberReadTs = isGroup.value ? collectMemberReadWatermarks(rows, selfPubkey.value) : null;
  const groupMembers = group.value?.members || [];
  // Fallback only: every message is stamped with its own deadline when it is
  // sent, but a row cached before that stamp existed can still be repaired from
  // the timer that was in force when it was written.
  const timer = isGroup.value ? null : messenger.chatTimers[targetId.value];
  const timerFrom = Number(timer?.updatedAt || 0);
  const timerTtlMs = Number(timer?.ttlSec || 0) * 1000;

  for (const row of rows) {
    const kindNum = Number(row.kind ?? row.created_at_kind ?? 0);
    if (kindNum >= 20000 && kindNum <= 29999) continue;
    if (
      row.isEphemeral ||
      row.type === "signal" ||
      row.type === "ping" ||
      row.type === "chat-timer" ||
      row.type === "group-invite"
    )
      continue;
    if (Number(row.expiresAt || 0) > 0 && Number(row.expiresAt) <= Date.now()) continue;

    const emoji = row.type === "like" ? "❤️" : row.type === "react" ? row.emoji || "❤️" : null;
    if (emoji !== null) {
      if (row.replyTo) {
        if (!reactMap.has(row.replyTo)) reactMap.set(row.replyTo, new Map());
        const emojiMap = reactMap.get(row.replyTo);
        const senders = emojiMap.get(emoji) || [];
        if (!senders.includes(row.sender)) emojiMap.set(emoji, [...senders, row.sender]);
      }
    } else if (row.type === "read") {
      if (row.replyTo && !row.mine) readSet.add(row.replyTo);
    } else if (row.type === "edit" && row.replaces) {
      const prev = editMap.get(row.replaces);
      if (!prev || Number(row.ts) > Number(prev.editedAt)) {
        editMap.set(row.replaces, {
          text: row.text,
          editedAt: Number(row.ts),
          ...(row.template !== undefined ? { template: row.template } : {}),
        });
      }
    } else {
      active.push(row);
    }
  }

  let hasSeenRead = false;
  const mapped = [];

  for (let i = active.length - 1; i >= 0; i--) {
    const msg = active[i];
    const edit = editMap.get(msg.id);
    const emojiMap = reactMap.get(msg.id);
    const reactions = emojiMap
      ? [...emojiMap.entries()].map(([em, senders]) => ({ emoji: em, count: senders.length }))
      : undefined;

    if (!isGroup.value && msg.mine && readSet.has(msg.id)) {
      hasSeenRead = true;
    }

    const stampedExpiry = Number(msg.expiresAt || 0);
    const derivedExpiry =
      !stampedExpiry && timerTtlMs > 0 && Number(msg.ts || 0) >= timerFrom
        ? Number(msg.ts) + timerTtlMs
        : 0;

    const groupRead =
      isGroup.value && memberReadTs
        ? groupReadReceiptState(
            msg,
            memberReadTs,
            groupMembers,
            selfPubkey.value,
            displayName,
            true,
          )
        : null;

    mapped.push(
      _cachedMsg({
        ...msg,
        ...(derivedExpiry ? { expiresAt: derivedExpiry } : {}),
        ...(edit ? { text: edit.text, editedAt: edit.editedAt } : {}),
        ...(edit && edit.template !== undefined ? { template: edit.template } : {}),
        ...(reactions ? { reactions } : {}),
        ...(!isGroup.value && msg.mine && hasSeenRead ? { readByPeer: true } : {}),
        ...(groupRead || {}),
      }),
    );
  }

  mapped.reverse();
  return mapped;
});

const PAGE_SIZE = 25;
const displayCount = ref(PAGE_SIZE);

watch(targetId, () => {
  displayCount.value = PAGE_SIZE;
  hasMoreOlder.value = true;
});

const hasMoreLocalOlder = computed(() => messages.value.length > displayCount.value);

const visibleMessages = computed(() => {
  if (messages.value.length <= displayCount.value) {
    return messages.value;
  }
  return messages.value.slice(-displayCount.value);
});

const visibleMessagesWithSeparators = computed(() => withDateSeparators(visibleMessages.value));
const hasMoreToLoad = computed(() => hasMoreLocalOlder.value || hasMoreOlder.value);

const messagesLoading = computed(() => {
  const id = targetId.value;
  if (!id) return false;
  if (isGroup.value) {
    return messenger.hydratingGroups.has(id) && rawGroupMessages.value.length === 0;
  }
  return messenger.hydratingRooms.has(id) && rawDmMessages.value.length === 0;
});
const oldestTs = computed(() =>
  Number(visibleMessages.value[0]?.ts || visibleMessages.value[0]?.created_at || 0),
);

const sentCount = computed(() =>
  !isGroup.value ? messages.value.filter((m) => m.mine).length : 7,
);
const isTrusted = computed(() => (!isGroup.value ? sentCount.value >= 7 : true));

// Compose hook
const {
  uploadLoading,
  uploadStatus,
  cancelUpload,
  isRecording,
  recordingSeconds,
  audioLevels,
  cancelVoiceRecording,
  handleToggleRecording,
  handleFileSelected,
  locationDraft,
  handleRequestLocation,
  setLocationPrecision,
  cancelLocation,
  handleSendLocation,
  downloadMedia,
  retryMedia,
  mediaBlobUrls,
  mediaProgress,
  decryptFailed,
  previewUnsupported,
  preloadMedia,
  setMediaVisible,
  handleMediaDecodeError,
  messageMemoDeps,
  cleanupCompose,
} = useConversationCompose({
  initPromise,
  onError: (msg) => {
    error.value = msg;
  },
  getReplyMeta: () => buildReplyMeta(replyingTo.value),
  clearReply: () => {
    replyingTo.value = null;
  },
  deliverEncryptedPayload: async (payload, { rawBuf, mimeType }) => {
    // Seed the decrypted bytes into the cache and let the normal render path
    // pick them up. Binding the blob URL here instead would skip
    // decryptMediaAttachment entirely, so a sent attachment would render from a
    // private shortcut: no mediaProgress, no key/nonce/blobHash validation, and none
    // of the fetch retry that an attachment received from someone else gets.
    // Seeding makes both directions hit the same cache branch of the pipeline.
    const mime = mimeType || payload?.media?.mime;
    // Await the cache write before rendering: preloadMedia reads it immediately,
    // and a miss would send us back to the relays for bytes already in memory.
    const bindBlob = async (row) => {
      if (!row?.id || !rawBuf) return;
      await putDecCached(row.id, rawBuf, mime);
      preloadMedia(row);
    };

    if (isGroup.value) {
      await messenger.sendGroupMessage(identity, targetId.value, payload, {
        onOptimistic(row) {
          void bindBlob(row);
        },
        onConfirmed(confirmed) {
          void bindBlob(confirmed);
        },
      });
    } else {
      if (!peerPubkey.value) throw new Error("No recipient for this conversation.");
      // The optimistic DM row already carries the confirmed event id, so
      // seeding it here covers the published row too.
      await messenger.sendDirectMessage(identity, peerPubkey.value, payload, {
        onOptimistic(row) {
          void bindBlob(row);
        },
      });
    }
  },
});

// Mentions for groups
const mentionableUsers = computed(() => {
  if (!isGroup.value || !group.value?.members) return [];
  return group.value.members
    .filter((pk) => pk !== selfPubkey.value)
    .map((pk) => ({ pubkey: pk, name: displayName(pk) }))
    .filter((u) => Boolean(u.name));
});

// Call helpers
const callState = computed(() => callStore.callState);
const canStartCall = computed(
  () =>
    Boolean(peerPubkey.value) &&
    isTrusted.value &&
    callState.value === "idle" &&
    !sending.value &&
    !uploadLoading.value &&
    !isRecording.value,
);

const pingSending = ref(false);
const pingSent = ref(false);
const pingCooldown = ref(false);
let pingSentTimer = null;
let pingCooldownTimer = null;

const canPing = computed(
  () => !isGroup.value && Boolean(peerPubkey.value) && Boolean(identity.pubkeyHex),
);

const pingLabel = computed(() => {
  if (pingSent.value) return "Ping sent";
  if (pingCooldown.value) return "Ping sent · wait a bit";
  if (pingSending.value) return "Sending ping…";
  return "Ping · wake them via ntfy";
});

async function handlePing() {
  if (!canPing.value || pingCooldown.value || pingSending.value) return;
  await initPromise;
  pingSending.value = true;
  error.value = "";
  try {
    await sendNtfyPing({
      peerPubkey: peerPubkey.value,
      senderPubkeyHex: identity.pubkeyHex,
      senderName: identity.profileName,
    });
    pingSent.value = true;
    pingCooldown.value = true;
    clearTimeout(pingSentTimer);
    clearTimeout(pingCooldownTimer);
    pingSentTimer = setTimeout(() => {
      pingSent.value = false;
    }, 3000);
    pingCooldownTimer = setTimeout(
      () => {
        pingCooldown.value = false;
      },
      5 * 60 * 1000,
    );
  } catch (err) {
    error.value = err.message || "Failed to send ping.";
  } finally {
    pingSending.value = false;
  }
}

/** A bubble reports when its attachment enters or leaves the viewport, which
 *  drives the quiet 8 s retry for attachments that failed to load. */
function handleMediaVisibility(payload) {
  if (!payload?.message) return;
  setMediaVisible(payload.message, Boolean(payload.visible));
}

/** A visible countdown reached zero. Drop the message now instead of leaving
 *  an expired copy on screen until the ten-second sweep gets to it. */
function handleMessageExpired(message) {
  if (isGroup.value || !message?.id) return;
  void messenger.expireMessagesNow(targetId.value, message.id, Number(message.expiresAt || 0));
}

/** Manual resend from Message Info after the queue marked a message failed. */
async function handleRetrySend(message) {
  if (!message?.id) return;
  const ok = await messenger.retryMessage(message.id);
  if (!ok) error.value = "This message is no longer in the send queue.";
}

/** The browser could not decode an attachment it was given: repair the cached
 *  copy once, then fall back to the retry card. */
function handleMediaError(message) {
  if (!message?.id) return;
  void handleMediaDecodeError(message);
}

async function startAudioCall() {
  if (!peerPubkey.value) return;
  await initPromise;
  try {
    await Promise.all([
      callStore.startAudioCall(peerPubkey.value),
      openCallSurface(peerPubkey.value, { requesting: "audio" }),
    ]);
  } catch (e) {
    error.value = e.message || "Unable to start call.";
  }
}

async function startVideoCall() {
  if (!peerPubkey.value) return;
  await initPromise;
  try {
    await Promise.all([
      callStore.startVideoCall(peerPubkey.value),
      openCallSurface(peerPubkey.value, { requesting: "video" }),
    ]);
  } catch (e) {
    error.value = e.message || "Unable to start video call.";
  }
}

// Handlers
function handleReply(msg) {
  replyingTo.value = msg;
}

function handleEdit(msg) {
  editingMessage.value = msg;
  replyingTo.value = null;
  inputText.value = msg.text || "";
  templateMode.value =
    msg.template === true ? "formatted" : msg.template === false ? "plain" : "auto";
  nextTick(() => composeRef.value?.focus?.());
}

function cancelReply() {
  replyingTo.value = null;
}

async function handleReact({ message, emoji }) {
  await initPromise;
  if (sending.value || uploadLoading.value || isRecording.value) return;
  try {
    if (isGroup.value) {
      await messenger.sendGroupMessage(identity, targetId.value, {
        type: "react",
        emoji,
        replyTo: message.id,
      });
    } else {
      if (!peerPubkey.value) return;
      await messenger.sendDirectMessage(identity, peerPubkey.value, {
        type: "react",
        emoji,
        replyTo: message.id,
        ts: Date.now(),
      });
    }
  } catch (e) {
    error.value = e.message || "Unable to send reaction.";
  }
}

/**
 * A failed send usually means the relays refused the event. Relay health never
 * removes a relay from the send path, so tell the user when observed traffic
 * already grades a configured relay poor; otherwise the error looks random.
 */
async function withRelayHint(message) {
  try {
    const poor = await getUnhealthyConfiguredRelays();
    if (!poor.length) return message;
    return `${message} ${poor.length} configured ${poor.length === 1 ? "relay is" : "relays are"} failing — check Settings › Relays.`;
  } catch {
    return message;
  }
}

async function sendMessage() {
  await initPromise;
  const text = inputText.value.trim();
  if (!text || sending.value || uploadLoading.value || isRecording.value) return;

  const templateValue =
    templateMode.value === "formatted" ? true : templateMode.value === "plain" ? false : undefined;

  if (!isGroup.value && editingMessage.value) {
    const payload = {
      type: "edit",
      replaces: editingMessage.value.id,
      text,
      template: templateValue === undefined ? null : templateValue,
      ts: Date.now(),
    };
    inputText.value = "";
    const prevEditing = editingMessage.value;
    const prevMode = templateMode.value;
    editingMessage.value = null;
    try {
      await messenger.sendDirectMessage(identity, peerPubkey.value, payload);
      templateMode.value = "auto";
    } catch (e) {
      editingMessage.value = prevEditing;
      inputText.value = text;
      templateMode.value = prevMode;
      error.value = await withRelayHint(e.message || "Unable to edit message.");
    }
    return;
  }

  error.value = "";
  sending.value = true;
  triggerHaptic(HAPTIC.send);
  const replyMeta = buildReplyMeta(replyingTo.value);
  inputText.value = "";
  replyingTo.value = null;

  try {
    // The composer unlocks the moment the optimistic row renders — the
    // IndexedDB write and relay push continue in the background, so a busy
    // store or a slow relay never holds the input. Rapid sends run
    // concurrently; rows carry distinct ids and order by timestamp.
    const unlock = () => {
      sending.value = false;
    };
    if (isGroup.value) {
      await messenger.sendGroupMessage(
        identity,
        targetId.value,
        {
          type: "text",
          text,
          ...(templateValue !== undefined ? { template: templateValue } : {}),
          ...replyMeta,
        },
        { onOptimistic: unlock },
      );
    } else {
      await messenger.sendDirectMessage(
        identity,
        peerPubkey.value,
        {
          type: "text",
          text,
          ...(templateValue !== undefined ? { template: templateValue } : {}),
          ts: Date.now(),
          ...replyMeta,
        },
        { onOptimistic: unlock },
      );
    }
    templateMode.value = "auto";
  } catch (e) {
    error.value = await withRelayHint(e.message || "Unable to send message.");
    // The user may already be typing the next message; only restore when the
    // input is still empty.
    if (!inputText.value) inputText.value = text;
  } finally {
    sending.value = false;
  }
}

async function loadOlderMessages() {
  if (loadingOlder.value) return;
  const prevScrollHeight = captureScrollHeight();

  // 1. If more messages are already cached locally, expand the windowed view
  if (hasMoreLocalOlder.value) {
    displayCount.value = Math.min(messages.value.length, displayCount.value + PAGE_SIZE);
    nextTick(() => restoreScrollAfterPrepend(prevScrollHeight));
    return;
  }

  // 2. Otherwise query older messages from local database / Rabta relay
  await initPromise;
  if (!oldestTs.value) return;
  loadingOlder.value = true;

  const readOlderFromCache = async () => {
    if (isGroup.value) {
      const result = await groupsApi.loadOlderGroupMessages(
        identity,
        targetId.value,
        oldestTs.value,
      );
      const rows = result.messages || [];
      if (rows.length) await messenger.refreshGroupFromDexie(targetId.value);
      return { rows, hasMore: result.hasMore };
    }
    if (!peerPubkey.value) return { rows: [], hasMore: false };
    const { messages: rows } = (await api.getOlderDirectMessages?.(
      identity.privkeyHex,
      identity.pubkeyHex,
      peerPubkey.value,
      oldestTs.value,
    )) || { messages: [] };
    if (rows.length) {
      for (const row of rows) {
        await messenger.ingestRoomRow(targetId.value, peerPubkey.value, row);
      }
      await messenger.refreshRoomFromDexie(targetId.value);
    }
    return { rows, hasMore: rows.length > 0 };
  };

  try {
    let result = await readOlderFromCache();
    if (!result.rows.length) {
      // Nothing older is cached yet: ask the engine for one deep-backfill cycle,
      // then read Dexie again.
      await requestEngineSync({ timeoutMs: 8000 });
      result = await readOlderFromCache();
    }
    if (!result.rows.length || !result.hasMore) hasMoreOlder.value = false;
  } catch (e) {
    error.value = e.message || "Unable to load older messages.";
  } finally {
    loadingOlder.value = false;
    nextTick(() => restoreScrollAfterPrepend(prevScrollHeight));
  }
}

// Watchers
watch(
  visibleMessages,
  (rows, prevRows = []) => {
    // Note: Viewport-aware preloading via @visible on ChatMessageBubble
    // replaces the eager full-history iteration, preventing 100 simultaneous downloads.
    onMessagesUpdated(rows, prevRows, { loadingOlder: loadingOlder.value });
  },
  { immediate: true },
);

// Read receipt watcher for DM
const processedReceiptIds = new Set();
const ONE_HOUR_MS = 60 * 60 * 1000;
const GROUP_RECEIPT_DEBOUNCE_MS = 1500;

watch(
  () => messages.value.length,
  (newLen, oldLen) => {
    if (isGroup.value || !peerPubkey.value || !identity.pubkeyHex) return;
    const msgs = messages.value;
    if (!msgs || msgs.length === 0) return;

    const peerMsgs = msgs.filter(
      (m) =>
        !m.mine &&
        (m.type === "text" || m.type === "media" || m.type === "voice" || m.type === "call-event"),
    );

    if (oldLen === undefined) {
      for (let i = 0; i < peerMsgs.length - 1; i++) {
        processedReceiptIds.add(peerMsgs[i].id);
      }
    }

    const peer = peerPubkey.value;
    const now = Date.now();
    const sender = { privkeyHex: identity.privkeyHex, pubkeyHex: identity.pubkeyHex };

    for (const m of peerMsgs) {
      if (!processedReceiptIds.has(m.id)) {
        processedReceiptIds.add(m.id);
        const msgTs = Number(m.ts || m.created_at || 0);
        if (msgTs && now - msgTs > ONE_HOUR_MS) {
          continue;
        }
        void messenger
          .sendDirectMessage(sender, peer, {
            type: "read",
            replyTo: m.id,
            ts: Date.now(),
          })
          .catch(() => {});
      }
    }
  },
  { immediate: true },
);

const lastVisibleMsgTs = computed(() => latestVisibleChatTs(messages.value));

let groupReceiptTimer = null;
let pendingGroupReceipt = null;

function clearGroupReceiptTimer() {
  if (groupReceiptTimer) {
    clearTimeout(groupReceiptTimer);
    groupReceiptTimer = null;
  }
}

function flushGroupReadReceipt() {
  const pending = pendingGroupReceipt;
  pendingGroupReceipt = null;
  clearGroupReceiptTimer();
  if (!pending?.groupId || !pending.lastReadTs || !identity.pubkeyHex) return;
  messenger.sendGroupReadReceipt(identity, pending.groupId, pending.lastReadTs);
}

function scheduleGroupReadReceipt(groupId, lastReadTs) {
  const now = Date.now();
  if (!groupId || !lastReadTs || now - lastReadTs > ONE_HOUR_MS) return;
  pendingGroupReceipt = { groupId, lastReadTs };
  if (groupReceiptTimer) return;
  groupReceiptTimer = setTimeout(() => {
    groupReceiptTimer = null;
    flushGroupReadReceipt();
  }, GROUP_RECEIPT_DEBOUNCE_MS);
}

watch(
  [isGroup, targetId, lastVisibleMsgTs, () => identity.pubkeyHex, isActiveMember],
  ([grp, id, lastReadTs, pk, active], previous) => {
    const prevId = previous?.[1];
    if (prevId && prevId !== id) flushGroupReadReceipt();
    if (!grp || !id || !pk || !active) return;
    const others = (group.value?.members || []).filter((m) => m && m !== selfPubkey.value);
    if (!others.length) return;
    scheduleGroupReadReceipt(id, lastReadTs);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  flushGroupReadReceipt();
  messenger.setActiveConversation("");
  cleanupCompose();
  clearTimeout(pingSentTimer);
  clearTimeout(pingCooldownTimer);
  clearTimeout(contactSavedTimer);
});
</script>

<template>
  <div class="chat-conversation__block">
    <!-- Header -->
    <ChatConversationHeader
      :is-group="isGroup"
      :title="roomTitle"
      :peer-pubkey="peerPubkey"
      :peer-avatar="profilePicture(peerPubkey)"
      :group-avatar="groupAvatarSrc"
      :group-id="group?.groupId || targetId"
      :last-seen-label="lastSeenLabel"
      :last-seen-loading="lastSeenLoading"
      :sent-count="sentCount"
      :is-trusted="isTrusted"
      :member-count="groupMemberCount"
      :drawer-open="drawerOpen"
      :can-start-call="canStartCall"
      :timer-label="!isGroup && chatTimerSec !== CHAT_TIMER_DEFAULT_SEC ? chatTimerText : ''"
      :can-ping="canPing"
      :ping-label="pingLabel"
      :ping-sent="pingSent"
      :ping-cooldown="pingCooldown"
      :ping-sending="pingSending"
      :is-contact="isPeerContact"
      :contact-saving="contactSaving"
      :contact-saved="contactSaved"
      @back="emit('back')"
      @add-contact="handleAddContact"
      @start-audio-call="startAudioCall"
      @start-video-call="startVideoCall"
      @ping="handlePing"
      @toggle-drawer="drawerOpen = !drawerOpen"
    />

    <!-- Main Container -->
    <div class="chat-conversation__block-2">
      <section class="chat-conversation__section">
        <ChatMessageList
          ref="messageListRef"
          :items="visibleMessagesWithSeparators"
          :item-memo-deps="
            (item, index) => [
              ...messageMemoDeps(item, index),
              item?.sender ? displayName(item.sender) : '',
              item?.sender ? !!profileStore.profiles[item.sender]?.name : false,
            ]
          "
          @scroll="onScroll"
          @reach-top="loadOlderMessages"
          @layout-resize="onLayoutResize"
        >
          <template #header>
            <div v-if="isGroup" class="chat-conversation__block-3">
              <div class="chat-conversation__block-4">
                <RoboAvatar :src="groupAvatarSrc" size="xl" />
              </div>
              <p class="chat-conversation__text">
                {{ groupTitle }}
              </p>
              <p class="chat-conversation__text-2">
                Private encrypted group chat — each message is one event encrypted to every member.
              </p>
            </div>
          </template>

          <template #before-list>
            <AppAlertBanner v-if="error" :message="error" class="chat-conversation__app-alert-banner" />
            <LoadOlderButton
              v-if="hasMoreToLoad && oldestTs"
              :loading="loadingOlder"
              @click="loadOlderMessages"
            />
          </template>

          <template #empty>
            <div v-if="messagesLoading" class="chat-conversation__status" role="status">
              <span class="chat-conversation__text-3">Loading messages…</span>
              <div class="chat-conversation__block-5" aria-hidden="true">
                <AppSkeleton class="chat-conversation__app-skeleton" />
              </div>
              <div class="chat-conversation__block-6" aria-hidden="true">
                <AppSkeleton class="chat-conversation__app-skeleton-2" />
              </div>
              <div class="chat-conversation__block-7" aria-hidden="true">
                <AppSkeleton class="chat-conversation__app-skeleton-3" />
              </div>
              <div class="chat-conversation__block-8" aria-hidden="true">
                <AppSkeleton class="chat-conversation__app-skeleton-4" />
              </div>
              <div class="chat-conversation__block-9" aria-hidden="true">
                <AppSkeleton class="chat-conversation__app-skeleton-5" />
              </div>
            </div>
            <div v-else class="chat-conversation__block-10">
              No messages yet. Say hello!
            </div>
          </template>

          <template #item="{ item, prevItem }">
            <div v-if="item.__dateSeparator" class="chat-conversation__block-11">
              <span
                class="chat-conversation__text-4"
              >
                {{ item.label }}
              </span>
            </div>
            <CallEventLine v-else-if="item.type === 'call-event'" :message="item" />
            <CallRequestCard
              v-else-if="item.type === 'call-request'"
              :message="item"
              @accept="handleAcceptCallRequest"
              @decline="handleDeclineCallRequest"
            />
            <div v-else :id="'msg-' + item.id">
              <ChatMessageBubble
                :message="item"
                :mine="item.mine || item.sender === selfPubkey"
                :blob-url="mediaBlobUrls[item.id] || null"
                :media-progress="mediaProgress[item.id] || null"
                :has-failed="!!decryptFailed[item.id]"
                :preview-unavailable="!!previewUnsupported[item.id]"
                :show-sender-name="
                  isGroup ||
                  (!(item.mine || item.sender === selfPubkey) &&
                    !!profileStore.profiles[item.sender]?.name)
                "
                :sender-name="displayName(item.sender)"
                :sender-avatar="profilePicture(item.sender) || avatarUrl(item.sender)"
                @download="downloadMedia"
                @retry="retryMedia"
                @retry-send="handleRetrySend"
                @reply="handleReply"
                @react="handleReact"
                @edit="handleEdit"
                @image-load="onLayoutResize"
                @visible="preloadMedia"
                @media-visibility="handleMediaVisibility"
                @media-error="handleMediaError"
                @expired="handleMessageExpired"
              />
            </div>
          </template>
        </ChatMessageList>

        <NewMessagesPill :count="unseenCount" @click="scrollToBottomAfterLayout('smooth')" />

        <ChatComposeBar
          ref="composeRef"
          v-model="inputText"
          v-model:template-mode="templateMode"
          :disabled="!isActiveMember || uploadLoading"
          :is-recording="isRecording"
          :recording-seconds="recordingSeconds"
          :audio-levels="audioLevels"
          :upload-status="uploadStatus"
          :mentionable-users="mentionableUsers"
          :replying-to="replyingTo"
          :location-draft="locationDraft"
          :show-timer="!isGroup"
          :timer-sec="chatTimerSec"
          @send="sendMessage"
          @update:timer="updateChatTimer"
          @file-selected="handleFileSelected"
          @toggle-recording="handleToggleRecording"
          @cancel-recording="cancelVoiceRecording"
          @cancel-reply="cancelReply"
          @cancel-upload="cancelUpload"
          @request-location="handleRequestLocation"
          @set-location-precision="setLocationPrecision"
          @send-location="handleSendLocation"
          @cancel-location="cancelLocation"
        />
      </section>

      <!-- Enriched Conversation Info Drawer (Live Rabta Telemetry for DMs and Groups) -->
      <ChatConversationInfoDrawer
        :open="drawerOpen"
        :is-group="isGroup"
        :title="roomTitle"
        :peer-pubkey="peerPubkey"
        :peer-avatar="profilePicture(peerPubkey)"
        :group-avatar="groupAvatarSrc"
        :group="group"
        :display-name="displayName"
        :last-seen-label="lastSeenLabel"
        :last-activity-sec="lastActivitySec"
        :peer-bio="peerBio"
        :peer-website="peerWebsite"
        :relay-event-count="relayEventCount"
        :relay-latency-ms="relayLatencyMs"
        :relay-node-id="relayNodeId"
        :sync-parity="syncParity"
        :sync-parity-label="syncParityLabel"
        :loading-enrichment="loadingEnrichment"
        :member-seen-at="memberSeenAt"
        :self-pubkey="selfPubkey"
        :timer-sec="chatTimerSec"
        @close="drawerOpen = false"
        @refresh="refreshEnrichedData"
        @update:timer="updateChatTimer"
      />
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
.chat-conversation__text-3 {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.chat-conversation__block {
  position: relative;
}
.chat-conversation__section {
  position: relative;
}
.chat-conversation__block-11 {
  margin-block: calc(var(--spacing) * 4);
}
.chat-conversation__block-3 {
  margin-bottom: calc(var(--spacing) * 2);
}
.chat-conversation__app-alert-banner {
  margin-bottom: calc(var(--spacing) * 3);
}
.chat-conversation__block {
  display: flex;
}
.chat-conversation__block-2 {
  display: flex;
}
.chat-conversation__section {
  display: flex;
}
.chat-conversation__block-3 {
  display: flex;
}
.chat-conversation__block-5 {
  display: flex;
}
.chat-conversation__block-6 {
  display: flex;
}
.chat-conversation__block-7 {
  display: flex;
}
.chat-conversation__block-8 {
  display: flex;
}
.chat-conversation__block-9 {
  display: flex;
}
.chat-conversation__block-11 {
  display: flex;
}
.chat-conversation__app-skeleton {
  height: calc(var(--spacing) * 4);
}
.chat-conversation__app-skeleton-3 {
  height: calc(var(--spacing) * 10);
}
.chat-conversation__app-skeleton-5 {
  height: calc(var(--spacing) * 10);
}
.chat-conversation__app-skeleton-2 {
  height: calc(var(--spacing) * 12);
}
.chat-conversation__app-skeleton-4 {
  height: calc(var(--spacing) * 16);
}
.chat-conversation__block {
  height: 100%;
}
.chat-conversation__block-2 {
  min-height: 0;
}
.chat-conversation__section {
  min-height: 0;
}
.chat-conversation__app-skeleton-5 {
  width: 50%;
}
.chat-conversation__app-skeleton-4 {
  width: 66.6667%;
}
.chat-conversation__app-skeleton-3 {
  width: 40%;
}
.chat-conversation__app-skeleton-2 {
  width: 60%;
}
.chat-conversation__app-skeleton {
  width: calc(var(--spacing) * 20);
}
.chat-conversation__block {
  width: 100%;
}
.chat-conversation__text-2 {
  max-width: var(--container-sm);

}
.chat-conversation__block-2 {
  min-width: 0;
}
.chat-conversation__section {
  min-width: 0;
}
.chat-conversation__block-2 {
  flex: 1;
}
.chat-conversation__section {
  flex: 1;
}
.chat-conversation__block {
  flex-direction: column;
}
.chat-conversation__section {
  flex-direction: column;
}
.chat-conversation__block-3 {
  flex-direction: column;
}
.chat-conversation__block-3 {
  align-items: center;
}
.chat-conversation__block-11 {
  align-items: center;
}
.chat-conversation__block-5 {
  justify-content: center;
}
.chat-conversation__block-11 {
  justify-content: center;
}
.chat-conversation__block-7 {
  justify-content: flex-end;
}
.chat-conversation__block-9 {
  justify-content: flex-end;
}
.chat-conversation__block-6 {
  justify-content: flex-start;
}
.chat-conversation__block-8 {
  justify-content: flex-start;
}
.chat-conversation__block-3 {
  gap: calc(var(--spacing) * 2);
}
:where(.chat-conversation__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
.chat-conversation__block-4 {
  overflow: hidden;
}
.chat-conversation__app-skeleton-2 {
  border-radius: var(--radius-2xl);
}
.chat-conversation__app-skeleton-3 {
  border-radius: var(--radius-2xl);
}
.chat-conversation__app-skeleton-4 {
  border-radius: var(--radius-2xl);
}
.chat-conversation__app-skeleton-5 {
  border-radius: var(--radius-2xl);
}
.chat-conversation__app-skeleton {
  border-radius: 3.40282e38px;
}
.chat-conversation__text-4 {
  border-radius: 0;








}
.chat-conversation__block-4 {
  border-radius: var(--radius-xl);
}
.chat-conversation__app-skeleton-3 {
  border-bottom-right-radius: var(--radius-md);
}
.chat-conversation__app-skeleton-5 {
  border-bottom-right-radius: var(--radius-md);
}
.chat-conversation__app-skeleton-2 {
  border-bottom-left-radius: var(--radius-md);
}
.chat-conversation__app-skeleton-4 {
  border-bottom-left-radius: var(--radius-md);
}
.chat-conversation__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation__text-4 {
  border-style: var(--border-style,solid);
  border-width: 0;








}
.chat-conversation__block-4 {
  border-color: var(--ui-zinc-800);
}
.chat-conversation__text-4 {
  border-color: var(--ui-zinc-800);








}
.chat-conversation__block {
  background-color: var(--app-bg);
}
.chat-conversation__text-4 {
  background-color: transparent;








}
.chat-conversation__status {
  padding-inline: var(--spacing);
}
.chat-conversation__block-11 {
  padding-inline: var(--spacing);
}
.chat-conversation__text-4 {
  padding-inline: 0;








}
.chat-conversation__text-4 {
  padding-block: 0;








}
.chat-conversation__block-3 {
  padding-block: calc(var(--spacing) * 6);
}
.chat-conversation__block-10 {
  padding-block: calc(var(--spacing) * 12);


}
.chat-conversation__block-3 {
  text-align: center;
}
.chat-conversation__block-10 {
  text-align: center;


}
.chat-conversation__block-10 {
  font-family: var(--font-mono);


}
.chat-conversation__text-4 {
  font-family: var(--font-mono);








}
.chat-conversation__text {
  font-size: var(--text-base);
  line-height: var(--leading,var(--text-base--line-height));

}
.chat-conversation__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));

}
.chat-conversation__block-10 {
  font-size: 10.5px;
  line-height: var(--leading,var(--text-xs--line-height));


}
.chat-conversation__text-4 {
  font-size: 9.5px;








}
.chat-conversation__text {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);

}
.chat-conversation__text {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);

}
.chat-conversation__text-4 {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);








}
.chat-conversation__block {
  color: var(--app-text);
}
.chat-conversation__text {
  color: var(--app-text);

}
.chat-conversation__text-2 {
  color: var(--app-muted);

}
.chat-conversation__text-4 {
  color: var(--app-muted-2);








}
.chat-conversation__block-10 {
  color: var(--app-muted-2);


}
.chat-conversation__text-4 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: none;








}
.chat-conversation__text-4 {
  -webkit-user-select: none;
  user-select: none;








}
[data-theme="light"] .chat-conversation__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation__block-10 {
  color: var(--app-muted);
}
}


@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.chat-conversation__text-4 {
  background-color: transparent;








}
}
}

/* Ledger pass: a date is a rule with a label, not a pill. */

.chat-conversation__block-11 {
  gap: var(--app-space-3);
  margin-block: var(--app-space-6);
}

.chat-conversation__block-11::before,
.chat-conversation__block-11::after {
  content: "";
  flex: 1;
  height: 1px;
  background-color: var(--app-border);
}

.chat-conversation__text-4 {
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  white-space: nowrap;
}

.chat-conversation__block-10 {
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
</style>
