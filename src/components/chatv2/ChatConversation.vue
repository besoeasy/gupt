<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Shield, UserPlus, X } from "@lucide/vue";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import CallMenuModal from "@/components/chat/CallMenuModal.vue";
import CallEventLine from "@/components/chat/CallEventLine.vue";
import CallRequestCard from "@/components/chat/CallRequestCard.vue";
import ChatTypingIndicator from "@/components/chat/ChatTypingIndicator.vue";
import NewMessagesPill from "@/components/chat/NewMessagesPill.vue";
import LoadOlderButton from "@/components/LoadOlderButton.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";

import ChatConversationHeader from "@/components/chatv2/ChatConversationHeader.vue";
import ChatMessageList from "@/components/chatv2/ChatMessageList.vue";
import ChatMessageBubble from "@/components/chatv2/ChatMessageBubble.vue";
import ChatComposeBar from "@/components/chatv2/ChatComposeBar.vue";

import { useChatScroll } from "@/composables/useChatScroll";
import { useConversationCompose } from "@/composables/useConversationCompose";
import { useProfileCache } from "@/composables/useProfileCache";
import { useLastSeen } from "@/composables/useLastSeen";
import { useCallStore } from "@/stores/calls";
import { useCallNavigation } from "@/composables/useCallNavigation";
import { useIdentityStore } from "@/stores/identity";

import { withDateSeparators } from "@/lib/chatListUtils";
import { buildReplyMeta } from "@/lib/chatUtils";
import { normalizeNostrPubkey, roboHashGroupUrl, roboHashUrl, shortId } from "@/lib/crypto";
import { enqueueSend } from "@/lib/sendQueue";
import { groupsApi } from "@/lib/groups";
import { rememberRelayHint } from "@/lib/relay";
import { putDecCached } from "@/lib/idb";
import { messenger } from "@/stores/messenger";
import { startAppSync } from "@/lib/sync";

const props = defineProps({
  conversationType: { type: String, required: true }, // "dm" or "group"
  conversationId: { type: String, required: true }, // roomId or groupId
});

const emit = defineEmits(["back"]);

const router = useRouter();
const identity = useIdentityStore();
const { displayName, profilePicture, prefetch } = useProfileCache();
const initPromise = identity.init().then(() => void startAppSync(identity));

const inputText = ref("");
const sending = ref(false);
const error = ref("");
const loadingOlder = ref(false);
const hasMoreOlder = ref(true);
const replyingTo = ref(null);
const editingMessage = ref(null);
const drawerOpen = ref(false);
const showCallMenu = ref(false);
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

// Typing indicator state
const peerIsTyping = ref(false);
let typingTimeout = null;
function setPeerTyping() {
  peerIsTyping.value = true;
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    peerIsTyping.value = false;
  }, 4000);
}

onMounted(() => {
  messenger.setTypingSignalHandler((senderPubKey) => {
    if (!isGroup.value && senderPubKey === peerPubkey.value) {
      setPeerTyping();
    }
  });
});

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

const { lastSeenLabel, loading: lastSeenLoading } = useLastSeen(peerPubkey);

const roomTitle = computed(() => {
  if (isGroup.value) return group.value?.name || "Group";
  return peerPubkey.value ? displayName(peerPubkey.value) : roomInfo.value?.name || "Conversation";
});

// Group Info
const group = computed(() => (isGroup.value ? messenger.groupMeta[targetId.value] || null : null));
const rawGroupMessages = computed(() =>
  isGroup.value ? messenger.groupMessages[targetId.value] || [] : [],
);
const groupAvatarUrl = computed(() =>
  roboHashGroupUrl(group.value?.groupId || targetId.value || "group"),
);
const groupMemberCount = computed(() =>
  Number(group.value?.memberCount || group.value?.members?.length || 0),
);
const selfPubkey = computed(() => normalizeNostrPubkey(identity.pubkeyHex) || "");

const isAdmin = computed(() =>
  Boolean(selfPubkey.value && group.value?.admins?.includes(selfPubkey.value)),
);
const isActiveMember = computed(() =>
  isGroup.value
    ? Boolean(selfPubkey.value && group.value?.members?.includes(selfPubkey.value)) &&
      !group.value?.removedAt
    : true,
);

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

function _cachedMsg(newData) {
  const prev = _msgObjCache.get(newData.id);
  if (
    prev &&
    prev.id === newData.id &&
    prev.type === newData.type &&
    prev.text === newData.text &&
    prev.status === newData.status &&
    prev.readByPeer === newData.readByPeer &&
    prev.editedAt === newData.editedAt &&
    prev.ts === newData.ts &&
    prev.mine === newData.mine &&
    prev.sender === newData.sender &&
    prev.replyTo === newData.replyTo &&
    prev.replyExcerpt === newData.replyExcerpt &&
    prev.error === newData.error &&
    _sameReactions(prev.reactions, newData.reactions)
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

  for (const row of rows) {
    const kindNum = Number(row.kind ?? row.created_at_kind ?? 0);
    if (kindNum >= 20000 && kindNum <= 29999) continue;
    if (row.isEphemeral || row.type === "typing" || row.type === "signal" || row.type === "ping" || row.type === "group-invite") continue;

    const emoji = row.type === "like" ? "❤️" : row.type === "react" ? row.emoji || "❤️" : null;
    if (emoji !== null) {
      if (row.replyTo) {
        if (!reactMap.has(row.replyTo)) reactMap.set(row.replyTo, new Map());
        const emojiMap = reactMap.get(row.replyTo);
        const senders = emojiMap.get(emoji) || [];
        if (!senders.includes(row.sender)) emojiMap.set(emoji, [...senders, row.sender]);
      }
    } else if (row.type === "read" && row.replyTo) {
      if (!row.mine) readSet.add(row.replyTo);
    } else if (row.type === "edit" && row.replaces) {
      const prev = editMap.get(row.replaces);
      if (!prev || Number(row.ts) > Number(prev.editedAt)) {
        editMap.set(row.replaces, { text: row.text, editedAt: Number(row.ts) });
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

    if (msg.mine && readSet.has(msg.id)) {
      hasSeenRead = true;
    }

    mapped.push(
      _cachedMsg({
        ...msg,
        ...(edit ? { text: edit.text, editedAt: edit.editedAt } : {}),
        ...(reactions ? { reactions } : {}),
        ...(msg.mine && hasSeenRead ? { readByPeer: true } : {}),
      }),
    );
  }

  mapped.reverse();
  return mapped;
});

const messagesWithSeparators = computed(() => withDateSeparators(messages.value));
const oldestTs = computed(() =>
  Number(messages.value[0]?.ts || messages.value[0]?.created_at || 0),
);

const sentCount = computed(() =>
  !isGroup.value ? messages.value.filter((m) => m.mine).length : 7,
);
const isTrusted = computed(() => (!isGroup.value ? sentCount.value >= 7 : true));

// Compose hook
const {
  uploadLoading,
  uploadStatus,
  isRecording,
  recordingSeconds,
  cancelVoiceRecording,
  handleToggleRecording,
  handleFileSelected,
  downloadMedia,
  mediaBlobUrls,
  mediaProgress,
  decryptFailed,
  rememberBlobUrl,
  preloadMedia,
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
    if (isGroup.value) {
      await messenger.sendGroupMessage(identity, targetId.value, payload, {
        onConfirmed(confirmed) {
          if (confirmed?.id) {
            void putDecCached(confirmed.id, rawBuf, mimeType);
            rememberBlobUrl(confirmed.id, rawBuf, mimeType);
          }
        },
      });
    } else {
      if (!peerPubkey.value) throw new Error("No recipient for this conversation.");
      const tempId = shortId();
      const optimisticPayload = { ...payload, id: tempId };
      rememberBlobUrl(tempId, rawBuf, payload.media.mime);
      await putDecCached(tempId, rawBuf, payload.media.mime);

      const { id: confirmedId } = await messenger.sendDirectMessage(
        identity,
        peerPubkey.value,
        optimisticPayload,
      );
      if (confirmedId && confirmedId !== tempId) {
        const url = mediaBlobUrls[tempId];
        if (url) {
          mediaBlobUrls[confirmedId] = url;
          delete mediaBlobUrls[tempId];
        }
        await putDecCached(confirmedId, rawBuf, payload.media.mime);
      }
    }
  },
});

// Mentions for groups
const mentionableUsers = computed(() => {
  if (!isGroup.value || !group.value?.members) return [];
  return group.value.members
    .filter((pk) => pk !== selfPubkey.value)
    .map((pk) => ({ pubkey: pk, name: displayName(pk), picture: profilePicture(pk) }))
    .filter((u) => Boolean(u.name));
});

// Call helpers
const callState = computed(() => callStore.callState);
const canStartCall = computed(
  () =>
    !isGroup.value &&
    Boolean(peerPubkey.value) &&
    isTrusted.value &&
    callState.value === "idle" &&
    !sending.value &&
    !uploadLoading.value &&
    !isRecording.value,
);

async function startAudioCall() {
  if (!peerPubkey.value) return;
  await initPromise;
  try {
    await callStore.sendCallRequest(peerPubkey.value, { audio: true, video: false });
    await openCallSurface(peerPubkey.value, { requesting: "audio" });
  } catch (e) {
    error.value = e.message || "Unable to start call.";
  }
}

async function startVideoCall() {
  if (!peerPubkey.value) return;
  await initPromise;
  try {
    await callStore.sendCallRequest(peerPubkey.value, { audio: true, video: true });
    await openCallSurface(peerPubkey.value, { requesting: "video" });
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

async function sendMessage() {
  await initPromise;
  const text = inputText.value.trim();
  if (!text || sending.value || uploadLoading.value || isRecording.value) return;

  if (!isGroup.value && editingMessage.value) {
    const payload = {
      type: "edit",
      replaces: editingMessage.value.id,
      text,
      ts: Date.now(),
    };
    inputText.value = "";
    const prevEditing = editingMessage.value;
    editingMessage.value = null;
    try {
      await messenger.sendDirectMessage(identity, peerPubkey.value, payload);
    } catch (e) {
      editingMessage.value = prevEditing;
      inputText.value = text;
      error.value = e.message || "Unable to edit message.";
    }
    return;
  }

  error.value = "";
  sending.value = true;
  const replyMeta = buildReplyMeta(replyingTo.value);
  inputText.value = "";
  replyingTo.value = null;

  try {
    if (isGroup.value) {
      await messenger.sendGroupMessage(identity, targetId.value, {
        type: "text",
        text,
        ...replyMeta,
      });
    } else {
      await messenger.sendDirectMessage(identity, peerPubkey.value, {
        type: "text",
        text,
        ts: Date.now(),
        ...replyMeta,
      });
    }
  } catch (e) {
    error.value = e.message || "Unable to send message.";
    inputText.value = text;
  } finally {
    sending.value = false;
  }
}

async function loadOlderMessages() {
  await initPromise;
  if (!oldestTs.value || loadingOlder.value) return;
  loadingOlder.value = true;
  const prevScrollHeight = captureScrollHeight();
  try {
    if (isGroup.value) {
      const result = await groupsApi.loadOlderGroupMessages(
        identity,
        targetId.value,
        oldestTs.value,
      );
      if (!result.hasMore) hasMoreOlder.value = false;
      await messenger.refreshGroupFromDexie(targetId.value);
    } else {
      if (!peerPubkey.value) return;
      const { messages: rows } = (await messenger.api.getOlderDirectMessages?.(
        identity.privkeyHex,
        identity.pubkeyHex,
        peerPubkey.value,
        oldestTs.value,
      )) || { messages: [] };
      if (!rows.length) hasMoreOlder.value = false;
      for (const row of rows) {
        await messenger.ingestRoomRow(targetId.value, peerPubkey.value, row);
      }
      await messenger.refreshRoomFromDexie(targetId.value);
    }
  } catch (e) {
    error.value = e.message || "Unable to load older messages.";
  } finally {
    loadingOlder.value = false;
    nextTick(() => restoreScrollAfterPrepend(prevScrollHeight));
  }
}

// Group Invite & Sync actions
const syncing = ref(false);
const inviting = ref(false);
const invitePubkey = ref("");
const rotatingKeys = ref(false);

async function refreshGroup() {
  await initPromise;
  syncing.value = true;
  error.value = "";
  try {
    await groupsApi.syncGroup(identity, targetId.value);
    await messenger.refreshGroupMeta(targetId.value);
    await messenger.hydrateGroup(targetId.value);
  } catch (e) {
    error.value = e.message || "Unable to sync group.";
  } finally {
    syncing.value = false;
  }
}

async function inviteMember() {
  await initPromise;
  if (!isAdmin.value || !invitePubkey.value.trim()) return;
  inviting.value = true;
  error.value = "";
  try {
    const target = normalizeNostrPubkey(invitePubkey.value.trim());
    if (!target) throw new Error("Invalid public key.");
    await groupsApi.addMembers(identity, targetId.value, [target]);
    invitePubkey.value = "";
  } catch (e) {
    error.value = e.message || "Unable to send invite.";
  } finally {
    inviting.value = false;
  }
}

async function rotateGroupKeys() {
  await initPromise;
  if (!isAdmin.value) return;
  rotatingKeys.value = true;
  error.value = "";
  try {
    await groupsApi.rotateGroupEpoch(identity, targetId.value);
  } catch (e) {
    error.value = e.message || "Unable to rotate group epoch.";
  } finally {
    rotatingKeys.value = false;
  }
}

// Watchers
watch(
  messages,
  (rows, prevRows = []) => {
    for (const row of rows) preloadMedia(row);
    onMessagesUpdated(rows, prevRows, { loadingOlder: loadingOlder.value });
  },
  { immediate: true },
);

// Read receipt watcher for DM
const processedReceiptIds = new Set();
const ONE_HOUR_MS = 60 * 60 * 1000;

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
    const room = targetId.value;
    const now = Date.now();

    for (const m of peerMsgs) {
      if (!processedReceiptIds.has(m.id)) {
        processedReceiptIds.add(m.id);
        const msgTs = Number(m.ts || m.created_at || 0);
        if (msgTs && now - msgTs > ONE_HOUR_MS) {
          continue;
        }
        const taskId = `receipt:${room}:${m.id}`;
        const msgId = m.id;
        enqueueSend({
          id: taskId,
          meta: { kind: "receipt", conversationId: `receipt:${room}` },
          fn: () =>
            messenger.sendDirectMessage(identity, peer, {
              type: "read",
              replyTo: msgId,
              ts: Date.now(),
            }),
          onFailed() {},
        });
      }
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  messenger.setActiveConversation("");
  cleanupCompose();
});
</script>

<template>
  <div class="relative flex h-full w-full flex-col bg-(--app-bg) text-(--app-text)">
    <!-- Header -->
    <ChatConversationHeader
      :is-group="isGroup"
      :title="roomTitle"
      :peer-pubkey="peerPubkey"
      :peer-avatar="profilePicture(peerPubkey)"
      :group-avatar="groupAvatarUrl"
      :last-seen-label="lastSeenLabel"
      :last-seen-loading="lastSeenLoading"
      :sent-count="sentCount"
      :is-trusted="isTrusted"
      :member-count="groupMemberCount"
      :epoch="group?.currentEpoch || 1"
      :syncing="syncing"
      :drawer-open="drawerOpen"
      :can-start-call="canStartCall"
      @back="emit('back')"
      @start-audio-call="startAudioCall"
      @start-video-call="startVideoCall"
      @start-group-call="showCallMenu = true"
      @sync-group="refreshGroup"
      @toggle-drawer="drawerOpen = !drawerOpen"
    />

    <!-- Main Container -->
    <div class="flex flex-1 min-h-0 min-w-0">
      <section class="flex flex-1 min-h-0 min-w-0 flex-col relative">
        <ChatMessageList
          ref="messageListRef"
          :items="messagesWithSeparators"
          :item-memo-deps="messageMemoDeps"
          @scroll="onScroll"
          @layout-resize="onLayoutResize"
        >
          <template #header>
            <div v-if="isGroup" class="flex flex-col items-center gap-2 py-6 mb-2 text-center">
              <RoboAvatar :src="groupAvatarUrl" size="xl" rounded="2xl" />
              <p class="text-base font-bold">{{ group?.name || "Group" }}</p>
              <p class="text-xs text-(--app-muted) max-w-sm">
                Private gift-wrapped group chat · Epoch {{ group?.currentEpoch || 1 }}
              </p>
            </div>
          </template>

          <template #before-list>
            <AppAlertBanner v-if="error" :message="error" class="mb-3" />
            <LoadOlderButton
              v-if="hasMoreOlder && oldestTs"
              :loading="loadingOlder"
              @click="loadOlderMessages"
            />
          </template>

          <template #empty>
            <div class="py-12 text-center text-xs text-(--app-muted)">
              No messages yet. Say hello!
            </div>
          </template>

          <template #item="{ item, prevItem }">
            <div v-if="item.__dateSeparator" class="flex items-center justify-center my-3 px-1">
              <span
                class="border border-(--app-border) bg-(--app-surface-soft) text-[10px] font-semibold px-3 py-1 rounded-full text-(--app-muted) select-none"
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
                :show-sender-name="isGroup"
                :sender-name="displayName(item.sender)"
                :sender-avatar="profilePicture(item.sender) || roboHashUrl(item.sender)"
                @download="downloadMedia"
                @reply="handleReply"
                @react="handleReact"
                @edit="handleEdit"
              />
            </div>
          </template>
        </ChatMessageList>

        <NewMessagesPill :count="unseenCount" @click="scrollToBottomAfterLayout('smooth')" />
        <ChatTypingIndicator v-if="peerIsTyping && !isGroup" :name="displayName(peerPubkey)" class="mb-1 ml-2" />

        <ChatComposeBar
          ref="composeRef"
          v-model="inputText"
          :disabled="!isActiveMember || uploadLoading"
          :is-recording="isRecording"
          :recording-seconds="recordingSeconds"
          :upload-status="uploadStatus"
          :mentionable-users="mentionableUsers"
          :replying-to="replyingTo"
          @send="sendMessage"
          @file-selected="handleFileSelected"
          @toggle-recording="handleToggleRecording"
          @cancel-recording="cancelVoiceRecording"
          @cancel-reply="cancelReply"
        />
      </section>

      <!-- Members Drawer (for Groups) -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
      >
        <aside
          v-if="isGroup && drawerOpen"
          class="w-[280px] bg-(--app-surface) border-l border-(--app-border) overflow-y-auto shrink-0 p-4 space-y-4"
        >
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-(--app-muted)">
              Group Members
            </h3>
            <button
              type="button"
              @click="drawerOpen = false"
              class="rounded-lg p-1 text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            >
              <X class="h-4 w-4" :stroke-width="2" />
            </button>
          </div>

          <!-- Invite section -->
          <div v-if="isAdmin" class="space-y-2 border-b border-(--app-border) pb-4">
            <p class="text-xs font-semibold">Invite Member</p>
            <input
              v-model="invitePubkey"
              placeholder="Public key string"
              class="w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2 text-xs placeholder-(--app-muted) focus:border-(--app-primary) focus:outline-none"
            />
            <PrimaryButton @click="inviteMember" :loading="inviting" class="w-full text-xs py-2">
              <UserPlus class="h-3.5 w-3.5" :stroke-width="2" />
              Send Invite
            </PrimaryButton>
          </div>

          <!-- Member list -->
          <div class="space-y-2">
            <div
              v-for="pubkey in group?.members || []"
              :key="pubkey"
              class="flex items-center gap-2.5 rounded-xl p-2 hover:bg-(--app-surface-soft)"
            >
              <RoboAvatar :pubkey="pubkey" :src="profilePicture(pubkey)" size="xs" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-semibold">{{ displayName(pubkey) }}</p>
                <p class="truncate text-[10px] text-(--app-muted)">{{ shortId(pubkey) }}</p>
              </div>
            </div>
          </div>
        </aside>
      </Transition>
    </div>

    <CallMenuModal v-if="showCallMenu" @close="showCallMenu = false" />
  </div>
</template>
