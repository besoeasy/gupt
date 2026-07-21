<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeft, Check, Copy, Link2, Phone, Video, Bell, ShieldCheck } from "@lucide/vue";
import { useRoute, useRouter } from "vue-router";
import { enqueueSend } from "@/lib/sendQueue";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import ChatComposeBar from "@/components/chat/ChatComposeBar.vue";
import ChatMessageList from "@/components/chat/ChatMessageList.vue";
import NewMessagesPill from "@/components/chat/NewMessagesPill.vue";
import { useChatScroll } from "@/composables/useChatScroll";
import { withDateSeparators } from "@/lib/chatListUtils";
import CallEventLine from "@/components/chat/CallEventLine.vue";
import CallRequestCard from "@/components/chat/CallRequestCard.vue";
import CallMenuModal from "@/components/chat/CallMenuModal.vue";
import ChatMessageBubble from "@/components/chat/ChatMessageBubble.vue";
import LoadOlderButton from "@/components/LoadOlderButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { api } from "@/lib/api";
import { useCallStore } from "@/stores/calls";
import { useCallNavigation } from "@/composables/useCallNavigation";
import { copyToClipboard } from "@/lib/clipboard";
import { buildReplyMeta } from "@/lib/chatUtils";
import { shortId, roboHashUrl } from "@/lib/crypto";
import { putDecCached } from "@/lib/idb";
import { useConversationCompose } from "@/composables/useConversationCompose";
import { useProfileCache } from "@/composables/useProfileCache";
import { useLastSeen } from "@/composables/useLastSeen";
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
  typingTimeout = setTimeout(() => {
    peerIsTyping.value = false;
  }, 4000);
}
defineExpose({ setPeerTyping });

onMounted(() => {
  messenger.setTypingSignalHandler((senderPubKey) => {
    if (senderPubKey === peerPubkey.value) {
      setPeerTyping();
    }
  });
});

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

const roomInfo = computed(() => messenger.roomMeta[roomId.value] || null);
const messageRows = computed(() => messenger.roomMessages[roomId.value] || []);
const roomInfoLoading = computed(() => false);
const messagesLoading = computed(
  () => !messenger.roomMessages[roomId.value] && !messenger.hydratedInbox.value,
);

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
  const rows = messageRows.value || [];
  const active = [];
  const reactMap = new Map();
  const editMap = new Map();
  const readSet = new Set();

  for (const row of rows) {
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

function getMessagePreview(message) {
  if (!message) return "";
  if (message.type === "text") return message.text || "";
  if (message.type === "voice") return "🎤 Voice note";
  if (message.type === "media") {
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
// useLastSeen must be called AFTER peerPubkey is defined (TDZ safety).
const { lastSeenLabel, loading: lastSeenLoading } = useLastSeen(peerPubkey);
const title = computed(() =>
  peerPubkey.value ? displayName(peerPubkey.value) : roomInfo.value?.name || "Conversation",
);

const sentCount = computed(() => messages.value.filter((m) => m.mine).length);
const isTrusted = computed(() => sentCount.value >= 7);

let lastTypingSent = 0;
watch(inputText, (newVal) => {
  try {
    if (newVal && peerPubkey.value) {
      const now = Date.now();

      if (now - lastTypingSent > 10000) {
        lastTypingSent = now;
        api
          .postDirectMessage(identity.privkeyHex, peerPubkey.value, {
            type: "typing",
            active: true,
          })
          .catch(() => {});
      }
    }
  } catch (err) {
    console.error("Error in inputText watcher:", err);
  }
});

const {
  uploadLoading,
  uploadStatus,
  isRecording,
  recordingSeconds,
  cancelVoiceRecording,
  handleToggleRecording,
  handleFileSelected,
  downloadMedia,
  retryMedia,
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
    nextTick(() => nextTick(() => messageListRef.value?.remeasure?.()));
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

const callState = computed(() => callStore.callState);

const canStartCall = computed(
  () =>
    Boolean(peerPubkey.value) &&
    callState.value === "idle" &&
    !sending.value &&
    !uploadLoading.value &&
    !isRecording.value,
);

const callActivWithPeer = computed(
  () => callState.value !== "idle" && callStore.activePeerPubkey === peerPubkey.value,
);

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
      router.replace("/");
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
  if (
    !item ||
    !prevItem ||
    prevItem.__dateSeparator ||
    prevItem.type === "call-event" ||
    prevItem.type === "call-request"
  )
    return false;
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
  await initPromise;
  let failed = false;
  try {
    await callStore.sendCallRequest(peerPubkey.value, { audio: true, video: false });
  } catch (e) {
    failed = true;
    error.value = e.message || "Unable to send call request.";
    console.error(`[gupt-call-ui] sendCallRequest failed`, e);
  }
  if (!failed) await openCallSurface(peerPubkey.value, { requesting: "audio" });
}

async function startVideoCall() {
  await initPromise;
  if (!canStartCall.value) return;
  let failed = false;
  try {
    await callStore.sendCallRequest(peerPubkey.value, { audio: true, video: true });
  } catch (e) {
    failed = true;
    error.value = e.message || "Unable to send call request.";
    console.error(`[gupt-call-ui] sendCallRequest failed`, e);
  }
  if (!failed) await openCallSurface(peerPubkey.value, { requesting: "video" });
}

function handleAcceptCallRequest(message) {
  callStore.acceptCallRequest(message);
  void openCallSurface(message.sender);
}

function handleDeclineCallRequest(message) {
  callStore.declineCallRequest(message);
}

async function sendMessage() {
  await initPromise;
  const text = inputText.value.trim();
  if (!text || !peerPubkey.value || sending.value || uploadLoading.value || isRecording.value)
    return;

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

const processedReceiptIds = new Set();

watch(
  () => messages.value.length,
  (newLen, oldLen) => {
    const msgs = messages.value;
    if (!msgs || msgs.length === 0 || !peerPubkey.value || !identity.pubkeyHex) return;

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
    const room = roomId.value;
    for (const m of peerMsgs) {
      if (!processedReceiptIds.has(m.id)) {
        processedReceiptIds.add(m.id);
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

onMounted(() => {
  reminderTickTimer = setInterval(() => {
    reminderNowMs.value = Date.now();
  }, 30_000);

  void initPromise.then(() => {
    if (roomId.value) void messenger.hydrateRoom(roomId.value);
  });

  const routePasteHandler = (e) => {
    try {
      if (composeRef.value && typeof composeRef.value.onPaste === "function") {
        composeRef.value.onPaste(e);
      }
    } catch (err) {
      console.error("route paste handler error", err);
    }
  };

  window.addEventListener("paste", routePasteHandler);

  window.__gupt_route_paste_handler = routePasteHandler;
});

onBeforeUnmount(() => {
  messenger.setTypingSignalHandler(null);
  messenger.setActiveConversation("");
  if (reminderTickTimer) clearInterval(reminderTickTimer);
  cleanupCompose();
  // remove global paste listener
  // @ts-ignore
  const h = window.__gupt_route_paste_handler;
  if (h) {
    window.removeEventListener("paste", h);

    window.__gupt_route_paste_handler = null;
  }
});
</script>

<template>
  <div class="flex flex-col h-full bg-(--app-bg) text-(--app-text)">
    <!-- Sub-header: back button + room title + relay status + call buttons -->
    <div
      class="shrink-0 border-b border-(--app-border) bg-[color-mix(in_srgb,var(--app-bg)_82%,transparent)] ]"
    >
      <div class="flex min-h-18 items-center gap-3 px-3 py-3 sm:px-4 md:px-5">
        <button
          @click="router.push('/')"
          class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          title="Back"
        >
          <ArrowLeft class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
        </button>
        <!-- Peer avatar in header -->
        <button
          v-if="peerPubkey"
          @click="router.push('/profile/' + peerPubkey)"
          class="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
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
          <p class="text-sm font-bold truncate flex items-center gap-1.5">
            {{ title || "Conversation" }}
            <template v-if="peerPubkey">
              <ShieldCheck
                v-if="isTrusted"
                class="h-3.5 w-3.5 text-emerald-400"
                title="Trusted Contact"
              />
              <span v-else class="flex items-center gap-[3px]" title="Messages sent until trusted">
                <span
                  v-for="i in 7"
                  :key="i"
                  class="w-1.5 h-1.5 rounded-full"
                  :class="i <= sentCount ? 'bg-emerald-400' : 'bg-zinc-600/50'"
                ></span>
              </span>
            </template>
          </p>
          <p
            class="text-[11px] truncate leading-snug"
            :title="peerPubkey ? 'End-to-end encrypted · ' + lastSeenLabel : ''"
          >
            <template v-if="peerPubkey">
              <span v-if="lastSeenLoading" class="inline-flex items-center gap-1 text-zinc-500">
                <span class="inline-block h-1.5 w-1.5 rounded-full bg-zinc-600 animate-pulse" />
                <span>checking…</span>
              </span>
              <span v-else class="inline-flex items-center gap-1">
                <span
                  class="inline-block h-1.5 w-1.5 rounded-full"
                  :class="lastSeenLabel === 'just now' ? 'bg-emerald-400' : 'bg-zinc-500'"
                />
                <span
                  :class="
                    lastSeenLabel === 'just now'
                      ? 'text-emerald-400 font-semibold'
                      : 'text-zinc-500'
                  "
                  >{{
                    lastSeenLabel === "unknown" ? "last seen unknown" : "last seen " + lastSeenLabel
                  }}</span
                >
              </span>
            </template>
            <template v-else><span class="text-zinc-500">No peer selected</span></template>
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
            class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            :class="peerKeyCopied ? 'text-emerald-400' : 'text-zinc-400'"
            :title="peerKeyCopied ? 'Copied!' : 'Copy public key'"
          >
            <Copy v-if="!peerKeyCopied" class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
            <Check v-else class="w-4 h-4" :stroke-width="2.5" aria-hidden="true" />
          </button>
          <button
            @click="handlePing"
            :disabled="!peerPubkey || pingCooldown || pingSending"
            class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) disabled:opacity-40 disabled:cursor-not-allowed hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
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
            v-if="isTrusted"
            @click="showCallMenu = true"
            :disabled="!peerPubkey || sending"
            class="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-(--app-primary) text-[#06101a] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-(--app-primary-strong) hover:text-white"
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
              class="flex flex-col items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
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
          <div v-if="item.__dateSeparator" class="flex items-center justify-center my-3 px-1">
            <span
              class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] text-[10px] font-medium px-3 py-1 rounded-full select-none"
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
            @retry="retryMedia"
            @reply="handleReply"
            @react="handleReact"
            @edit="handleEdit"
          />
        </template>
        <template #footer>
          <ReplyReminderPrompt
            v-if="showReplyReminder && peerPubkey"
            :room-id="roomId"
            :peer-pubkey="peerPubkey"
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
        <ChatTypingIndicator v-if="peerIsTyping" :name="displayName(peerPubkey)" />
      </Transition>
    </div>

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
