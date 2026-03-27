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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "reka-ui";

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

const messageLimit = ref(50);
const { data: messageRows, loading: messagesLoading } = useDexieLiveQuery(
  () => (roomId.value ? listCachedRoomMessages(roomId.value, messageLimit.value) : []),
  { deps: [() => roomId.value, () => messageLimit.value], initialValue: [] },
);

const roomInfo = computed(() => roomInfoData.value);
const messages = computed(() => messageRows.value.filter((m) => m.type !== "reaction"));
const reactionsByMessage = computed(() => {
  const grouped = {};
  for (const m of messageRows.value) {
    if (m.type === "reaction" && m.targetId) {
      if (!grouped[m.targetId]) grouped[m.targetId] = [];
      grouped[m.targetId].push(m);
    }
  }
  return grouped;
});
const loading = computed(() => roomInfoLoading.value || messagesLoading.value);
const oldestTs = computed(() => {
  const firstMessage = messageRows.value[0];
  return Number(firstMessage?.created_at || firstMessage?.ts || 0);
});

const composeBar = ref(null);

const replyingTo = ref(null);
function handleReply(msg) {
  replyingTo.value = msg;
  composeBar.value?.focusInput?.();
}
function cancelReply() {
  replyingTo.value = null;
}

async function handleReact(messageId, reactionText = "❤️") {
  await initPromise;
  if (!peerPubkey.value) return;

  const now = Date.now();
  const payload = {
    type: "reaction",
    targetId: messageId,
    reaction: reactionText,
    reactor: identity.pubkeyHex,
    ts: now,
  };

  const localMessage = await putLocalMessage(payload);

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
  }
}

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

function scrollBottom(smooth = false) {
  setTimeout(() => {
    window.scrollTo({
      top: document.body.scrollHeight + 50000,
      behavior: smooth ? "smooth" : "auto",
    });
  }, 100);
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
      scrollBottom(previousRows.length > 0);
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

async function putLocalMessage(message) {
  if (!roomId.value) return null;

  const nowTs = Date.now();
  const id = String(message?.id || shortId());

  const row = {
    ...message,
    id,
    sender: identity.pubkeyHex || "",
    mine: true,
    ts: Number(message?.ts || nowTs),
    created_at: Number(message?.created_at || message?.ts || nowTs),
  };

  const saved = await putCachedRoomMessage(roomId.value, row);
  await updateRoomCacheMeta(Number(saved.ts || saved.created_at || 0), Boolean(saved?.replied));
  return saved;
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
  return (
    row?.type === "text" ||
    row?.type === "voice" ||
    row?.type === "media" ||
    row?.type === "reaction"
  );
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
    if (hasLiveCall.value || row.type === "call-offer") {
      callError.value = e.message || "Unable to process the call update.";
    }
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
  messageLimit.value += 50;

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
    if (rows.length < 50) {
      hasMoreOlder.value = false;
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
            type: loc.type || "",
            url: loc.url || "",
            cid: loc.cid || "",
            sha256: loc.sha256 || "",
          })),
      },
      ts: now,
      ...extra,
    };

    if (replyingTo.value) {
      payload.replyTo = replyingTo.value.id;
      payload.replyPreview = {
        sender: displayName(replyingTo.value.sender),
        text:
          replyingTo.value.type === "text" ? replyingTo.value.text : `[${replyingTo.value.type}]`,
      };
      replyingTo.value = null;
    }

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
      const confirmedRow = {
        ...payload,
        id: confirmedId,
        sender: identity.pubkeyHex || "",
        mine: true,
        ts: Number(payload.ts || now),
        created_at: Number(payload.ts || now),
      };
      const saved = await putCachedRoomMessage(roomId.value, confirmedRow);
      await updateRoomCacheMeta(Number(saved.ts || saved.created_at || 0), Boolean(saved?.replied));
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
  if (replyingTo.value) {
    payload.replyTo = replyingTo.value.id;
    payload.replyPreview = {
      sender: displayName(replyingTo.value.sender),
      text: replyingTo.value.type === "text" ? replyingTo.value.text : `[${replyingTo.value.type}]`,
    };
    replyingTo.value = null;
  }
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
      const confirmedRow = {
        ...payload,
        id: confirmedId,
        sender: identity.pubkeyHex || "",
        mine: true,
        ts: Number(payload.ts || now),
        created_at: Number(payload.ts || now),
      };
      await putCachedRoomMessage(roomId.value, confirmedRow);
      await updateRoomCacheMeta(
        Number(confirmedRow.ts || confirmedRow.created_at || 0),
        Boolean(confirmedRow?.replied),
      );
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
  <div class="w-full flex-1 flex flex-col relative max-w-7xl mx-auto">
    <!-- Sub-header: back button + relay status + call buttons -->
    <header
      class="sticky top-[57px] z-30 flex min-h-14 items-center justify-between gap-2 border-b border-border bg-background/70 px-4 backdrop-blur-xl shrink-0"
    >
      <div class="flex items-center gap-3">
        <button
          @click="router.push('/')"
          class="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          title="Back to messages"
        >
          <ArrowLeft class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
        </button>

        <div
          v-if="peerPubkey"
          class="flex cursor-pointer items-center gap-2.5 transition-opacity hover:opacity-80"
          @click="router.push('/profile/' + peerPubkey)"
        >
          <RoboAvatar
            :pubkey="peerPubkey"
            :src="profilePicture(peerPubkey)"
            size="sm"
            :story-ring="true"
          />
          <div class="flex flex-col">
            <span class="text-sm font-semibold leading-tight">{{ displayName(peerPubkey) }}</span>
            <div class="flex items-center gap-1.5">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              <span class="text-[10px] font-medium text-muted-foreground">Secure</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="peerPubkey" class="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          @click="copyPeerKey"
          class="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          :class="peerKeyCopied ? 'text-emerald-400' : 'text-muted-foreground'"
          :title="peerKeyCopied ? 'Copied!' : 'Copy public key'"
        >
          <Copy v-if="!peerKeyCopied" class="h-4 w-4" :stroke-width="1.8" aria-hidden="true" />
          <Check v-else class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
        </button>
        <button
          @click="startAudioCall"
          :disabled="!canStartCall"
          class="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          title="Start an audio call"
        >
          <Phone class="h-4.5 w-4.5" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <button
          @click="startVideoCall"
          :disabled="!canStartCall"
          class="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          title="Start a video call"
        >
          <Video class="h-4.5 w-4.5" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
    </header>

    <!-- Active call panel -->
    <Sheet
      v-if="peerPubkey"
      :open="hasLiveCall || !!callError"
      :modal="false"
      @update:open="if (!$event && callError) callError = '';"
    >
      <SheetContent
        side="top"
        class="p-0 border-b border-border/50 bg-background/95 backdrop-blur-xl shadow-lg sm:max-w-xl mx-auto sm:mt-4 sm:rounded-2xl sm:border overflow-hidden"
        :hideClose="true"
        @interact-outside="(e) => e.preventDefault()"
      >
        <div class="w-full px-4 py-4 space-y-3">
          <VisuallyHidden><SheetTitle>Active Call</SheetTitle></VisuallyHidden>

          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-0 flex flex-1 items-center gap-3">
              <div class="relative shrink-0">
                <RoboAvatar
                  :pubkey="peerPubkey"
                  :src="profilePicture(peerPubkey)"
                  size="md"
                  :story-ring="true"
                />
                <span
                  v-if="callState === 'connected'"
                  class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse shadow-sm"
                ></span>
                <span
                  v-else-if="callState === 'incoming'"
                  class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-background animate-pulse shadow-sm"
                ></span>
              </div>
              <div class="min-w-0 flex flex-col justify-center">
                <p class="text-base font-semibold text-foreground leading-tight truncate">
                  {{ callHeadline || "Call status" }}
                </p>
                <p v-if="callSubtitle" class="text-sm text-muted-foreground truncate">
                  {{ callSubtitle }}
                </p>
                <p v-if="callError" class="text-sm font-medium text-destructive mt-0.5 truncate">
                  {{ callError }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-3 shrink-0">
              <button
                v-if="callError && !hasLiveCall"
                @click="callError = ''"
                class="flex flex-col items-center gap-1 group focus:outline-none"
              >
                <div
                  class="p-2.5 rounded-full bg-muted border border-border group-hover:bg-muted/80 transition-colors shadow-sm"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </div>
                <span
                  class="text-[10px] font-medium text-muted-foreground group-hover:text-foreground"
                  >Dismiss</span
                >
              </button>

              <template v-if="canAnswerCall">
                <button
                  @click="declineIncomingCall"
                  class="flex flex-col items-center gap-1 group focus:outline-none"
                  aria-label="Decline"
                >
                  <div
                    class="p-3 rounded-full bg-destructive group-hover:bg-destructive/90 text-white transition-transform active:scale-95 shadow-sm shadow-destructive/20"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"
                      />
                      <line x1="22" x2="2" y1="2" y2="22" />
                    </svg>
                  </div>
                  <span
                    class="text-[10px] font-medium text-destructive group-hover:text-destructive/80"
                    >Decline</span
                  >
                </button>
                <button
                  @click="acceptIncomingCall"
                  class="flex flex-col items-center gap-1 group focus:outline-none"
                  aria-label="Accept"
                >
                  <div
                    class="p-3 rounded-full bg-emerald-600 group-hover:bg-emerald-500 text-white transition-transform active:scale-95 shadow-sm shadow-emerald-500/20 animate-bounce"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
                      />
                    </svg>
                  </div>
                  <span
                    class="text-[10px] font-medium text-emerald-600 group-hover:text-emerald-500"
                    >Accept</span
                  >
                </button>
              </template>

              <button
                v-else-if="hasLiveCall"
                @click="hangupCall()"
                class="flex flex-col items-center gap-1 group focus:outline-none"
                aria-label="End Call"
              >
                <div
                  class="p-3 rounded-full bg-destructive group-hover:bg-destructive/90 text-white transition-transform active:scale-95 shadow-sm shadow-destructive/20"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"
                    />
                    <line x1="22" x2="2" y1="2" y2="22" />
                  </svg>
                </div>
                <span
                  class="text-[10px] font-medium text-destructive group-hover:text-destructive/80"
                  >End call</span
                >
              </button>
            </div>
          </div>

          <audio ref="remoteAudioEl" autoplay playsinline class="hidden"></audio>

          <div
            v-if="callMedia.video || localHasVideo || remoteHasVideo"
            class="grid gap-3 pt-1 border-t border-border/40"
            :class="localHasVideo && remoteHasVideo ? 'grid-cols-2' : 'grid-cols-1'"
          >
            <div
              v-if="remoteHasVideo || (!localHasVideo && callMedia.video)"
              class="rounded-xl overflow-hidden bg-black/90 aspect-video flex items-center justify-center text-sm text-zinc-400 relative shadow-inner"
            >
              <video
                v-show="remoteHasVideo"
                ref="remoteVideoEl"
                autoplay
                playsinline
                class="h-full w-full object-cover"
              ></video>
              <div v-if="!remoteHasVideo" class="absolute inset-0 flex items-center justify-center">
                {{ callState === "connected" ? "Waiting for video..." : "Remote video" }}
              </div>
            </div>

            <div
              v-if="localHasVideo"
              class="rounded-xl overflow-hidden bg-black/90 aspect-video flex items-center justify-center text-sm text-zinc-400 relative shadow-inner"
            >
              <video
                v-show="localHasVideo"
                ref="localVideoEl"
                autoplay
                playsinline
                muted
                class="h-full w-full object-cover scale-x-[-1]"
              ></video>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    <div v-if="loading" class="flex-1 flex items-center justify-center text-zinc-600 text-sm">
      <span class="animate-pulse">Loading conversation…</span>
    </div>

    <div v-else-if="error && !peerPubkey" class="flex-1 flex items-center justify-center px-6">
      <div class="text-center space-y-3 max-w-sm">
        <p class="text-red-400 text-sm">{{ error }}</p>
      </div>
    </div>

    <!-- Messages scroll area -->
    <div v-else ref="msgsContainer" class="flex-1 px-3 py-4 space-y-1 pb-6">
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
        <p class="text-xs text-muted-foreground">End-to-end encrypted</p>
      </div>

      <!-- Load older messages button -->
      <LoadOlderButton
        v-if="hasMoreOlder && oldestTs && messages.length >= 50"
        :loading="loadingOlder"
        @click="loadOlderMessages"
      />

      <AppAlertBanner v-if="error && peerPubkey" :message="error" class="mx-2 mb-3" />
      <div v-if="!messages.length" class="text-center text-zinc-700 text-sm pt-4">
        No messages yet. Say hello!
      </div>

      <div v-for="msg in messages" :key="msg.id" :id="'msg-' + msg.id">
        <ChatMessageBubble
          :message="msg"
          :mine="msg.mine"
          :blob-url="mediaBlobUrls[msg.id] || null"
          :is-loading="!!mediaLoading[msg.id]"
          :has-failed="!!decryptFailed[msg.id]"
          :sender-avatar="profilePicture(msg.sender) || roboHashUrl(msg.sender)"
          :reactions="reactionsByMessage[msg.id] || []"
          class="px-1"
          @download="downloadMedia"
          @reply="handleReply"
          @react="handleReact"
        />
      </div>
    </div>

    <ChatComposeBar
      ref="composeBar"
      class="sticky bottom-0 z-30"
      v-if="peerPubkey"
      v-model="inputText"
      :disabled="uploadLoading"
      :disable-mic="hasLiveCall"
      :is-recording="isRecording"
      :recording-seconds="recordingSeconds"
      :upload-status="uploadStatus"
      :replying-to="replyingTo"
      @cancel-reply="cancelReply"
      @send="sendMessage"
      @file-selected="handleFileSelected"
      @toggle-recording="handleToggleRecording"
      @cancel-recording="cancelVoiceRecording"
    />
  </div>
</template>
