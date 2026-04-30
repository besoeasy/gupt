<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeft, Check, Copy, Link2, Phone, Video } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import ChatComposeBar from "@/components/chat/ChatComposeBar.vue";
import FundingBanner from "@/components/FundingBanner.vue";
import ChatMessageBubble from "@/components/chat/ChatMessageBubble.vue";
import LoadOlderButton from "@/components/LoadOlderButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { api, getActiveRelays } from "@/lib/api";
import { useCallStore } from "@/stores/calls";
import { bytesToBase64, getFileLabel } from "@/lib/chatUtils";
import { shortId, roboHashUrl } from "@/lib/crypto";
import { clearStagedUpload, getStagedUpload, putDecCached, stageUpload } from "@/lib/idb";
import { useChatMedia } from "@/composables/useChatMedia";
import { useChatRecorder } from "@/composables/useChatRecorder";
import { useProfileCache } from "@/composables/useProfileCache";
import { logStartupOnce } from "@/lib/startupMetrics";
import { startAppSync } from "@/lib/sync";
import { messenger } from "@/stores/messenger";
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
const uploadLoading = ref(false);
const uploadStatus = ref(null);
const error = ref("");
const loadingOlder = ref(false);
const hasMoreOlder = ref(true);
const msgsContainer = ref(null);
const callStore = useCallStore();

const replyingTo = ref(null);
const editingMessage = ref(null);
const composeRef = ref(null);
const peerIsTyping = ref(false);
let typingClearTimer = null;
let typingDebounceTimer = null;

// Hydrate this room's cached messages into the messenger store.
watch(
  roomId,
  (id) => {
    if (id) void messenger.hydrateRoom(id);
  },
  { immediate: true },
);

function handlePeerTyping() {
  peerIsTyping.value = true;
  if (typingClearTimer) clearTimeout(typingClearTimer);
  typingClearTimer = setTimeout(() => {
    peerIsTyping.value = false;
  }, 5000);
}

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
  if (message.type === "media") {
    const mime = message.media?.mime || "";
    if (mime.startsWith("image/")) return "📷 Photo";
    if (mime.startsWith("video/")) return "🎥 Video";
    return `📎 ${message.text || "File"}`;
  }
  return "";
}

function formatDateLabel(dateMs) {
  const d = new Date(dateMs);
  const now = new Date();
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const messagesWithSeparators = computed(() => {
  const result = [];
  let lastLabel = "";
  for (const msg of messages.value) {
    const ts = Number(msg.ts || msg.created_at || 0);
    if (ts) {
      const label = formatDateLabel(ts);
      if (label !== lastLabel) {
        result.push({ __dateSeparator: true, label, id: `sep-${label}` });
        lastLabel = label;
      }
    }
    result.push(msg);
  }
  return result;
});
const loading = computed(() => roomInfoLoading.value || messagesLoading.value);
const oldestTs = computed(() => {
  const firstMessage = messages.value[0];
  return Number(firstMessage?.created_at || firstMessage?.ts || 0);
});

const {
  mediaBlobUrls,
  mediaLoading,
  decryptFailed,
  rememberBlobUrl,
  preloadMedia,
  downloadMedia: _downloadMedia,
  cleanup: cleanupMedia,
} = useChatMedia();

async function downloadMedia(msg) {
  await initPromise;
  try {
    await _downloadMedia(msg);
  } catch (e) {
    error.value = e.message || "Unable to decrypt attachment.";
  }
}

const { isRecording, recordingSeconds, toggleVoiceRecording, cancelVoiceRecording } =
  useChatRecorder({
    onVoiceReady: async (rawBuf, mimeType, durationMs) => {
      uploadLoading.value = true;
      try {
        await postEncryptedMedia(rawBuf, {
          mimeType,
          fileName: `voice-note-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
          msgType: "voice",
          extra: { durationMs },
        });
      } catch (e) {
        error.value = e.message || "Unable to send voice note.";
      } finally {
        uploadLoading.value = false;
      }
    },
  });

async function handleToggleRecording() {
  error.value = "";
  try {
    await toggleVoiceRecording();
  } catch (e) {
    error.value = e.message || "Microphone access failed.";
  }
}

let uploadStatusTimer = null;

function setUploadStatus(status) {
  if (uploadStatusTimer) {
    clearTimeout(uploadStatusTimer);
    uploadStatusTimer = null;
  }
  uploadStatus.value = status;
}

function completeUploadStatus(server = "") {
  setUploadStatus({ phase: "done", server });
  uploadStatusTimer = setTimeout(() => {
    uploadStatus.value = null;
    uploadStatusTimer = null;
  }, 1400);
}

const peerPubkey = computed(() => roomInfo.value?.peerPubkey ?? "");
const title = computed(() =>
  peerPubkey.value ? displayName(peerPubkey.value) : roomInfo.value?.name || "Conversation",
);

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
  await navigator.clipboard.writeText(peerPubkey.value);
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

function scrollBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (msgsContainer.value) msgsContainer.value.scrollTop = msgsContainer.value.scrollHeight;
        // Re-scroll after a short delay to catch late layout shifts from media loading
        setTimeout(() => {
          if (msgsContainer.value) msgsContainer.value.scrollTop = msgsContainer.value.scrollHeight;
        }, 150);
      });
    });
  });
}

watch(
  messages,
  (rows, previousRows = []) => {
    for (const row of rows) {
      preloadMedia(row);
    }

    const nextLastId = rows.at(-1)?.id;
    const previousLastId = previousRows.at(-1)?.id;
    if (
      !previousRows.length ||
      (nextLastId && nextLastId !== previousLastId && !loadingOlder.value)
    ) {
      scrollBottom();
    }
  },
  { immediate: true },
);

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
    // Backfill into the messenger store (which write-throughs to Dexie).
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
  } catch (e) {
    error.value = e.message || "Unable to load older messages.";
  } finally {
    loadingOlder.value = false;
  }
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

async function startAudioCall() {
  console.info(`[gupt-call-ui ${peerPubkey.value}] start audio call requested`);
  try {
    await callStore.startAudioCall(peerPubkey.value);
  } catch (e) {
    console.error(`[gupt-call-ui] startAudioCall failed`, e);
  }
}

async function startVideoCall() {
  await initPromise;
  if (!canStartCall.value) return;
  console.info(`[gupt-call-ui ${peerPubkey.value}] start video call requested`);
  try {
    await callStore.startVideoCall(peerPubkey.value);
  } catch (e) {
    console.error(`[gupt-call-ui] startVideoCall failed`, e);
  }
}

async function postEncryptedMedia(rawBuf, { mimeType, fileName, msgType, extra = {} }) {
  await initPromise;
  const tempKey = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  setUploadStatus({ phase: "encrypting", server: "" });
  const mediaKey = crypto.getRandomValues(new Uint8Array(32));
  const mediaNonce = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", mediaKey, "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: mediaNonce },
    cryptoKey,
    rawBuf,
  );

  await stageUpload(tempKey, encrypted);

  try {
    const staged = (await getStagedUpload(tempKey)) || encrypted;
    const encryptedFile = new File([staged], `${fileName}.enc`, {
      type: "application/octet-stream",
    });
    const uploaded = await api.uploadFile(encryptedFile, {
      onProgress(update) {
        setUploadStatus({ phase: "uploading", server: update.server || "" });
      },
    });
    if (!uploaded.locations || !uploaded.locations.some((l) => l?.ok)) {
      throw new Error("Upload failed: no successful upload locations.");
    }

    const now = Date.now();
    const payload = {
      type: msgType,
      text: fileName,
      media: {
        key: bytesToBase64(mediaKey),
        nonce: bytesToBase64(mediaNonce),
        mime: mimeType || "application/octet-stream",
        name: fileName,
        size: rawBuf.byteLength,
        locations: (uploaded.locations || [])
          .filter((l) => l?.ok)
          .map((loc) => ({
            type: loc.type || "",
            url: loc.url || "",
            cid: loc.cid || "",
            sha256: loc.sha256 || "",
          })),
      },
      ts: now,
      ...(replyingTo.value
        ? {
            replyTo: replyingTo.value.id,
            replyExcerpt:
              getFileLabel(replyingTo.value) || replyingTo.value.text?.slice(0, 40) || "",
          }
        : {}),
      ...extra,
    };

    replyingTo.value = null;

    // Optimistic insert via the messenger store; it will reconcile the id once
    // the relay confirms the publish.
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
    }

    completeUploadStatus(uploaded.server || "");
  } finally {
    await clearStagedUpload(tempKey).catch(() => {});
  }
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
    ...(replyingTo.value
      ? {
          replyTo: replyingTo.value.id,
          replyExcerpt: getFileLabel(replyingTo.value) || replyingTo.value.text?.slice(0, 40) || "",
        }
      : {}),
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

async function handleFileSelected(file) {
  await initPromise;
  if (!file || !peerPubkey.value) return;
  error.value = "";
  uploadLoading.value = true;
  try {
    const rawBuf = await file.arrayBuffer();
    await postEncryptedMedia(rawBuf, {
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
      msgType: "media",
    });
  } catch (err) {
    error.value = err.message || "Unable to upload attachment.";
  } finally {
    uploadLoading.value = false;
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

watch(inputText, (val) => {
  if (!val || !peerPubkey.value || !identity.privkeyHex) return;
  if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
  typingDebounceTimer = setTimeout(async () => {
    if (!peerPubkey.value || !identity.privkeyHex) return;
    try {
      await api.postDirectMessage(identity.privkeyHex, peerPubkey.value, {
        type: "typing",
        ts: Date.now(),
      });
    } catch {
      // typing indicators are best-effort
    }
  }, 1500);
});

onMounted(() => {
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
  if (uploadStatusTimer) clearTimeout(uploadStatusTimer);
  if (typingClearTimer) clearTimeout(typingClearTimer);
  if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
  cancelVoiceRecording();
  // Call stays alive in the global store when navigating away.
  cleanupMedia();
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
  <div class="flex flex-col h-full bg-black text-white">
    <!-- Sub-header: back button + room title + relay status + call buttons -->
    <div class="bg-black border-b border-white/7 text-white shrink-0">
      <div class="flex items-center gap-3 px-4 py-3 md:px-5 md:py-3">
        <button
          @click="router.push('/')"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors lg:hidden"
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
            :story-ring="false"
            :hoverable="true"
          />
        </button>
        <div class="min-w-0 flex-1 leading-tight">
          <p class="text-sm font-bold text-white truncate">
            {{ title || "Conversation" }}
          </p>
          <p
            class="text-[11px] truncate transition-colors duration-300"
            :class="peerIsTyping ? 'text-emerald-400' : 'text-zinc-500'"
          >
            <template v-if="peerIsTyping">typing…</template>
            <template v-else-if="peerPubkey">End-to-end encrypted</template>
            <template v-else>No peer selected</template>
          </p>
        </div>

        <span
          class="inline-block h-2 w-2 rounded-full transition-colors duration-300"
          :class="relayConnected ? 'bg-emerald-400' : 'bg-zinc-600'"
          :title="relayConnected ? 'Connected' : 'Connecting…'"
        />

        <div v-if="peerPubkey" class="flex items-center gap-2">
          <button
            @click="copyPeerKey"
            class="h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            :class="peerKeyCopied ? 'text-emerald-400' : 'text-zinc-400'"
            :title="peerKeyCopied ? 'Copied!' : 'Copy public key'"
          >
            <Copy v-if="!peerKeyCopied" class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
            <Check v-else class="w-4 h-4" :stroke-width="2.5" aria-hidden="true" />
          </button>
          <button
            @click="startMeeting"
            :disabled="!peerPubkey || sending"
            class="h-9 w-9 flex items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Share a video meeting link (Talky)"
          >
            <Link2 class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <button
            @click="startAudioCall"
            :disabled="!canStartCall"
            class="h-9 w-9 flex items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Start an audio call"
          >
            <Phone class="w-5 h-5" :stroke-width="2" aria-hidden="true" />
          </button>
          <button
            @click="startVideoCall"
            :disabled="!canStartCall"
            class="h-9 w-9 flex items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Start a video call"
          >
            <Video class="w-5 h-5" :stroke-width="2" aria-hidden="true" />
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

    <!-- Messages scroll area -->
    <div v-else ref="msgsContainer" class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      <!-- Peer intro -->
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
            :story-ring="false"
            :hoverable="true"
          />
          <p class="text-sm font-semibold group-hover:text-sky-400 transition-colors">
            {{ displayName(peerPubkey) }}
          </p>
        </button>
        <p class="text-xs text-zinc-500">End-to-end encrypted</p>
      </div>

      <!-- Load older messages button -->
      <LoadOlderButton
        v-if="hasMoreOlder && oldestTs"
        :loading="loadingOlder"
        @click="loadOlderMessages"
      />

      <AppAlertBanner v-if="error && peerPubkey" :message="error" class="mx-2 mb-3" />
      <div v-if="!messages.length" class="text-center text-zinc-500 text-sm pt-4">
        No messages yet. Say hello!
      </div>

      <!-- Message bubbles with date separators -->
      <template v-for="(item, idx) in messagesWithSeparators" :key="item.id">
        <!-- Date separator -->
        <div v-if="item.__dateSeparator" class="flex items-center justify-center py-3 px-1">
          <span
            class="text-[10px] text-zinc-500 font-medium px-3 py-1 rounded-full bg-white/5 select-none"
          >
            {{ item.label }}
          </span>
        </div>
        <!-- Message bubble -->
        <ChatMessageBubble
          v-else
          :message="item"
          :mine="item.mine"
          :blob-url="mediaBlobUrls[item.id] || null"
          :is-loading="!!mediaLoading[item.id]"
          :has-failed="!!decryptFailed[item.id]"
          :sender-avatar="profilePicture(item.sender) || roboHashUrl(item.sender)"
          :is-consecutive="
            idx > 0 &&
            !messagesWithSeparators[idx - 1].__dateSeparator &&
            item.mine === messagesWithSeparators[idx - 1].mine &&
            item.sender === messagesWithSeparators[idx - 1].sender &&
            Math.abs(Number(item.ts || 0) - Number(messagesWithSeparators[idx - 1].ts || 0)) <
              300000
          "
          class="px-1"
          @download="downloadMedia"
          @reply="handleReply"
          @react="handleReact"
          @edit="handleEdit"
        />
      </template>
    </div>

    <div v-if="peerIsTyping && peerPubkey" class="shrink-0 flex items-center gap-2 px-4 py-2">
      <RoboAvatar :pubkey="peerPubkey" size="sm" :story-ring="false" />
      <span class="flex items-center gap-0.5">
        <span
          v-for="i in 3"
          :key="i"
          class="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"
          :style="{ animationDelay: `${(i - 1) * 150}ms` }"
        ></span>
      </span>
    </div>

    <FundingBanner />
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
  </div>
</template>
