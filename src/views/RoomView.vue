<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeft, Check, Copy, Phone, Video } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import ChatComposeBar from "@/components/chat/ChatComposeBar.vue";
import ChatMessageBubble from "@/components/chat/ChatMessageBubble.vue";
import LoadOlderButton from "@/components/LoadOlderButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { useDexieLiveQuery } from "@/composables/useDexieLiveQuery";
import { api, getActiveRelays, getPrimaryRelay } from "@/lib/api";
import { createDirectCallSession } from "@/lib/calls";
import { bytesToBase64 } from "@/lib/chatUtils";
import { shortId, roboHashUrl } from "@/lib/crypto";
import {
  clearStagedUpload,
  deleteCachedRoomMessage,
  getRoomMeta,
  getStagedUpload,
  listCachedRoomMessages,
  putCachedRoomMessage,
  putDecCached,
  putRoomMeta,
  stageUpload,
} from "@/lib/idb";
import { useChatMedia } from "@/composables/useChatMedia";
import { useChatRecorder } from "@/composables/useChatRecorder";
import { useProfileCache } from "@/composables/useProfileCache";
import { logStartupOnce } from "@/lib/startupMetrics";
import { startAppSync } from "@/lib/sync";
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
const seenSignalIds = new Set();
const latestRealtimeFetchTs = ref(Date.now() - 5000);

const { data: roomInfoData, loading: roomInfoLoading } = useDexieLiveQuery(
  () => (roomId.value ? getRoomMeta(roomId.value) : null),
  { deps: [() => roomId.value], initialValue: null },
);

const { data: messageRows, loading: messagesLoading } = useDexieLiveQuery(
  () => (roomId.value ? listCachedRoomMessages(roomId.value) : []),
  { deps: [() => roomId.value], initialValue: [] },
);

const roomInfo = computed(() => roomInfoData.value);
const messages = computed(() => messageRows.value);
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

const callState = ref("idle");
const callDirection = ref("");
const callMedia = ref({ audio: true, video: false });
const incomingCall = ref(null);
const callError = ref("");
const localCallStream = ref(null);
const remoteCallStream = ref(null);
const localHasVideo = ref(false);
const remoteHasVideo = ref(false);
const localVideoEl = ref(null);
const remoteVideoEl = ref(null);
const remoteAudioEl = ref(null);

const canStartCall = computed(
  () =>
    Boolean(peerPubkey.value) &&
    callState.value === "idle" &&
    !sending.value &&
    !uploadLoading.value &&
    !isRecording.value,
);
const canAnswerCall = computed(() => callState.value === "incoming" && Boolean(incomingCall.value));
const hasLiveCall = computed(() => callState.value !== "idle");
const callHeadline = computed(() => {
  if (callState.value === "incoming")
    return incomingCall.value?.media?.video ? "Incoming video call" : "Incoming audio call";
  if (callState.value === "requesting-media")
    return callMedia.value.video ? "Preparing video call" : "Preparing audio call";
  if (callState.value === "outgoing")
    return callMedia.value.video ? "Calling with video" : "Calling with audio";
  if (callState.value === "connecting")
    return callMedia.value.video ? "Connecting video call" : "Connecting audio call";
  if (callState.value === "connected")
    return callMedia.value.video ? "Video call live" : "Audio call live";
  return "";
});
const callSubtitle = computed(() => {
  if (callState.value === "incoming") return "Accept to answer or decline to stay in chat.";
  if (callState.value === "requesting-media")
    return callMedia.value.video
      ? "Waiting for camera and microphone permission."
      : "Waiting for microphone permission.";
  if (callState.value === "outgoing") return "Offer sent through the encrypted DM relay path.";
  if (callState.value === "connecting") return "Exchanging peer connection details.";
  if (callState.value === "connected")
    return "Media is flowing over WebRTC for this 1:1 conversation.";
  return "";
});

let liveSubscription = null;
let pollTimer = null;
let ringtoneContext = null;
let ringtoneTimer = null;

function playRingPulse(context, startAt) {
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.0001, startAt);

  for (const [index, frequency] of [880, 660].entries()) {
    const oscillator = context.createOscillator();
    const toneStart = startAt + index * 0.32;
    const toneEnd = toneStart + 0.18;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, toneStart);
    oscillator.connect(gain);

    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(0.08, toneStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

    oscillator.start(toneStart);
    oscillator.stop(toneEnd + 0.02);
  }
}

async function startIncomingRingtone() {
  if (ringtoneContext || typeof window === "undefined") return;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    console.warn("[gupt-call-ringtone] AudioContext is not available in this browser");
    return;
  }

  try {
    ringtoneContext = new AudioContextCtor();
    if (ringtoneContext.state === "suspended") {
      await ringtoneContext.resume();
    }

    console.info("[gupt-call-ringtone] start incoming ringtone");
    playRingPulse(ringtoneContext, ringtoneContext.currentTime + 0.05);
    ringtoneTimer = setInterval(() => {
      if (!ringtoneContext) return;
      playRingPulse(ringtoneContext, ringtoneContext.currentTime + 0.05);
    }, 2200);
  } catch (ringtoneError) {
    console.warn("[gupt-call-ringtone] failed to start incoming ringtone", ringtoneError);
    stopIncomingRingtone();
  }
}

function stopIncomingRingtone() {
  if (ringtoneTimer) clearInterval(ringtoneTimer);
  ringtoneTimer = null;

  if (!ringtoneContext) return;
  console.info("[gupt-call-ringtone] stop incoming ringtone");
  const context = ringtoneContext;
  ringtoneContext = null;
  void context.close().catch(() => {});
}

const callSession = createDirectCallSession({
  onSignal(payload) {
    return sendCallSignal(payload);
  },
  onIncoming(offer) {
    incomingCall.value = offer;
    callError.value = "";
    void startIncomingRingtone();
  },
  onStateChange(meta) {
    callState.value = meta.state;
    callDirection.value = meta.direction || "";
    callMedia.value = { audio: meta.media?.audio !== false, video: Boolean(meta.media?.video) };
    if (meta.state !== "incoming") incomingCall.value = null;
    if (meta.state !== "idle") callError.value = "";
    if (meta.state !== "incoming") stopIncomingRingtone();
  },
  onLocalStream(stream) {
    localCallStream.value = stream;
    localHasVideo.value = Boolean(stream?.getVideoTracks?.().length);
  },
  onRemoteStream(stream) {
    remoteCallStream.value = stream;
    remoteHasVideo.value = Boolean(stream?.getVideoTracks?.().length);
  },
  onEnded() {
    incomingCall.value = null;
    localHasVideo.value = false;
    remoteHasVideo.value = false;
    stopIncomingRingtone();
  },
});

function scrollBottom() {
  nextTick(() => {
    if (msgsContainer.value) msgsContainer.value.scrollTop = msgsContainer.value.scrollHeight;
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

async function updateRoomCacheMeta(lastMessageTs = 0, replied = false) {
  if (!peerPubkey.value || !roomId.value) return;

  await putRoomMeta(roomId.value, {
    peerPubkey: peerPubkey.value,
    name: roomInfo.value?.name || title.value,
    type: "dm",
    replied,
    lastMessageTs,
    updatedAt: Date.now(),
  });
}

async function putLocalMessage(payload) {
  if (!roomId.value) return null;

  const message = {
    id: `local-${payload.ts}`,
    sender: identity.pubkeyHex,
    mine: true,
    created_at: payload.ts,
    ...payload,
  };

  await putCachedRoomMessage(roomId.value, message);
  await updateRoomCacheMeta(payload.ts, true);
  return message;
}

async function putConfirmedMessage(messageId, payload) {
  if (!roomId.value) return null;

  return await putCachedRoomMessage(roomId.value, {
    id: messageId,
    sender: identity.pubkeyHex,
    mine: true,
    created_at: payload.ts,
    ...payload,
  });
}

async function persistFetchedChatRows(rows) {
  if (!roomId.value || !peerPubkey.value) return;

  const chatRows = rows.filter(isChatMessage);
  if (!chatRows.length) return;

  await Promise.all(chatRows.map((row) => putCachedRoomMessage(roomId.value, row)));
  await updateRoomCacheMeta(
    chatRows.reduce((latest, row) => Math.max(latest, Number(row.ts || row.created_at || 0)), 0),
    chatRows.some((row) => row.mine),
  );
}

function isChatMessage(row) {
  return row?.type === "text" || row?.type === "voice" || row?.type === "media";
}

function isCallSignal(row) {
  return ["call-offer", "call-answer", "call-ice", "call-reject", "call-hangup"].includes(
    row?.type,
  );
}

async function handleCallSignal(row) {
  if (!isCallSignal(row) || row.mine) return;

  try {
    console.info(`[gupt-call-signal ${row.callId || row.id}] received ${row.type}`, {
      from: row.sender,
      createdAt: row.created_at,
      hasSdp: Boolean(row.sdp),
      hasCandidate: Boolean(row.candidate),
    });
    await callSession.handleSignal(row);
  } catch (e) {
    console.error(`[gupt-call-signal ${row.callId || row.id}] failed to process ${row.type}`, e);
    callError.value = e.message || "Unable to process the call update.";
  }
}

async function processConversationRows(rows, options = {}) {
  const signalRows = [];
  const now = Date.now();
  const snapshot = callSession.getSnapshot();

  for (const row of rows) {
    if (isChatMessage(row) && options.persist !== false) {
      await persistFetchedChatRows([row]);
      continue;
    }

    if (!isCallSignal(row) || seenSignalIds.has(row.id)) continue;
    seenSignalIds.add(row.id);

    const isRelevant =
      options.fromRealtime || snapshot.state !== "idle" || now - row.created_at < 30000;
    if (isRelevant) signalRows.push(row);
  }

  for (const row of signalRows) {
    await handleCallSignal(row);
  }
}

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
    await persistFetchedChatRows(rows);
  } catch (e) {
    error.value = e.message || "Unable to load older messages.";
  } finally {
    loadingOlder.value = false;
  }
}

async function recoverRecentConversationRows() {
  await initPromise;
  if (!peerPubkey.value) return;

  const now = Date.now();
  const sinceMs = Math.max(0, latestRealtimeFetchTs.value - 5000);
  latestRealtimeFetchTs.value = now;

  try {
    const { messages: rows } = await api.getDirectMessages(
      identity.privkeyHex,
      identity.pubkeyHex,
      peerPubkey.value,
      sinceMs,
    );
    await processConversationRows(rows, { fromRealtime: true, persist: true });
  } catch {
    // Realtime recovery is best-effort; keep the active subscription as primary.
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    void recoverRecentConversationRows();
  }, 4000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function startLiveSubscription() {
  if (!peerPubkey.value || !identity.privkeyHex || !identity.pubkeyHex) return;

  stopLiveSubscription();
  latestRealtimeFetchTs.value = Date.now();
  liveSubscription = api.subscribeDirectMessages(
    identity.privkeyHex,
    identity.pubkeyHex,
    peerPubkey.value,
    {
      next(row) {
        void processConversationRows([row], { fromRealtime: true, persist: true });
      },
      error(subscriptionError) {
        error.value = subscriptionError.message || "Realtime relay subscription failed.";
      },
    },
    Date.now() - 5000,
  );
}

function stopLiveSubscription() {
  liveSubscription?.unsubscribe?.();
  liveSubscription = null;
}

async function sendCallSignal(payload) {
  await initPromise;
  if (!peerPubkey.value) return;

  try {
    console.info(`[gupt-call-signal ${payload.callId || "pending"}] sending ${payload.type}`, {
      to: peerPubkey.value,
      hasSdp: Boolean(payload.sdp),
      hasCandidate: Boolean(payload.candidate),
    });
    await api.postDirectMessage(identity.privkeyHex, peerPubkey.value, {
      ...payload,
      ts: Date.now(),
    });
    console.info(`[gupt-call-signal ${payload.callId || "pending"}] sent ${payload.type}`);
  } catch (e) {
    console.error(
      `[gupt-call-signal ${payload.callId || "pending"}] failed to send ${payload.type}`,
      e,
    );
    callError.value = e.message || "Unable to send call signal.";
    throw e;
  }
}

async function startAudioCall() {
  await initPromise;
  if (!canStartCall.value) return;
  callError.value = "";
  console.info(`[gupt-call-ui ${peerPubkey.value}] start audio call requested`);

  try {
    await callSession.startOutgoingCall({ audio: true, video: false });
  } catch (e) {
    callError.value = e.message || "Unable to start the audio call.";
  }
}

async function startVideoCall() {
  await initPromise;
  if (!canStartCall.value) return;
  callError.value = "";
  console.info(`[gupt-call-ui ${peerPubkey.value}] start video call requested`);

  try {
    await callSession.startOutgoingCall({ audio: true, video: true });
  } catch (e) {
    callError.value = e.message || "Unable to start the video call.";
  }
}

async function acceptIncomingCall() {
  await initPromise;
  if (!canAnswerCall.value) return;
  callError.value = "";
  console.info(
    `[gupt-call-ui ${incomingCall.value?.callId || peerPubkey.value}] accept incoming call`,
  );

  try {
    await callSession.acceptIncomingCall();
  } catch (e) {
    callError.value = e.message || "Unable to answer the call.";
  }
}

function declineIncomingCall() {
  console.info(
    `[gupt-call-ui ${incomingCall.value?.callId || peerPubkey.value}] decline incoming call`,
  );
  callSession.declineIncomingCall();
}

function hangupCall(reason = "hangup") {
  console.info(`[gupt-call-ui ${peerPubkey.value}] hangup`, { reason });
  callSession.hangup(reason);
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
            server: loc.server || "",
            type: loc.type || "",
            ok: Boolean(loc.ok),
            url: loc.url || "",
            cid: loc.cid || "",
            sha256: loc.sha256 || "",
            method: loc.method || "",
            raw: loc.raw || null,
          })),
      },
      ts: now,
      ...extra,
    };

    const localMessage = await putLocalMessage(payload);
    rememberBlobUrl(localMessage.id, rawBuf, payload.media.mime);
    await putDecCached(localMessage.id, rawBuf, payload.media.mime);

    const { id: confirmedId } = await api.postDirectMessage(
      identity.privkeyHex,
      peerPubkey.value,
      payload,
    );

    if (confirmedId && confirmedId !== localMessage.id) {
      await deleteCachedRoomMessage(localMessage.id);
      await putConfirmedMessage(confirmedId, payload);
      const url = mediaBlobUrls[localMessage.id];
      if (url) {
        mediaBlobUrls[confirmedId] = url;
        delete mediaBlobUrls[localMessage.id];
      }
      await putDecCached(confirmedId, rawBuf, payload.media.mime);
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

  error.value = "";
  sending.value = true;
  const now = Date.now();
  const payload = { type: "text", text, ts: now };
  const localMessage = await putLocalMessage(payload);
  inputText.value = "";
  sending.value = false;

  try {
    const { id: confirmedId } = await api.postDirectMessage(
      identity.privkeyHex,
      peerPubkey.value,
      payload,
    );
    if (confirmedId && confirmedId !== localMessage?.id) {
      await deleteCachedRoomMessage(localMessage.id);
      await putConfirmedMessage(confirmedId, payload);
    }
  } catch (e) {
    if (localMessage?.id) {
      await deleteCachedRoomMessage(localMessage.id);
    }
    error.value = e.message || "Unable to send the message.";
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

function syncMediaElement(element, stream, muted = false) {
  if (!element) return;
  if (element.srcObject !== (stream || null)) element.srcObject = stream || null;
  if ("muted" in element) element.muted = muted;
}

watch(
  [localVideoEl, localCallStream],
  ([element, stream]) => {
    syncMediaElement(element, stream, true);
  },
  { immediate: true },
);

watch(
  [remoteVideoEl, remoteCallStream],
  ([element, stream]) => {
    syncMediaElement(element, stream, false);
  },
  { immediate: true },
);

watch(
  [remoteAudioEl, remoteCallStream],
  ([element, stream]) => {
    syncMediaElement(element, stream, false);
  },
  { immediate: true },
);

watch(
  peerPubkey,
  (nextPeerPubkey) => {
    if (!nextPeerPubkey) return;
    void updateRoomCacheMeta();
    startLiveSubscription();
    startPolling();
  },
  { immediate: true },
);

onMounted(() => {
  void initPromise.then(() => {
    if (peerPubkey.value) {
      void updateRoomCacheMeta();
      startLiveSubscription();
      startPolling();
      void recoverRecentConversationRows();
    }
  });
});

onBeforeUnmount(() => {
  if (uploadStatusTimer) clearTimeout(uploadStatusTimer);
  stopLiveSubscription();
  stopPolling();
  cancelVoiceRecording();
  stopIncomingRingtone();
  if (callSession.getSnapshot().state !== "idle") {
    hangupCall("cancelled");
  }
  callSession.dispose();
  cleanupMedia();
});
</script>

<template>
  <div class="flex flex-col h-dvh bg-black text-white">
    <!-- Sub-header: back button + relay status + call buttons -->
    <div
      class="bg-black border-b border-white/7 text-zinc-500 text-xs px-4 py-2 flex gap-2 items-center shrink-0"
    >
      <button
        @click="router.push('/')"
        class="h-8 w-8 -ml-1 flex items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors shrink-0"
        title="Back to messages"
      >
        <ArrowLeft class="w-4 h-4" :stroke-width="1.9" aria-hidden="true" />
      </button>
      <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
      <div v-if="peerPubkey" class="ml-auto flex items-center gap-1.5 shrink-0">
        <button
          @click="copyPeerKey"
          class="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          :class="peerKeyCopied ? 'text-emerald-400' : 'text-zinc-400'"
          :title="peerKeyCopied ? 'Copied!' : 'Copy public key'"
        >
          <Copy v-if="!peerKeyCopied" class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
          <Check v-else class="w-4 h-4" :stroke-width="2.5" aria-hidden="true" />
        </button>
        <button
          @click="startAudioCall"
          :disabled="!canStartCall"
          class="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Start an audio call"
        >
          <Phone class="w-4.5 h-4.5" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <button
          @click="startVideoCall"
          :disabled="!canStartCall"
          class="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Start a video call"
        >
          <Video class="w-4.5 h-4.5" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Active call panel -->
    <div
      v-if="peerPubkey && (hasLiveCall || callError)"
      class="border-b border-white/7 bg-zinc-950 px-4 py-3 shrink-0"
    >
      <div class="rounded-2xl border border-white/7 bg-black p-4 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold">{{ callHeadline || "Call status" }}</p>
            <p v-if="callSubtitle" class="text-xs text-zinc-400 mt-1">{{ callSubtitle }}</p>
            <p v-if="callError" class="text-xs text-red-300 mt-2">{{ callError }}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="canAnswerCall"
              @click="acceptIncomingCall"
              class="px-3 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold transition-colors"
            >
              Accept
            </button>
            <button
              v-if="canAnswerCall"
              @click="declineIncomingCall"
              class="px-3 py-2 rounded-2xl bg-zinc-900 border border-white/7 text-xs font-semibold transition-colors"
            >
              Decline
            </button>
            <button
              v-else-if="hasLiveCall"
              @click="hangupCall()"
              class="px-3 py-2 rounded-2xl bg-red-700 hover:bg-red-600 text-xs font-bold transition-colors"
            >
              End
            </button>
          </div>
        </div>

        <audio ref="remoteAudioEl" autoplay playsinline class="hidden"></audio>

        <div
          v-if="callMedia.video || localHasVideo || remoteHasVideo"
          class="grid gap-3 md:grid-cols-2"
        >
          <div
            class="rounded-2xl overflow-hidden bg-zinc-950 border border-white/7 aspect-video flex items-center justify-center text-sm text-zinc-500"
          >
            <video
              v-show="remoteHasVideo"
              ref="remoteVideoEl"
              autoplay
              playsinline
              class="h-full w-full object-cover"
            ></video>
            <div v-if="!remoteHasVideo">
              {{
                callState === "connected"
                  ? "Waiting for remote video…"
                  : "Remote video will appear here."
              }}
            </div>
          </div>
          <div
            class="rounded-2xl overflow-hidden bg-zinc-950 border border-white/7 aspect-video flex items-center justify-center text-sm text-zinc-500"
          >
            <video
              v-show="localHasVideo"
              ref="localVideoEl"
              autoplay
              playsinline
              muted
              class="h-full w-full object-cover scale-x-[-1]"
            ></video>
            <div v-if="!localHasVideo">Your camera preview will appear here.</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="flex-1 flex items-center justify-center text-zinc-600 text-sm">
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
            :story-ring="true"
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
      <div v-if="!messages.length" class="text-center text-zinc-700 text-sm pt-4">
        No messages yet. Say hello!
      </div>

      <!-- Message bubbles -->
      <ChatMessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        :mine="msg.mine"
        :blob-url="mediaBlobUrls[msg.id] || null"
        :is-loading="!!mediaLoading[msg.id]"
        :has-failed="!!decryptFailed[msg.id]"
        :sender-avatar="profilePicture(msg.sender) || roboHashUrl(msg.sender)"
        class="px-1"
        @download="downloadMedia"
      />
    </div>

    <ChatComposeBar
      v-if="peerPubkey"
      v-model="inputText"
      :disabled="uploadLoading"
      :disable-mic="hasLiveCall"
      :is-recording="isRecording"
      :recording-seconds="recordingSeconds"
      :upload-status="uploadStatus"
      @send="sendMessage"
      @file-selected="handleFileSelected"
      @toggle-recording="handleToggleRecording"
      @cancel-recording="cancelVoiceRecording"
    />
  </div>
</template>
