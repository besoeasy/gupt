<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeft, Check, Copy, Link2, Phone, Video, Bell } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import ChatComposeBar from "@/components/chat/ChatComposeBar.vue";
import ChatMessageList from "@/components/chat/ChatMessageList.vue";
import NewMessagesPill from "@/components/chat/NewMessagesPill.vue";
import { useChatScroll } from "@/composables/useChatScroll";
import { withDateSeparators } from "@/lib/chatListUtils";
import CallEventLine from "@/components/chat/CallEventLine.vue";
import CallMenuModal from "@/components/chat/CallMenuModal.vue";
import ChatMessageBubble from "@/components/chat/ChatMessageBubble.vue";
import LoadOlderButton from "@/components/LoadOlderButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { api, getActiveRelays } from "@/lib/api";
import { useCallStore } from "@/stores/calls";
import { useCallNavigation } from "@/composables/useCallNavigation";
import { copyToClipboard } from "@/lib/clipboard";
import { buildReplyMeta } from "@/lib/chatUtils";
import { shortId, roboHashUrl } from "@/lib/crypto";
import { putDecCached } from "@/lib/idb";
import { useConversationCompose } from "@/composables/useConversationCompose";
import { useProfileCache } from "@/composables/useProfileCache";
import { logStartupOnce } from "@/lib/startupMetrics";
import { sendNtfyPing } from "@/lib/ping";
import { isReplyReminderDismissed, shouldShowReplyReminder } from "@/lib/replyReminders";
import { startAppSync } from "@/lib/sync";
import { messenger } from "@/stores/messenger";
import ReplyReminderPrompt from "@/components/ReplyReminderPrompt.vue";
import ChatTypingIndicator from "@/components/chat/ChatTypingIndicator.vue";
import { useIdentityStore } from "@/stores/identity";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const { displayName, profilePicture, prefetch } = useProfileCache();
const initPromise = identity.init().then(() => {
  void startAppSync(identity);
});

const roomId = computed(() => String(route.params.roomId || ""));
const inputText = ref("");
const sending = ref(false);
const error = ref("");
const loadingOlder = ref(false);
const hasMoreOlder = ref(true);
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
const showCallMenu = ref(false);

const replyingTo = ref(null);
const editingMessage = ref(null);
const composeRef = ref(null);

// Typing indicator state
const peerIsTyping = ref(false);
let typingTimeout = null;
function setPeerTyping() {
  peerIsTyping.value = true;
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { peerIsTyping.value = false; }, 4000);
}
defineExpose({ setPeerTyping });

// Hydrate this room's cached messages into the messenger store.
watch(
  roomId,
  (id) => {
    if (id) void messenger.hydrateRoom(id);
  },
  { immediate: true },
);

function cancelReply() {
  replyingTo.value = null;
}

function cancelEdit() {
  editingMessage.value = null;
  inputText.value = "";
}

function handleReply(message) {
  replyingTo.value = message;
}

function handleEdit(message) {
  editingMessage.value = message;
  replyingTo.value = null;
  inputText.value = message.text || "";
  nextTick(() => composeRef.value?.focus?.());
}

async function handleReact({ message, emoji }) {
  await initPromise;
  if (!peerPubkey.value || sending.value || uploadLoading.value || isRecording.value) return;
  try {
    await messenger.sendDirectMessage(identity, peerPubkey.value, {
      type: "react",
      emoji,
      replyTo: message.id,
      ts: Date.now(),
    });
  } catch (e) {
    error.value = e.message || "Unable to send reaction.";
  }
}

// All chat data flows through the messenger store. Dexie is the cold-cache
// layer that hydrates the store on first mount; the live relay subscription
// (started by startAppSync) keeps the store fresh from there on.
const roomInfo = computed(() => messenger.roomMeta[roomId.value] || null);
const messageRows = computed(() => messenger.roomMessages[roomId.value] || []);
const roomInfoLoading = computed(() => false);
const messagesLoading = computed(
  () => !messenger.roomMessages[roomId.value] && !messenger.hydratedInbox.value,
);
const messages = computed(() => {
  const rows = messageRows.value || [];
  const active = [];
  const reactMap = new Map(); // msgId -> Map<emoji, sender[]>
  const editMap = new Map(); // originalId -> { text, editedAt }

  for (const row of rows) {
    const emoji = row.type === "like" ? "❤️" : row.type === "react" ? row.emoji || "❤️" : null;
    if (emoji !== null) {
      if (row.replyTo) {
        if (!reactMap.has(row.replyTo)) reactMap.set(row.replyTo, new Map());
        const emojiMap = reactMap.get(row.replyTo);
        const senders = emojiMap.get(emoji) || [];
        if (!senders.includes(row.sender)) emojiMap.set(emoji, [...senders, row.sender]);
      }
    } else if (row.type === "edit" && row.replaces) {
      const prev = editMap.get(row.replaces);
      if (!prev || Number(row.ts) > Number(prev.editedAt)) {
        editMap.set(row.replaces, { text: row.text, editedAt: Number(row.ts) });
      }
    } else {
      active.push(row);
    }
  }

  return active.map((msg) => {
    const edit = editMap.get(msg.id);
    const emojiMap = reactMap.get(msg.id);
    const reactions = emojiMap
      ? [...emojiMap.entries()].map(([em, senders]) => ({ emoji: em, count: senders.length }))
      : undefined;
    return {
      ...msg,
      ...(edit ? { text: edit.text, editedAt: edit.editedAt } : {}),
      ...(reactions ? { reactions } : {}),
    };
  });
});

function getMessagePreview(message) {
  if (!message) return "";
  if (message.type === "text") return message.text || "";
  if (message.type === "voice") return "🎤 Voice note";
  if (message.type === "media" || message.type === "media-legacy") {
    const mime = message.media?.mime || "";
    if (mime.startsWith("image/")) return "📷 Photo";
    if (mime.startsWith("video/")) return "🎥 Video";
    return `📎 ${message.text || "File"}`;
  }
  return "";
}

const messagesWithSeparators = computed(() => withDateSeparators(messages.value));
const loading = computed(() => roomInfoLoading.value || messagesLoading.value);
const oldestTs = computed(() => {
  const firstMessage = messages.value[0];
  return Number(firstMessage?.created_at || firstMessage?.ts || 0);
});

const peerPubkey = computed(() => {
  const fromMeta = roomInfo.value?.peerPubkey ?? "";
  if (fromMeta) return fromMeta;
  const rows = messageRows.value || [];
  return (
    rows.find((row) => row.peerPubkey)?.peerPubkey ||
    rows.find((row) => !row.mine && row.sender)?.sender ||
    ""
  );
});
const title = computed(() =>
  peerPubkey.value ? displayName(peerPubkey.value) : roomInfo.value?.name || "Conversation",
);

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
  preloadMedia,
  rememberBlobUrl,
  messageMemoDeps,
  cleanupCompose,
} = useConversationCompose({
  initPromise,
  onError: (message) => {
    error.value = message;
  },
  getReplyMeta: () => buildReplyMeta(replyingTo.value),
  clearReply: () => {
    replyingTo.value = null;
  },
  deliverEncryptedPayload: async (payload, { rawBuf, mimeType }) => {
    if (!peerPubkey.value) throw new Error("No recipient for this conversation.");
    const tempId = shortId();
    const optimisticPayload = { ...payload, id: tempId };
    rememberBlobUrl(tempId, rawBuf, payload.media.mime);
    await putDecCached(tempId, rawBuf, payload.media.mime);

    try {
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
    } catch (e) {
      error.value = e.message || "Unable to send the attachment.";
      throw e;
    }
  },
});

watch(
  mediaBlobUrls,
  () => {
    nextTick(() => messageListRef.value?.remeasure?.());
  },
  { deep: true },
);

const reminderNowMs = ref(Date.now());
let reminderTickTimer = null;

const showReplyReminder = computed(() => {
  const id = roomId.value;
  if (!id || !peerPubkey.value || isReplyReminderDismissed(id)) return false;
  return shouldShowReplyReminder(messenger.roomMeta[id], reminderNowMs.value, messageRows.value);
});

watch(
  peerPubkey,
  (pk) => {
    if (pk) void prefetch([pk]);
  },
  { immediate: true },
);

watch(
  () => !loading.value,
  (ready) => {
    if (!ready) return;
    logStartupOnce("room-cache-ready", "room:cache-ready", {
      roomId: shortId(roomId.value),
      hasPeer: Boolean(peerPubkey.value),
      messages: messages.value.length,
    });
  },
  { immediate: true },
);

const peerKeyCopied = ref(false);
async function copyPeerKey() {
  await initPromise;
  if (!peerPubkey.value) return;
  await copyToClipboard(peerPubkey.value);
  peerKeyCopied.value = true;
  setTimeout(() => (peerKeyCopied.value = false), 2000);
}

// Call state — only what's needed to enable/disable the start-call buttons.
const callState = computed(() => callStore.callState);

const canStartCall = computed(
  () =>
    Boolean(peerPubkey.value) &&
    callState.value === "idle" &&
    !sending.value &&
    !uploadLoading.value &&
    !isRecording.value,
);
// Disable mic recording while on a call with this peer
const callActivWithPeer = computed(
  () => callState.value !== "idle" && callStore.activePeerPubkey === peerPubkey.value,
);

// Live subscription is started globally by `startAppSync`. The room view just
// reads from the messenger store. We keep `relayConnected` for header UI.
const relayConnected = computed(() => Boolean(messenger.activePubkey.value && identity.privkeyHex));

watch(
  messages,
  (rows, previousRows = []) => {
    for (const row of rows) {
      preloadMedia(row);
    }
    onMessagesUpdated(rows, previousRows, { loadingOlder: loadingOlder.value });
  },
  { immediate: true },
);

watch(loading, (isLoading, wasLoading) => {
  if (wasLoading && !isLoading && messages.value.length) {
    settleAtBottom();
  }
});

watch(
  [loading, peerPubkey],
  ([isLoading, peer]) => {
    if (!isLoading && !peer) {
      error.value =
        "This conversation is not in local storage anymore. Start the DM again from the home screen.";
    }
  },
  { immediate: true },
);

async function loadOlderMessages() {
  await initPromise;
  if (!peerPubkey.value || loadingOlder.value || !oldestTs.value) return;
  loadingOlder.value = true;
  const prevScrollHeight = captureScrollHeight();
  try {
    const { messages: rows } = await api.getOlderDirectMessages(
      identity.privkeyHex,
      identity.pubkeyHex,
      peerPubkey.value,
      oldestTs.value,
    );
    if (!rows.length) {
      hasMoreOlder.value = false;
      return;
    }
    for (const row of rows) {
      if (
        row?.type === "text" ||
        row?.type === "voice" ||
        row?.type === "media" ||
        row?.type === "media-legacy" ||
        row?.type === "like" ||
        row?.type === "react" ||
        row?.type === "edit"
      ) {
        await messenger.ingestRoomRow(roomId.value, peerPubkey.value, {
          ...row,
          peerPubkey: peerPubkey.value,
          status: row.mine ? "sent" : undefined,
        });
      }
    }
    await messenger.refreshRoomFromDexie(roomId.value);
  } catch (e) {
    error.value = e.message || "Unable to load older messages.";
  } finally {
    loadingOlder.value = false;
    nextTick(() => restoreScrollAfterPrepend(prevScrollHeight));
  }
}

function isConsecutiveMessage(item, prevItem) {
  if (!item || !prevItem || prevItem.__dateSeparator) return false;
  return (
    item.mine === prevItem.mine &&
    item.sender === prevItem.sender &&
    Math.abs(Number(item.ts || 0) - Number(prevItem.ts || 0)) < 300000
  );
}

async function startMeeting() {
  await initPromise;
  if (!peerPubkey.value) return;
  error.value = "";
  sending.value = true;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const payload = { type: "text", text: `https://talky.io/${hex}`, ts: Date.now() };
  try {
    await messenger.sendDirectMessage(identity, peerPubkey.value, payload);
  } catch (e) {
    error.value = e.message || "Unable to send meeting link.";
  } finally {
    sending.value = false;
  }
}

const pingSending = ref(false);
const pingSent = ref(false);
const pingCooldown = ref(false);

async function handlePing() {
  if (!peerPubkey.value || !identity.pubkeyHex || pingCooldown.value || pingSending.value) return;
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
    setTimeout(() => {
      pingSent.value = false;
    }, 3000);
    // Cooldown for 5 minutes
    setTimeout(
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

async function startAudioCall() {
  if (!peerPubkey.value) return;
  console.info(`[gupt-call-ui ${peerPubkey.value}] start audio call requested`);
  await initPromise;
  const check = await callStore.runConnectivityCheck();
  if (!check.ok) {
    error.value = check.warning || "Network check failed. Calls may not connect.";
    return;
  }
  if (check.warning) error.value = check.warning;
  let failed = false;
  try {
    await callStore.startAudioCall(peerPubkey.value);
  } catch (e) {
    failed = true;
    console.error(`[gupt-call-ui] startAudioCall failed`, e);
  }
  await openCallSurface(peerPubkey.value, failed ? {} : { mode: "audio" });
}

async function startVideoCall() {
  await initPromise;
  if (!canStartCall.value) return;
  console.info(`[gupt-call-ui ${peerPubkey.value}] start video call requested`);
  const check = await callStore.runConnectivityCheck();
  if (!check.ok) {
    error.value = check.warning || "Network check failed. Calls may not connect.";
    return;
  }
  if (check.warning) error.value = check.warning;
  let failed = false;
  try {
    await callStore.startVideoCall(peerPubkey.value);
  } catch (e) {
    failed = true;
    console.error(`[gupt-call-ui] startVideoCall failed`, e);
  }
  await openCallSurface(peerPubkey.value, failed ? {} : { mode: "video" });
}

async function sendMessage() {
  await initPromise;
  const text = inputText.value.trim();
  if (!text || !peerPubkey.value || sending.value || uploadLoading.value || isRecording.value)
    return;

  // --- Edit mode ---
  if (editingMessage.value) {
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
      error.value = e.message || "Unable to edit the message.";
    }
    return;
  }

  // --- Normal send ---
  error.value = "";
  sending.value = true;
  const payload = {
    type: "text",
    text,
    ts: Date.now(),
    ...buildReplyMeta(replyingTo.value),
  };
  inputText.value = "";
  replyingTo.value = null;

  try {
    await messenger.sendDirectMessage(identity, peerPubkey.value, payload);
  } catch (e) {
    error.value = e.message || "Unable to send the message.";
  } finally {
    sending.value = false;
  }
}

watch(
  peerPubkey,
  (nextPeerPubkey) => {
    if (!nextPeerPubkey) return;
    // Ensure we have a peerPubkey on the room meta even before the first
    // relay event arrives (e.g. when entering a brand-new room).
    if (!messenger.roomMeta[roomId.value]?.peerPubkey) {
      messenger.roomMeta[roomId.value] = {
        ...(messenger.roomMeta[roomId.value] || {}),
        roomId: roomId.value,
        peerPubkey: nextPeerPubkey,
        type: "dm",
      };
    }
  },
  { immediate: true },
);

watch(
  roomId,
  (id) => {
    messenger.setActiveConversation(id);
    if (id) void messenger.markConversationSeen(id);
  },
  { immediate: true },
);

onMounted(() => {
  reminderTickTimer = setInterval(() => {
    reminderNowMs.value = Date.now();
  }, 30_000);

  void initPromise.then(() => {
    if (roomId.value) void messenger.hydrateRoom(roomId.value);
  });

  // Global paste listener while this route is mounted: forwards to the compose bar
  const routePasteHandler = (e) => {
    try {
      // Forward paste event to compose component if present
      if (composeRef.value && typeof composeRef.value.onPaste === "function") {
        composeRef.value.onPaste(e);
      }
    } catch (err) {
      console.error("route paste handler error", err);
    }
  };

  window.addEventListener("paste", routePasteHandler);
  // store on component so we can remove on unmount
  // @ts-ignore
  window.__gupt_route_paste_handler = routePasteHandler;
});

onBeforeUnmount(() => {
  messenger.setActiveConversation("");
  if (reminderTickTimer) clearInterval(reminderTickTimer);
  cleanupCompose();
  // remove global paste listener
  // @ts-ignore
  const h = window.__gupt_route_paste_handler;
  if (h) {
    window.removeEventListener("paste", h);
    // @ts-ignore
    window.__gupt_route_paste_handler = null;
  }
});
</script>

<template>
  <div class="chat-shell flex flex-col h-full">
    <!-- Sub-header: back button + room title + relay status + call buttons -->
    <div class="chat-header-modern shrink-0">
      <div class="flex min-h-18 items-center gap-3 px-3 py-3 sm:px-4 md:px-5">
        <button
          @click="router.push('/')"
          class="ui-icon-button flex h-10 w-10 shrink-0 lg:hidden"
          title="Back"
        >
          <ArrowLeft class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
        </button>
        <!-- Peer avatar in header -->
        <button
          v-if="peerPubkey"
          @click="router.push('/profile/' + peerPubkey)"
          class="shrink-0 focus:outline-none"
          :title="'View ' + displayName(peerPubkey) + '\u2019s profile'"
        >
          <RoboAvatar
            :pubkey="peerPubkey"
            :src="profilePicture(peerPubkey)"
            size="sm"
            :hoverable="true"
          />
        </button>
        <div class="min-w-0 flex-1 leading-tight">
          <p class="text-sm font-bold truncate">
            {{ title || "Conversation" }}
          </p>
          <p class="text-[11px] truncate text-zinc-500">
            <template v-if="peerPubkey">End-to-end encrypted</template>
            <template v-else>No peer selected</template>
          </p>
        </div>

        <span
          class="inline-block h-2 w-2 rounded-full transition-colors duration-300"
          :class="relayConnected ? 'bg-emerald-400' : 'bg-zinc-600'"
          :title="relayConnected ? 'Connected' : 'Connecting…'"
        />

        <div v-if="peerPubkey" class="flex items-center gap-1.5 sm:gap-2">
          <button
            @click="copyPeerKey"
            class="ui-icon-button h-10 w-10 flex"
            :class="peerKeyCopied ? 'text-emerald-400' : 'text-zinc-400'"
            :title="peerKeyCopied ? 'Copied!' : 'Copy public key'"
          >
            <Copy v-if="!peerKeyCopied" class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
            <Check v-else class="w-4 h-4" :stroke-width="2.5" aria-hidden="true" />
          </button>
          <button
            @click="handlePing"
            :disabled="!peerPubkey || pingCooldown || pingSending"
            class="ui-icon-button h-10 w-10 flex disabled:opacity-40 disabled:cursor-not-allowed"
            :class="pingSent ? 'text-emerald-400' : 'text-zinc-400'"
            :title="
              pingSent
                ? 'Ping sent!'
                : pingCooldown
                  ? 'Ping on cooldown'
                  : 'Notify offline via ntfy.sh'
            "
          >
            <Check v-if="pingSent" class="w-4 h-4" :stroke-width="2.5" aria-hidden="true" />
            <Bell v-else class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <button
            @click="showCallMenu = true"
            :disabled="!peerPubkey || sending"
            class="ui-icon-button-primary h-10 w-10 flex disabled:opacity-40 disabled:cursor-not-allowed"
            title="Start a call"
          >
            <Phone class="w-5 h-5" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="flex-1 flex items-center justify-center text-zinc-500 text-sm">
      <span class="animate-pulse">Loading conversation…</span>
    </div>

    <div v-else-if="error && !peerPubkey" class="flex-1 flex items-center justify-center px-6">
      <div class="text-center space-y-3 max-w-sm">
        <p class="text-red-400 text-sm">{{ error }}</p>
      </div>
    </div>

    <div v-else class="relative flex min-h-0 flex-1 flex-col">
      <ChatMessageList
        ref="messageListRef"
        :items="messagesWithSeparators"
        :item-memo-deps="messageMemoDeps"
        @scroll="onScroll"
        @layout-resize="onLayoutResize"
      >
        <template #header>
          <div class="flex flex-col items-center gap-2 py-6 mb-2">
            <button
              @click="router.push('/profile/' + peerPubkey)"
              class="flex flex-col items-center gap-2 group focus:outline-none"
              :title="'View ' + displayName(peerPubkey) + '\u2019s profile'"
            >
              <RoboAvatar
                :pubkey="peerPubkey"
                :src="profilePicture(peerPubkey)"
                size="xl"
                :hoverable="true"
              />
              <p class="text-sm font-semibold group-hover:text-sky-400 transition-colors">
                {{ displayName(peerPubkey) }}
              </p>
            </button>
            <p class="text-xs text-zinc-500">End-to-end encrypted</p>
          </div>
        </template>

        <template #before-list>
          <LoadOlderButton
            v-if="hasMoreOlder && oldestTs"
            :loading="loadingOlder"
            @click="loadOlderMessages"
          />
          <AppAlertBanner v-if="error && peerPubkey" :message="error" class="mx-2 mb-3" />
        </template>

        <template #empty>
          <div class="text-center text-zinc-500 text-sm">No messages yet. Say hello!</div>
        </template>

        <template #item="{ item, index, prevItem }">
          <div
            v-if="item.__dateSeparator"
            class="chat-date-separator flex items-center justify-center py-2 px-1"
          >
            <span class="chat-date-pill text-[10px] font-medium px-3 py-1 rounded-full select-none">
              {{ item.label }}
            </span>
          </div>
          <CallEventLine v-else-if="item.type === 'call-event'" :message="item" />
          <ChatMessageBubble
            v-else
            :message="item"
            :mine="item.mine"
            :blob-url="mediaBlobUrls[item.id] || null"
            :media-progress="mediaProgress[item.id] || null"
            :has-failed="!!decryptFailed[item.id]"
            :sender-avatar="profilePicture(item.sender) || roboHashUrl(item.sender)"
            :is-consecutive="isConsecutiveMessage(item, prevItem)"
            @download="downloadMedia"
            @reply="handleReply"
            @react="handleReact"
            @edit="handleEdit"
          />
        </template>
      </ChatMessageList>

      <NewMessagesPill :count="unseenCount" @click="scrollToBottomAfterLayout('smooth')" />

        <!-- Typing indicator -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-2"
        >
          <ChatTypingIndicator
            v-if="peerIsTyping"
            :name="displayName(peerPubkey)"
          />
        </Transition>
    </div>

    <ReplyReminderPrompt
      v-if="showReplyReminder && peerPubkey"
      :room-id="roomId"
      :peer-pubkey="peerPubkey"
    />
    <ChatComposeBar
      ref="composeRef"
      v-if="peerPubkey"
      v-model="inputText"
      :disabled="uploadLoading"
      :disable-mic="callActivWithPeer"
      :is-recording="isRecording"
      :recording-seconds="recordingSeconds"
      :upload-status="uploadStatus"
      :replying-to="replyingTo"
      :editing-message="editingMessage"
      @send="sendMessage"
      @file-selected="handleFileSelected"
      @toggle-recording="handleToggleRecording"
      @cancel-recording="cancelVoiceRecording"
      @cancel-reply="cancelReply"
      @cancel-edit="cancelEdit"
    />

    <CallMenuModal
      :show="showCallMenu"
      @close="showCallMenu = false"
      @audio="startAudioCall"
      @video="startVideoCall"
      @talky="startMeeting"
    />
  </div>
</template>
