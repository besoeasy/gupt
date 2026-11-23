<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import {
  CircleAlert,
  Check,
  CheckCheck,
  Copy,
  Download,
  ExternalLink,
  ImageOff,
  Mic,
  MapPin,
  Pause,
  Play,
  Reply,
  Pencil,
  Smile,
  Video,
  X,
} from "@/icons";
import {
  formatBytes,
  formatTime,
  formatDuration,
  finiteDurationSeconds,
  isImage,
  isVideo,
  isAudio,
  getFileLabel,
  isMediaMessage,
} from "@/lib/chatUtils";
import { formatSeenByTitle } from "@/lib/chatListUtils";
import { formatAccuracy, formatCoords, osmMapUrl } from "@/lib/location";
import { triggerHaptic, HAPTIC } from "@/lib/haptics";
import { messagePlainText, resolveMessageFormat } from "@/lib/messageFormat";
import ChatMessageBody from "@/components/chatv2/ChatMessageBody.vue";
import MessageExpiryCountdown from "@/components/chatv2/MessageExpiryCountdown.vue";
import MediaDecryptStatus from "@/components/chat/MediaDecryptStatus.vue";
import RelayEventLink from "@/components/RelayEventLink.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { RABTA_EVENT_ID_RE } from "@/lib/rabta";
import { avatarUrl } from "@/lib/avatar";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";
import {
  getSendReport,
  hydrateSendReport,
  relayAttemptsOf,
  sendReports,
} from "@/lib/engine/sendReport.js";

const props = defineProps({
  message: { type: Object, required: true },
  mine: { type: Boolean, default: false },
  blobUrl: { type: String, default: null },
  mediaProgress: { type: Object, default: null },
  hasFailed: { type: Boolean, default: false },
  /** The file is intact but this browser cannot preview it. */
  previewUnavailable: { type: Boolean, default: false },
  showSenderName: { type: Boolean, default: false },
  senderName: { type: String, default: "" },
  senderAvatar: { type: String, default: "" },
  selfHandle: { type: String, default: "" },
  isConsecutive: { type: Boolean, default: false },
});

const emit = defineEmits([
  "download",
  "retry",
  "reply",
  "react",
  "edit",
  "image-load",
  "visible",
  "media-visibility",
  "media-error",
  "expired",
]);

const REACT_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
const showReactionPicker = ref(false);
function react(emoji) {
  showReactionPicker.value = false;
  emit("react", { message: props.message, emoji });
}

const swipeX = ref(0);
let touchStartX = 0;
let touchStartY = 0;
let swipeTracking = false;
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 12;
let longPressTimer = null;
let longPressTriggered = false;

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function openMessageInfo() {
  showReactionPicker.value = false;
  showMessageInfo.value = true;
  idCopied.value = false;
}

function closeMessageInfo() {
  showMessageInfo.value = false;
}

function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  swipeTracking = false;
  swipeX.value = 0;
  longPressTriggered = false;
  clearLongPressTimer();
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    swipeX.value = 0;
    swipeTracking = false;
    openMessageInfo();
    triggerHaptic(HAPTIC.tap);
  }, LONG_PRESS_MS);
}

function handleTouchMove(e) {
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;
  if (Math.abs(dx) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(dy) > LONG_PRESS_MOVE_TOLERANCE) {
    clearLongPressTimer();
  }
  if (!swipeTracking) {
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 8) return;
    swipeTracking = true;
  }
  const clamped = Math.max(0, Math.min(80, dx));
  swipeX.value = clamped;
  if (clamped > 0) e.preventDefault();
}

function handleTouchEnd() {
  clearLongPressTimer();
  if (longPressTriggered) {
    swipeX.value = 0;
    swipeTracking = false;
    return;
  }
  if (swipeX.value >= 60) {
    triggerHaptic(HAPTIC.swipe);
    emit("reply", props.message);
  }
  swipeX.value = 0;
  swipeTracking = false;
}

const bubbleTransform = computed(() => (swipeX.value ? `translateX(${swipeX.value}px)` : ""));
const bubbleTransition = computed(() => (swipeX.value ? "none" : "transform 0.2s ease-out"));

const showMessageInfo = ref(false);
const idCopied = ref(false);
const textCopied = ref(false);
const hoverCopied = ref(false);

const copyableMessageText = computed(() => {
  if (props.message?.type !== "text") return "";
  return messagePlainText(props.message, { includeUrls: true, compact: false }).trim();
});

const formatInfo = computed(() => {
  if (props.message?.type !== "text") return null;
  return resolveMessageFormat(props.message);
});

const isGroupMessage = computed(() => Boolean(props.message?.groupId));
const clientMsgId = computed(() => String(props.message?.id || "").trim());
const envelopeId = computed(() => String(props.message?.wrapId || "").trim());

const eventId = computed(() => {
  if (isGroupMessage.value) return clientMsgId.value || "—";
  const wrapId = envelopeId.value;
  if (RABTA_EVENT_ID_RE.test(wrapId)) return wrapId;
  if (RABTA_EVENT_ID_RE.test(clientMsgId.value)) return clientMsgId.value;
  return wrapId || clientMsgId.value || "—";
});

/** Live send diagnostics for this bubble, fed by the replication worker. */
const sendKey = computed(() => String(eventId.value || "").toLowerCase());
const sendReport = computed(() => {
  if (!RABTA_EVENT_ID_RE.test(sendKey.value)) return null;
  // Touch the reactive map so worker updates re-render the report.
  void sendReports.get(sendKey.value)?.updatedAt;
  void sendReports.size;
  return getSendReport(sendKey.value);
});
const sendAttempts = computed(() => relayAttemptsOf(sendReport.value));
const sendError = computed(() => String(sendReport.value?.error || ""));
const nextRetryLabel = computed(() => {
  const at = Number(sendReport.value?.nextRetryAt) || 0;
  if (!at) return "";
  const delta = Math.max(0, at - Date.now());
  if (delta <= 0) return "retrying now";
  const seconds = Math.ceil(delta / 1000);
  if (seconds < 60) return `retrying in ${seconds}s`;
  return `retrying in ${Math.ceil(seconds / 60)}m`;
});

function sendAttemptLabel(entry) {
  if (!entry) return "";
  if (entry.state === "ok") {
    const ms = Math.max(0, Math.round(Number(entry.latencyMs) || 0));
    return `stored · ${ms}ms`;
  }
  if (entry.state === "skipped") return "skipped";
  if (entry.state === "trying") return "trying…";
  return "failed";
}

watch(
  showMessageInfo,
  (open) => {
    if (open && RABTA_EVENT_ID_RE.test(sendKey.value)) void hydrateSendReport(sendKey.value);
  },
  { flush: "post" },
);

const readByNames = computed(() => props.message?.readByNames || []);
const unreadByNames = computed(() => props.message?.unreadByNames || []);
const unknownByNames = computed(() => props.message?.unknownByNames || []);
const hasFullRead = computed(() => Boolean(props.message?.readByPeer || props.message?.readByAll));
const hasPartialRead = computed(
  () => !hasFullRead.value && (props.message?.readBy?.length || 0) > 0,
);
const seenTickTitle = computed(() => {
  const named = formatSeenByTitle(readByNames.value, hasFullRead.value);
  if (named) return named;
  if (hasFullRead.value) return "Delivered & Seen";
  return "Delivered";
});

const seenByCaption = computed(() =>
  formatSeenByTitle(readByNames.value, Boolean(props.message?.readByAll)),
);

const statusLabel = computed(() => {
  const status = props.message?.status;
  if (status === "pending") {
    if (sendReport.value?.state === "timedOut") return "Still trying — no relay answered yet";
    return "In send queue";
  }
  if (status === "sent") {
    const named = formatSeenByTitle(readByNames.value, hasFullRead.value);
    if (named) return named;
    if (hasFullRead.value) return "Delivered & Read";
    return "Sent to relays";
  }
  if (status === "failed") return "Failed to send";
  return props.mine ? "Delivered" : "Received";
});

const statusColorClass = computed(() => {
  const status = props.message?.status;
  if (status === "pending") return "chat-message-bubble__muted";
  if (status === "sent") {
    if (hasFullRead.value) return "chat-message-bubble__info";
    if (hasPartialRead.value) return "chat-message-bubble__muted";
    return "chat-message-bubble__success";
  }
  if (status === "failed") return "chat-message-bubble__danger";
  return "chat-message-bubble__variant-5";
});

const fullTimestamp = computed(() => {
  const ts = Number(props.message?.ts || props.message?.created_at || 0);
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
});

async function copyEventId() {
  const id = eventId.value;
  if (!id || id === "—") return;
  try {
    await copyToClipboard(id);
    idCopied.value = true;
    setTimeout(() => (idCopied.value = false), 1500);
  } catch {}
}

async function copyMessageText() {
  const text = copyableMessageText.value;
  if (!text) return;
  try {
    await copyToClipboard(text);
    textCopied.value = true;
    setTimeout(() => (textCopied.value = false), 1500);
  } catch {}
}

async function copyMessageTextFromHover() {
  const text = copyableMessageText.value;
  if (!text) return;
  try {
    await copyToClipboard(text);
    hoverCopied.value = true;
    setTimeout(() => (hoverCopied.value = false), 1500);
  } catch {}
}

const isMentioned = computed(() => {
  if (!props.selfHandle || props.mine || props.message?.type !== "text") return false;
  const text = props.message.text || "";
  return new RegExp(`@${props.selfHandle}(?:\\s|$|[^\\w])`, "i").test(text);
});

const mentionPulseActive = ref(false);
onMounted(() => {
  if (isMentioned.value) {
    mentionPulseActive.value = true;
    setTimeout(() => {
      mentionPulseActive.value = false;
    }, 3000);
  }
});

const isMediaBusy = computed(() => {
  if (props.blobUrl) return false;
  const phase = props.mediaProgress?.phase;
  const isRetrying = phase === MEDIA_PHASE.FAILED && Boolean(props.mediaProgress?.retry);
  return (
    phase === MEDIA_PHASE.FETCH ||
    phase === MEDIA_PHASE.DECRYPT ||
    phase === MEDIA_PHASE.QUEUED ||
    isRetrying
  );
});

const downloadActionLabel = computed(() => {
  if (props.blobUrl) return "Download";
  if (!isMediaBusy.value) return "Decrypt";
  const pct = props.mediaProgress?.percent;
  if (typeof pct === "number" && pct > 0) {
    return `${Math.round(pct)}%`;
  }
  const partsLoaded = props.mediaProgress?.partsLoaded;
  const totalParts = props.mediaProgress?.totalParts;
  if (partsLoaded && totalParts && totalParts > 1) {
    return `${partsLoaded}/${totalParts}`;
  }
  const phase = props.mediaProgress?.phase;
  if (phase === MEDIA_PHASE.QUEUED) return "Queued…";
  if (phase === MEDIA_PHASE.DECRYPT) return "Decrypting…";
  return "Downloading…";
});

const mediaPartsCount = computed(() => {
  const parts = props.message?.media?.parts;
  return Array.isArray(parts) ? parts.length : 0;
});

const hasMediaAttachment = computed(() => {
  const type = props.message?.type;
  if (type === "voice") return true;
  if (type === "text") return false;
  return Boolean(props.message?.media);
});

const showDecryptStatus = computed(() => {
  if (!hasMediaAttachment.value || props.blobUrl) return false;
  if (props.hasFailed || isMediaBusy.value) return true;
  const phase = props.mediaProgress?.phase;
  if (!phase || phase === MEDIA_PHASE.IDLE) return false;
  return phase !== MEDIA_PHASE.DONE && phase !== MEDIA_PHASE.CACHED;
});

// Viewport-aware media preloader: only preloads when the bubble comes within 500px of viewport
const rootEl = ref(null);
let mediaObserver = null;
// Second, long-lived observer: tells the media layer whether this attachment is
// on screen, so a failed one can be retried while it is in front of the reader.
let visibilityObserver = null;

function setupVisibilityObserver() {
  if (typeof IntersectionObserver === "undefined") return;
  if (!hasMediaAttachment.value || visibilityObserver) return;
  visibilityObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry) return;
      emit("media-visibility", { message: props.message, visible: entry.isIntersecting });
    },
    { threshold: 0 },
  );
  if (rootEl.value) visibilityObserver.observe(rootEl.value);
}

function setupMediaObserver() {
  if (typeof IntersectionObserver === "undefined") {
    if (hasMediaAttachment.value && !props.blobUrl) {
      emit("visible", props.message);
    }
    return;
  }

  if (!hasMediaAttachment.value || props.blobUrl) return;

  if (mediaObserver) {
    mediaObserver.disconnect();
    mediaObserver = null;
  }

  mediaObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry && entry.isIntersecting) {
        emit("visible", props.message);
        if (mediaObserver) {
          mediaObserver.disconnect();
          mediaObserver = null;
        }
      }
    },
    {
      rootMargin: "500px", // Preload attachments when within 500px of screen
    },
  );

  if (rootEl.value) {
    mediaObserver.observe(rootEl.value);
  }
}

onMounted(() => {
  setupMediaObserver();
  setupVisibilityObserver();
});

watch(
  () => props.blobUrl,
  (loaded) => {
    if (loaded && mediaObserver) {
      mediaObserver.disconnect();
      mediaObserver = null;
    }
  },
);

watch(
  () => hasMediaAttachment.value,
  (hasMedia) => {
    if (hasMedia && !props.blobUrl && !mediaObserver && rootEl.value) {
      setupMediaObserver();
    }
    if (hasMedia) setupVisibilityObserver();
  },
);

onUnmounted(() => {
  if (mediaObserver) {
    mediaObserver.disconnect();
    mediaObserver = null;
  }
  if (visibilityObserver) {
    visibilityObserver.disconnect();
    visibilityObserver = null;
    // Stop auto-retrying an attachment that is no longer rendered.
    if (hasMediaAttachment.value) {
      emit("media-visibility", { message: props.message, visible: false });
    }
  }
  clearLongPressTimer();
  if (activeScrubCleanup) activeScrubCleanup();
});

const lightboxOpen = ref(false);
const lightboxScale = ref(1);
const lightboxOffsetX = ref(0);
const lightboxOffsetY = ref(0);
const lbIsPinching = ref(false);
let lbPinchStartDist = 0;
let lbPinchStartScale = 1;
let lbPanStartX = 0;
let lbPanStartY = 0;
let lbPanStartOffsetX = 0;
let lbPanStartOffsetY = 0;
let lbLastTap = 0;

function openLightbox() {
  lightboxOpen.value = true;
  lightboxScale.value = 1;
  lightboxOffsetX.value = 0;
  lightboxOffsetY.value = 0;
}
function closeLightbox() {
  lightboxOpen.value = false;
}
function lbTouchStart(e) {
  if (e.touches.length === 2) {
    lbIsPinching.value = true;
    const dx = e.touches[1].clientX - e.touches[0].clientX;
    const dy = e.touches[1].clientY - e.touches[0].clientY;
    lbPinchStartDist = Math.hypot(dx, dy);
    lbPinchStartScale = lightboxScale.value;
  } else if (e.touches.length === 1) {
    lbIsPinching.value = false;
    lbPanStartX = e.touches[0].clientX;
    lbPanStartY = e.touches[0].clientY;
    lbPanStartOffsetX = lightboxOffsetX.value;
    lbPanStartOffsetY = lightboxOffsetY.value;
  }
}
function lbTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 2 && lbIsPinching.value) {
    const dx = e.touches[1].clientX - e.touches[0].clientX;
    const dy = e.touches[1].clientY - e.touches[0].clientY;
    const dist = Math.hypot(dx, dy);
    lightboxScale.value = Math.min(5, Math.max(0.5, lbPinchStartScale * (dist / lbPinchStartDist)));
  } else if (e.touches.length === 1 && !lbIsPinching.value && lightboxScale.value > 1) {
    lightboxOffsetX.value = lbPanStartOffsetX + (e.touches[0].clientX - lbPanStartX);
    lightboxOffsetY.value = lbPanStartOffsetY + (e.touches[0].clientY - lbPanStartY);
  }
}
function lbTouchEnd(e) {
  if (e.touches.length < 2) lbIsPinching.value = false;
}
function lbHandleClick() {
  const n = Date.now();
  if (n - lbLastTap < 300) {
    lightboxScale.value = lightboxScale.value > 1 ? 1 : 2.5;
    lightboxOffsetX.value = 0;
    lightboxOffsetY.value = 0;
  }
  lbLastTap = n;
}

const avatarError = ref(false);
watch(
  () => props.senderAvatar,
  () => {
    avatarError.value = false;
  },
);
function onAvatarError() {
  avatarError.value = true;
}
const avatarDisplaySrc = computed(() => avatarUrl(props.message?.sender || ""));

const audioEl = ref(null);
const waveformRef = ref(null);
const playing = ref(false);
const progress = ref(0);
const currentSecs = ref(0);
const playbackSpeed = ref(1);
const isScrubbing = ref(false);
const hoverProgress = ref(null);

function durationFromMessage() {
  const ms = Number(props.message?.durationMs || 0);
  return ms > 0 ? Math.round(ms / 1000) : 0;
}

const totalSecs = ref(durationFromMessage());

function syncPlaybackRate() {
  if (audioEl.value) {
    audioEl.value.playbackRate = playbackSpeed.value;
  }
}

function cyclePlaybackSpeed() {
  if (playbackSpeed.value === 1) playbackSpeed.value = 1.5;
  else if (playbackSpeed.value === 1.5) playbackSpeed.value = 2;
  else playbackSpeed.value = 1;

  syncPlaybackRate();
}

watch(
  () => props.blobUrl,
  (url) => {
    if (!url) return;
    playing.value = false;
    progress.value = 0;
    currentSecs.value = 0;
    totalSecs.value = durationFromMessage();
  },
);

watch(
  () => props.message?.durationMs,
  () => {
    const fromMessage = durationFromMessage();
    if (fromMessage > 0) totalSecs.value = fromMessage;
  },
);

function playbackDuration(el) {
  const fromElement = finiteDurationSeconds(el?.duration);
  if (fromElement !== null && fromElement > 0) return fromElement;
  if (totalSecs.value > 0) return totalSecs.value;
  return null;
}

function syncTotalDuration(el) {
  const fromElement = finiteDurationSeconds(el?.duration);
  if (fromElement !== null && fromElement > 0) {
    totalSecs.value = fromElement;
    return;
  }
  const fromMessage = durationFromMessage();
  if (fromMessage > 0) totalSecs.value = fromMessage;
}

function togglePlay() {
  const el = audioEl.value;
  if (!el) return;
  syncPlaybackRate();
  if (el.paused) {
    el.play();
    playing.value = true;
  } else {
    el.pause();
    playing.value = false;
  }
}

function onTimeUpdate() {
  const el = audioEl.value;
  if (!el || isScrubbing.value) return;
  currentSecs.value = finiteDurationSeconds(el.currentTime) ?? 0;
  const duration = playbackDuration(el);
  if (duration) progress.value = (el.currentTime / duration) * 100;
  syncTotalDuration(el);
}

function onEnded() {
  const el = audioEl.value;
  if (el) {
    const played = finiteDurationSeconds(el.currentTime);
    if (played !== null && played > 0 && !playbackDuration(el)) {
      totalSecs.value = played;
    }
  }
  playing.value = false;
  progress.value = 0;
  currentSecs.value = 0;
}

function seekAtEvent(e) {
  const el = audioEl.value;
  const barEl = waveformRef.value;
  const duration = playbackDuration(el);
  if (!el || !barEl || !duration) return;
  const rect = barEl.getBoundingClientRect();
  const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? rect.left;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  el.currentTime = ratio * duration;
  progress.value = ratio * 100;
  currentSecs.value = Math.round(ratio * duration);
}

let activeScrubCleanup = null;

function onWaveformPointerDown(e) {
  if (activeScrubCleanup) activeScrubCleanup();
  isScrubbing.value = true;
  seekAtEvent(e);
  const onPointerMove = (ev) => {
    if (!isScrubbing.value) return;
    seekAtEvent(ev);
  };
  const onPointerUp = () => {
    isScrubbing.value = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("touchmove", onPointerMove);
    window.removeEventListener("touchend", onPointerUp);
    activeScrubCleanup = null;
  };
  activeScrubCleanup = () => {
    isScrubbing.value = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("touchmove", onPointerMove);
    window.removeEventListener("touchend", onPointerUp);
    activeScrubCleanup = null;
  };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("touchend", onPointerUp);
}

function onLoadedMetadata() {
  syncTotalDuration(audioEl.value);
  syncPlaybackRate();
}

function onDurationChange() {
  syncTotalDuration(audioEl.value);
  syncPlaybackRate();
}

const WAVE_BARS = 36;
const waveformBars = computed(() => {
  const seed = String(props.message?.id || props.message?.ts || 0);
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  return Array.from({ length: WAVE_BARS }, () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return 18 + (h % 75);
  });
});

const mediaMime = computed(() => props.message?.media?.mime || "application/octet-stream");

const showExternalMediaPreview = computed(
  () =>
    isMediaMessage(props.message) &&
    Boolean(props.blobUrl) &&
    !props.previewUnavailable &&
    (isImage(mediaMime.value) || isVideo(mediaMime.value)),
);

// An intact picture the browser cannot decode: keep the file reachable through
// Download instead of leaving a broken frame (or no frame at all) on screen.
const showMediaDownloadTile = computed(
  () =>
    !showExternalMediaPreview.value &&
    props.previewUnavailable &&
    Boolean(props.blobUrl) &&
    (isImage(mediaMime.value) || isVideo(mediaMime.value)),
);

const isMediaMsg = computed(() => isMediaMessage(props.message));

const useInlineChrome = computed(() => isMediaMsg.value || props.message?.type === "voice");

const fileExtension = computed(() => {
  const name = String(getFileLabel(props.message) || "");
  const fromName = name.match(/\.([a-z0-9]+)$/i);
  if (fromName) return fromName[1].toLowerCase();
  const subtype = String(mediaMime.value).split("/")[1] || "";
  return subtype && subtype !== "octet-stream" ? subtype : "";
});

const fileBaseName = computed(() => {
  const name = String(getFileLabel(props.message) || "Attachment");
  if (!fileExtension.value) return name;
  const stripped = name.replace(new RegExp(`\\.${fileExtension.value}$`, "i"), "");
  return stripped || name;
});

const locationLabel = computed(() => String(props.message?.label || "").trim());
const isLocationRow = computed(() => props.message?.type === "location");
const locationAccuracy = computed(() => formatAccuracy(props.message?.accuracy));
const locationCoords = computed(() => {
  const coords = formatCoords(props.message?.lat, props.message?.lon);
  if (!coords) return "Position unavailable";
  // Accuracy is dropped in the approximate case on the way out, so this only
  // ever renders for an exact fix.
  return locationAccuracy.value ? `${coords} · ${locationAccuracy.value}` : coords;
});
const locationMapUrl = computed(() => osmMapUrl(props.message?.lat, props.message?.lon));

const linkifyText = computed(() => {
  const text = props.message?.text || "";
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const URL_RE = /https?:\/\/[^\s<>"']+/gi;
  let result = "";
  let lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    result += esc(text.slice(lastIndex, m.index));
    const url = esc(m[0]);
    result += `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-message-bubble__link">${url}</a>`;
    lastIndex = m.index + m[0].length;
  }
  result += esc(text.slice(lastIndex));
  return result;
});
</script>

<template>
  <div
    ref="rootEl"
    class="chat-message-bubble__block"
    :class="[mine ? 'chat-message-bubble__block--variant-1' : 'chat-message-bubble__block--variant-2', isConsecutive ? 'chat-message-bubble__block--variant-3' : 'chat-message-bubble__block--variant-4']"
    :style="{ transform: bubbleTransform, transition: bubbleTransition }"
    @touchstart.passive="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend.passive="handleTouchEnd"
  >
    <!-- Peer avatar: only on first message of a group -->
    <img
      v-if="!mine && senderAvatar && !isConsecutive"
      :src="avatarDisplaySrc"
      class="chat-message-bubble__image"
      alt=""
      :title="senderName"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="onAvatarError"
    />
    <div v-else-if="!mine && isConsecutive" class="chat-message-bubble__block-2" />

    <div
      class="chat-message-bubble__block-3"
      :class="mine ? 'chat-message-bubble__block--variant-1-2' : 'chat-message-bubble__block--variant-2-2'"
    >
      <!-- Hover Actions -->
      <div
        class="chat-message-bubble__block-4"
        :class="mine ? 'chat-message-bubble__block--variant-1-3' : 'chat-message-bubble__block--variant-2-3'"
      >
        <!-- Reaction picker trigger -->
        <div class="chat-message-bubble__block-5">
          <button
            type="button"
            @click="showReactionPicker = !showReactionPicker"
            class="chat-message-bubble__button-react"
            title="React"
          >
            <Smile class="chat-message-bubble__smile" :stroke-width="1.8" />
          </button>
          <Transition
            enter-active-class="chat-message-bubble__enter-active-class"
            enter-from-class="chat-message-bubble__enter-from-class"
            enter-to-class="chat-message-bubble__enter-to-class"
            leave-active-class="chat-message-bubble__leave-active-class"
            leave-from-class="chat-message-bubble__leave-from-class"
            leave-to-class="chat-message-bubble__leave-to-class"
          >
            <div
              v-if="showReactionPicker"
              class="chat-message-bubble__block-6"
              :class="mine ? 'chat-message-bubble__block--variant-1-4' : 'chat-message-bubble__block--variant-2-4'"
            >
              <button
                v-for="e in REACT_EMOJIS"
                :key="e"
                type="button"
                @click="react(e)"
                class="chat-message-bubble__button"
                :title="e"
              >
                {{ e }}
              </button>
            </div>
          </Transition>
        </div>
        <!-- Edit (own text messages) -->
        <button
          v-if="mine && message.type === 'text'"
          type="button"
          @click="emit('edit', message)"
          class="chat-message-bubble__button-edit-message"
          title="Edit message"
        >
          <Pencil class="chat-message-bubble__pencil" :stroke-width="1.8" />
        </button>
        <button
          type="button"
          @click="emit('reply', message)"
          class="chat-message-bubble__button-reply"
          title="Reply"
        >
          <Reply class="chat-message-bubble__reply" :stroke-width="1.8" />
        </button>
        <button
          v-if="copyableMessageText"
          type="button"
          @click="copyMessageTextFromHover"
          class="chat-message-bubble__button-2"
          :title="hoverCopied ? 'Copied!' : 'Copy text'"
        >
          <Check v-if="hoverCopied" class="chat-message-bubble__check" :stroke-width="2" />
          <Copy v-else class="chat-message-bubble__copy" :stroke-width="1.8" />
        </button>
      </div>

      <!-- Intact file the browser cannot draw: keep it saveable -->
      <div
        v-if="showMediaDownloadTile"
        class="chat-message-bubble__block-7"
      >
        <span
          class="chat-message-bubble__text"
          aria-hidden="true"
        >
          <ImageOff class="chat-message-bubble__image-off" :stroke-width="1.8" />
        </span>
        <div class="chat-message-bubble__block-8">
          <p class="chat-message-bubble__text-2">
            {{ getFileLabel(message) }}
          </p>
          <p class="chat-message-bubble__text-preview-unavailable">
            Preview unavailable<span v-if="message.media?.size">
              · {{ formatBytes(message.media.size) }}</span
            >
          </p>
        </div>
        <button
          type="button"
          class="chat-message-bubble__button-download-file"
          title="Download file"
          aria-label="Download file"
          @click="emit('download', message)"
        >
          <Download class="chat-message-bubble__download" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>

      <!-- Media preview outside the colored bubble -->
      <div
        v-if="showExternalMediaPreview"
        class="chat-message-bubble__block-9"
      >
        <img
          v-if="isImage(mediaMime)"
          :src="blobUrl"
          :alt="getFileLabel(message)"
          class="chat-message-bubble__image-2"
          @click="openLightbox"
          @load="emit('image-load')"
          @error="emit('media-error', message)"
        />
        <video
          v-else
          :src="blobUrl"
          controls
          class="chat-message-bubble__video"
          @error="emit('media-error', message)"
        />

        <!-- A picture carries its deadline on the picture, where it is seen. -->
        <MessageExpiryCountdown
          framed
          class="chat-message-bubble__message-expiry-countdown"
          :expires-at="Number(message.expiresAt || 0)"
          :started-at="Number(message.ts || 0)"
          @expired="emit('expired', message)"
        />
      </div>

      <!-- Bubble (Geist sharp card style) -->
      <div
        class="chat-message-bubble__block-10"
        :class="
          useInlineChrome
            ? 'chat-message-bubble__block--variant-1-5'
            : mine
              ? 'chat-message-bubble__block--variant-2-5'
              : isMentioned
                ? `chat-message-bubble__block--warning${mentionPulseActive ? ' chat-message-bubble__block--pulse' : ''}`
                : 'chat-message-bubble__block--variant-4-2'
        "
        @contextmenu.prevent="openMessageInfo"
      >
        <!-- Replied-to Snippet -->
        <div
          v-if="message.replyTo"
          class="chat-message-bubble__block-11"
          :class="useInlineChrome ? 'chat-message-bubble__block--muted' : ''"
        >
          <p class="chat-message-bubble__text-replied-to">
            Replied to message
          </p>
          <p class="chat-message-bubble__text-3">
            {{ message.replyExcerpt || "Audio/Media" }}
          </p>
        </div>

        <!-- Sender name (groups) -->
        <p
          v-if="showSenderName && !mine"
          class="chat-message-bubble__text-4"
        >
          {{ senderName }}
        </p>

        <!-- ── Text ── -->
        <template v-if="message.type === 'text'">
          <ChatMessageBody v-if="formatInfo" :nodes="formatInfo.nodes" />
          <p
            v-else
            class="chat-message-bubble__text-5"
            v-html="linkifyText"
          ></p>
          <span v-if="message.editedAt" class="chat-message-bubble__text-6">
            · edited</span
          >
        </template>

        <!-- ── Voice note ── -->
        <template v-else-if="message.type === 'voice'">
          <div
            v-if="blobUrl"
            class="chat-message-bubble__block-12"
          >
            <audio
              ref="audioEl"
              :src="blobUrl"
              preload="metadata"
              class="chat-message-bubble__audio"
              @timeupdate="onTimeUpdate"
              @ended="onEnded"
              @loadedmetadata="onLoadedMetadata"
              @durationchange="onDurationChange"
            />
            <div class="chat-message-bubble__block-13">
              <button
                type="button"
                @click="togglePlay"
                class="chat-message-bubble__button-3"
                :aria-label="playing ? 'Pause' : 'Play'"
              >
                <Play v-if="!playing" class="chat-message-bubble__play" :stroke-width="1.8" />
                <Pause v-else class="chat-message-bubble__pause" :stroke-width="1.8" />
              </button>
              <div class="chat-message-bubble__block-14" @click="seek">
                <div
                  v-for="(bar, idx) in waveformBars"
                  :key="idx"
                  class="chat-message-bubble__block-15"
                  :class="
                    (idx / waveformBars.length) * 100 <= progress ? 'chat-message-bubble__block--variant-1-6' : 'chat-message-bubble__block--selected'
                  "
                  :style="{ height: bar + '%' }"
                />
              </div>
              <button
                type="button"
                @click="emit('download', message)"
                :disabled="isMediaBusy"
                class="chat-message-bubble__button-save-voice"
                aria-label="Save voice note to device"
              >
                <Download class="chat-message-bubble__download-2" :stroke-width="1.8" />
              </button>
            </div>
            <div class="chat-message-bubble__block-16">
              <span>{{ formatDuration(currentSecs) }}</span>
              <span>{{ formatDuration(totalSecs) }}</span>
            </div>
          </div>

          <div v-else class="chat-message-bubble__block-17">
            <button
              type="button"
              @click="emit('download', message)"
              class="chat-message-bubble__button-4"
              :disabled="isMediaBusy"
            >
              <Mic class="chat-message-bubble__mic" :stroke-width="1.8" />
              <span>{{ isMediaBusy ? "Decrypting…" : "Play voice note" }}</span>
            </button>
          </div>
        </template>

        <!-- ── Media attachment ── -->
        <template v-else-if="isMediaMessage(message)">
          <div class="chat-message-bubble__block-18">
            <!-- In-bubble preview only when not shown outside (decrypting / non-visual) -->
            <div
              v-if="!showExternalMediaPreview && !previewUnavailable && isImage(mediaMime) && blobUrl"
              class="chat-message-bubble__block-19"
            >
              <img
                :src="blobUrl"
                :alt="getFileLabel(message)"
                class="chat-message-bubble__image-3"
                @click="openLightbox"
                @load="emit('image-load')"
                @error="emit('media-error', message)"
              />
            </div>
            <div
              v-else-if="
                !showExternalMediaPreview && !previewUnavailable && isVideo(mediaMime) && blobUrl
              "
              class="chat-message-bubble__block-20"
            >
              <video
                :src="blobUrl"
                controls
                class="chat-message-bubble__video-2"
                @error="emit('media-error', message)"
              />
            </div>
            <div v-else-if="isAudio(mediaMime) && blobUrl">
              <audio
                ref="audioEl"
                :src="blobUrl"
                preload="metadata"
                class="chat-message-bubble__audio-2"
                @timeupdate="onTimeUpdate"
                @ended="onEnded"
                @loadedmetadata="onLoadedMetadata"
                @durationchange="onDurationChange"
              />
              <div class="chat-message-bubble__block-21">
                <div class="chat-message-bubble__block-22">
                  <button
                    type="button"
                    @click="togglePlay"
                    class="chat-message-bubble__button-5"
                    :aria-label="playing ? 'Pause' : 'Play'"
                  >
                    <Play
                      v-if="!playing"
                      class="chat-message-bubble__play-2"
                      :stroke-width="1.8"
                    />
                    <Pause v-else class="chat-message-bubble__pause-2" :stroke-width="1.8" />
                  </button>

                  <div
                    ref="waveformRef"
                    class="chat-message-bubble__block-23"
                    @pointerdown="onWaveformPointerDown"
                    @mousemove="
                      (e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        hoverProgress = ((e.clientX - rect.left) / rect.width) * 100;
                      }
                    "
                    @mouseleave="hoverProgress = null"
                  >
                    <div
                      v-for="(bar, idx) in waveformBars"
                      :key="idx"
                      class="chat-message-bubble__block-24"
                      :class="[
                        (idx / waveformBars.length) * 100 <= progress
                          ? 'chat-message-bubble__block--variant-1-7'
                          : hoverProgress !== null &&
                              (idx / waveformBars.length) * 100 <= hoverProgress
                            ? 'chat-message-bubble__block--muted-2'
                            : 'chat-message-bubble__block--selected-2',
                      ]"
                      :style="{ height: bar + '%' }"
                    />
                  </div>

                  <button
                    type="button"
                    @click.stop="cyclePlaybackSpeed"
                    class="chat-message-bubble__button-x"
                    :title="`Playback speed: ${playbackSpeed}x`"
                  >
                    {{ playbackSpeed }}x
                  </button>
                </div>
                <div
                  class="chat-message-bubble__block-25"
                >
                  <span>{{ formatDuration(currentSecs) }}</span>
                  <span>{{ formatDuration(totalSecs) }}</span>
                </div>
              </div>
            </div>

            <!-- File meta + download — one inline row: name · format · action -->
            <div
              class="chat-message-bubble__block-26"
            >
              <span class="chat-message-bubble__text-7">
                {{ fileBaseName }}
              </span>
              <template v-if="fileExtension">
                <span class="chat-message-bubble__text-8" aria-hidden="true">·</span>
                <span class="chat-message-bubble__text-9">{{ fileExtension }}</span>
              </template>
              <template v-if="mediaPartsCount > 1">
                <span class="chat-message-bubble__text-10" aria-hidden="true">·</span>
                <span class="chat-message-bubble__text-11">
                  {{
                    isMediaBusy && mediaProgress?.partsLoaded
                      ? `${mediaProgress.partsLoaded}/${mediaPartsCount} parts`
                      : `${mediaPartsCount} parts`
                  }}
                </span>
              </template>
              <span class="chat-message-bubble__text-12" aria-hidden="true">·</span>
              <button
                v-if="!showMediaDownloadTile"
                type="button"
                @click="emit('download', message)"
                class="chat-message-bubble__button-6"
                :disabled="isMediaBusy"
              >
                <Download class="chat-message-bubble__download-3" :stroke-width="1.8" />
                {{ downloadActionLabel }}
              </button>
              <button
                v-if="hasFailed"
                type="button"
                @click="emit('retry', message)"
                class="chat-message-bubble__button-retry"
              >
                Retry
              </button>
            </div>
          </div>
        </template>

        <!-- Keyed on the row type rather than on valid coordinates: a location
             message carrying unusable coords still needs to say so. Gating on
             `isLocationMessage` would drop it into the empty fallback and
             render an empty bubble. -->
        <template v-else-if="isLocationRow" class="chat-message-bubble__group">
          <div class="chat-message-bubble__block-27">
            <div class="chat-message-bubble__block-28">
              <MapPin class="chat-message-bubble__map-pin" :stroke-width="1.8" />
              <div class="chat-message-bubble__block-29">
                <p v-if="locationLabel" class="chat-message-bubble__text-13">
                  {{ locationLabel }}
                </p>
                <p class="chat-message-bubble__text-14">{{ locationCoords }}</p>
                <p
                  v-if="message.approximate"
                  class="chat-message-bubble__text-15"
                >
                  Approximate · ~1km
                </p>
              </div>
            </div>
            <!-- Deliberately inert until tapped. An embedded map would tell a
                 tile server the reader's IP and that they care about this
                 coordinate; the link only fires on an explicit click. -->
            <a
              v-if="locationMapUrl"
              :href="locationMapUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="chat-message-bubble__link-opens-openstreetmap"
              title="Opens OpenStreetMap in a new tab"
            >
              <ExternalLink class="chat-message-bubble__external-link" :stroke-width="1.8" />
              Open map
            </a>
          </div>
        </template>

        <template v-else />

        <!-- Reactions list -->
        <div
          v-if="message.reactions?.length"
          class="chat-message-bubble__block-30"
          :class="mine ? 'chat-message-bubble__block--variant-1-8' : 'chat-message-bubble__block--variant-2-6'"
        >
          <span
            v-for="r in message.reactions"
            :key="r.emoji"
            class="chat-message-bubble__text-16"
            :title="`${r.count} reaction${r.count > 1 ? 's' : ''}`"
          >
            {{ r.emoji
            }}<span v-if="r.count > 1" class="chat-message-bubble__text-17">{{ r.count }}</span>
          </span>
        </div>
      </div>

      <MediaDecryptStatus
        v-if="showDecryptStatus"
        :progress="mediaProgress"
        :event-id="eventId"
        :file-name="fileBaseName || message.text || ''"
        :file-size="fileAttachment?.size || message.media?.size || 0"
        :retryable="true"
        compact
        class="chat-message-bubble__media-decrypt-status"
        @retry="emit('retry', message)"
        @download="emit('download', message)"
      />

      <!-- Timestamp + Status -->
      <div
        class="message-meta chat-message-bubble__block-31"
        :class="[
          mine ? 'chat-message-bubble__block--variant-1-9' : 'chat-message-bubble__block--variant-2-7',
          mine
            ? 'chat-message-bubble__block--variant-3-2'
            : 'chat-message-bubble__block--hidden',
        ]"
      >
        <p class="chat-message-bubble__text-18">
          {{ formatTime(message.ts) }}
        </p>

        <!-- Glowing dot in send queue -->
        <span
          v-if="mine && message.status === 'pending'"
          class="chat-message-bubble__text-in-send"
          title="In send queue"
        >
          <span
            class="chat-message-bubble__text-19"
          />
          <span class="chat-message-bubble__text-20" />
        </span>

        <!-- Double tick when everyone has seen, or delivered -->
        <span
          v-else-if="mine && (hasFullRead || message.status === 'delivered')"
          class="chat-message-bubble__text-21"
          :title="seenTickTitle"
        >
          <CheckCheck class="chat-message-bubble__check-check" :stroke-width="2.2" />
        </span>

        <!-- Grey double tick when some group members have seen -->
        <span v-else-if="mine && hasPartialRead" class="chat-message-bubble__text-22" :title="seenTickTitle">
          <CheckCheck class="chat-message-bubble__check-check-2" :stroke-width="2.2" />
        </span>

        <!-- Single tick when sent to relays -->
        <span
          v-else-if="mine && message.status === 'sent'"
          class="chat-message-bubble__text-sent-to"
          title="Sent to relays"
        >
          <Check class="chat-message-bubble__check-2" :stroke-width="2.2" />
        </span>

        <!-- Alert icon when failed -->
        <span
          v-else-if="mine && message.status === 'failed'"
          class="chat-message-bubble__text-failed-to"
          title="Failed to send"
        >
          <CircleAlert class="chat-message-bubble__circle-alert" :stroke-width="2" />
        </span>

        <!-- Time left before this message disappears (short chat timers).
             Pictures show the same badge on the picture itself, so skip it
             here to avoid two clocks for one message. -->
        <MessageExpiryCountdown
          v-if="!showExternalMediaPreview"
          :expires-at="Number(message.expiresAt || 0)"
          :started-at="Number(message.ts || 0)"
          @expired="emit('expired', message)"
        />
      </div>
      <p
        v-if="!mine && isGroupMessage && seenByCaption"
        class="chat-message-bubble__text-23"
        :title="seenByCaption"
      >
        {{ seenByCaption }}
      </p>
    </div>
  </div>

  <!-- Message Info Teleport Modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="app-modal-enter-active"
      enter-from-class="app-modal-enter-from"
      leave-active-class="app-modal-leave-active"
      leave-to-class="app-modal-leave-to"
    >
      <div
        v-if="showMessageInfo"
        class="chat-message-bubble__block-32"
        @click.self="closeMessageInfo"
      >
        <div
          class="app-modal-panel chat-message-bubble__dialog"
          role="dialog"
          @click.stop
        >
          <div class="chat-message-bubble__block-33">
            <h3 class="chat-message-bubble__heading-message-info">Message Info</h3>
            <button
              type="button"
              @click="closeMessageInfo"
              class="chat-message-bubble__button-7"
            >
              <X class="chat-message-bubble__x" :stroke-width="1.8" />
            </button>
          </div>

          <div class="chat-message-bubble__block-34">
            <button
              v-for="e in REACT_EMOJIS"
              :key="e"
              type="button"
              @click="
                react(e);
                closeMessageInfo();
              "
              class="chat-message-bubble__button-8"
            >
              {{ e }}
            </button>
          </div>

          <div class="chat-message-bubble__block-35">
            <p v-if="isGroupMessage" class="chat-message-bubble__text-24">
              Group messages are sealed individually for each member inside a single relay event, so
              only group members can decrypt their own copy.
            </p>

            <div>
              <p class="chat-message-bubble__text-25">
                {{ isGroupMessage ? "Message ID" : "Event ID" }}
              </p>
              <button
                type="button"
                @click="copyEventId"
                class="chat-message-bubble__button-9"
              >
                <span class="chat-message-bubble__text-26">{{ eventId }}</span>
                <Copy
                  v-if="!idCopied"
                  class="chat-message-bubble__copy-2"
                  :stroke-width="1.8"
                />
                <Check
                  v-else
                  class="chat-message-bubble__check-3"
                  :stroke-width="2"
                />
              </button>
            </div>

            <div>
              <p class="chat-message-bubble__text-status">
                Status
              </p>
              <p :class="statusColorClass" class="chat-message-bubble__text-27">{{ statusLabel }}</p>
              <p v-if="sendError && props.mine" class="chat-message-bubble__text-send-detail">
                {{ sendError }}<span v-if="nextRetryLabel"> · {{ nextRetryLabel }}</span>
              </p>
            </div>

            <div v-if="props.mine && sendAttempts.length">
              <p class="chat-message-bubble__text-status">
                Relays
              </p>
              <ul class="chat-message-bubble__send-attempts">
                <li
                  v-for="entry in sendAttempts"
                  :key="entry.relay"
                  class="chat-message-bubble__send-attempt"
                >
                  <span
                    class="chat-message-bubble__send-dot"
                    :class="{
                      'chat-message-bubble__send-dot--ok': entry.state === 'ok',
                      'chat-message-bubble__send-dot--trying': entry.state === 'trying',
                      'chat-message-bubble__send-dot--skipped': entry.state === 'skipped',
                    }"
                  />
                  <span class="chat-message-bubble__send-host">{{ entry.host }}</span>
                  <span class="chat-message-bubble__send-state">{{ sendAttemptLabel(entry) }}</span>
                </li>
              </ul>
              <p
                v-for="entry in sendAttempts.filter((e) => e.state !== 'ok' && e.error)"
                :key="`err-${entry.relay}`"
                class="chat-message-bubble__text-send-detail"
              >
                {{ entry.host }}: {{ entry.error }}
              </p>
            </div>

            <div
              v-if="
                isGroupMessage &&
                (readByNames.length || unreadByNames.length || unknownByNames.length)
              "
            >
              <p class="chat-message-bubble__text-seen-by">
                Seen by
              </p>
              <p class="chat-message-bubble__text-28">
                {{ readByNames.length ? readByNames.join(", ") : "Nobody yet" }}
              </p>
              <p v-if="unreadByNames.length" class="chat-message-bubble__text-waiting-on">
                Waiting on {{ unreadByNames.join(", ") }}
              </p>
              <p v-if="unknownByNames.length" class="chat-message-bubble__text-29">
                No record for {{ unknownByNames.join(", ") }} — read receipts expire after 30 days
              </p>
            </div>

            <div>
              <p class="chat-message-bubble__text-timestamp">
                Timestamp
              </p>
              <p class="chat-message-bubble__text-30">{{ fullTimestamp }}</p>
            </div>
          </div>

          <div class="chat-message-bubble__block-36">
            <button
              v-if="copyableMessageText"
              type="button"
              @click="copyMessageText"
              class="chat-message-bubble__button-10"
            >
              <Copy v-if="!textCopied" class="chat-message-bubble__copy-3" :stroke-width="1.8" />
              <Check v-else class="chat-message-bubble__check-4" :stroke-width="2" />
              {{ textCopied ? "Copied!" : "Copy message text" }}
            </button>

            <RelayEventLink
              v-if="!isGroupMessage"
              :event-id="eventId"
              variant="button"
              placement="top"
              label="Inspect on Rabta relay"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Lightbox Teleport Modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="chat-message-bubble__enter-active-class-2"
      enter-from-class="chat-message-bubble__enter-from-class-2"
      enter-to-class="chat-message-bubble__enter-to-class-2"
      leave-active-class="chat-message-bubble__leave-active-class-2"
      leave-from-class="chat-message-bubble__leave-from-class-2"
      leave-to-class="chat-message-bubble__leave-to-class-2"
    >
      <div
        v-if="lightboxOpen"
        class="chat-message-bubble__block-37"
        @click.self="closeLightbox"
      >
        <div class="chat-message-bubble__block-38">
          <button
            type="button"
            @click="emit('download', message)"
            class="chat-message-bubble__button-save-image"
            aria-label="Save image to device"
          >
            <Download class="chat-message-bubble__download-4" :stroke-width="2" />
          </button>
          <button
            type="button"
            @click="closeLightbox"
            class="chat-message-bubble__button-close"
            aria-label="Close"
          >
            <X class="chat-message-bubble__x-2" :stroke-width="2" />
          </button>
        </div>

        <div
          class="chat-message-bubble__block-39"
          @touchstart="lbTouchStart"
          @touchmove.prevent="lbTouchMove"
          @touchend="lbTouchEnd"
          @click="lbHandleClick"
        >
          <img
            :src="blobUrl"
            :alt="getFileLabel(message)"
            class="chat-message-bubble__image-4"
            :style="{
              transform: `translate(${lightboxOffsetX}px, ${lightboxOffsetY}px) scale(${lightboxScale})`,
              transition: lbIsPinching ? 'none' : 'transform 0.15s ease-out',
            }"
            draggable="false"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.chat-message-bubble__block-4:is(:where(.chat-message-bubble__block):hover *) {
  opacity: 1;
}
}

@media (hover:hover) {
.chat-message-bubble__block--hidden:is(:where(.chat-message-bubble__block):hover *) {
  opacity: 1;
}
}

@media (hover:hover) {
.chat-message-bubble__text:is(:where(.chat-message-bubble__block-7):hover *) {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-message-bubble__block--selected-2:is(:where(.chat-message-bubble__block-23):hover *) {
  background-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-message-bubble__button:hover {
  --scale-x: 125%;
  --scale-y: 125%;
  --scale-z: 125%;
  scale: 125% 125%;
}
}

@media (hover:hover) {
.chat-message-bubble__button-8:hover {
  --scale-x: 125%;
  --scale-y: 125%;
  --scale-z: 125%;
  scale: 125% 125%;
}
}

@media (hover:hover) {
.chat-message-bubble__image-3:hover {
  scale: 1.01;
}
}

@media (hover:hover) {
.chat-message-bubble__block-7:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-message-bubble__button-download-file:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-message-bubble__button-3:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-message-bubble__button-save-voice:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-message-bubble__button-5:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-message-bubble__button-x:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-message-bubble__button-7:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-message-bubble__button-9:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-message-bubble__button-10:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-message-bubble__button-save-image:hover {
  background-color: #fff3;
}
}

@media (hover:hover) {
.chat-message-bubble__button-close:hover {
  background-color: #fff3;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__button-save-image:hover {
  background-color: color-mix(in oklab,var(--color-white) 20%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__button-close:hover {
  background-color: color-mix(in oklab,var(--color-white) 20%,transparent);
}
}
}

@media (hover:hover) {
.chat-message-bubble__button-react:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-message-bubble__button-edit-message:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-message-bubble__button-reply:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-message-bubble__button-2:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-message-bubble__button-download-file:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-message-bubble__button-3:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-message-bubble__button-save-voice:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-message-bubble__button-5:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-message-bubble__button-10:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-message-bubble__button-9:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.chat-message-bubble__block-7:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block-7:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 70%,transparent);
}
}
}

@media (hover:hover) {
.chat-message-bubble__button-download-file:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-message-bubble__button-3:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-message-bubble__button-save-voice:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-message-bubble__button-4:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-message-bubble__button-5:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-message-bubble__button-6:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-message-bubble__link-opens-openstreetmap:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-message-bubble__button-7:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-message-bubble__button-10:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-message-bubble__button-react:hover {
  color: var(--color-yellow-400);
}
}

@media (hover:hover) {
.chat-message-bubble__button-edit-message:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.chat-message-bubble__button-reply:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.chat-message-bubble__button-2:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.chat-message-bubble__button-x:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-message-bubble__button-retry:hover {
  opacity: .8;
}
}

@media (hover:hover) {
.chat-message-bubble__image:hover {
  opacity: 1;
}
}

@media (min-width:40rem) {
.chat-message-bubble__block-3 {
  max-width: 72%;
}
}

@media (min-width:40rem) {
.chat-message-bubble__image-4 {
  max-width: 100%;
}
}

@media (min-width:40rem) {
.chat-message-bubble__block-32 {
  align-items: center;
}
}

@media (min-width:64rem) {
.chat-message-bubble__block-3 {
  max-width: 64%;
}
}

@media (min-width:80rem) {
.chat-message-bubble__block-3 {
  max-width: 58%;
}
}

@layer gupt-components {
:deep(.chat-message-bubble__link) {
  text-decoration-line: underline;
  text-underline-offset: 2px;
  opacity: 0.9;
  overflow-wrap: break-word;
  word-break: break-all;
}
:deep(.chat-message-bubble__link:hover) {
  opacity: 1;
}
.chat-message-bubble__message-expiry-countdown {
  pointer-events: none;
}
.chat-message-bubble__image-4 {
  pointer-events: none;
}
.chat-message-bubble__block-4 {
  position: absolute;
}
.chat-message-bubble__block-6 {
  position: absolute;
}
.chat-message-bubble__message-expiry-countdown {
  position: absolute;
}
.chat-message-bubble__block-30 {
  position: absolute;
}
.chat-message-bubble__text-19 {
  position: absolute;
}
.chat-message-bubble__block-38 {
  position: absolute;
}
.chat-message-bubble__block-32 {
  position: fixed;
}
.chat-message-bubble__block-37 {
  position: fixed;
}
.chat-message-bubble__block-3 {
  position: relative;
}
.chat-message-bubble__block-5 {
  position: relative;
}
.chat-message-bubble__block-9 {
  position: relative;
}
.chat-message-bubble__block-10 {
  position: relative;
}
.chat-message-bubble__block-23 {
  position: relative;
}
.chat-message-bubble__text-in-send {
  position: relative;
}
.chat-message-bubble__text-20 {
  position: relative;
}
.chat-message-bubble__block-32 {
  inset: 0;
}
.chat-message-bubble__block-37 {
  inset: 0;
}
.chat-message-bubble__block-4 {
  top: 0;
}
.chat-message-bubble__message-expiry-countdown {
  top: calc(var(--spacing) * 2);
}
.chat-message-bubble__block-38 {
  top: calc(var(--spacing) * 4);
}
.chat-message-bubble__block--variant-1-4 {
  right: 0;
}
.chat-message-bubble__message-expiry-countdown {
  right: calc(var(--spacing) * 2);
}
.chat-message-bubble__block--variant-2-6 {
  right: calc(var(--spacing) * 2);
}
.chat-message-bubble__block-38 {
  right: calc(var(--spacing) * 4);
}
.chat-message-bubble__block--variant-1-3 {
  right: 100%;
}
.chat-message-bubble__block-30 {
  bottom: calc(var(--spacing) * -2.5);
}
.chat-message-bubble__block-6 {
  bottom: 100%;
}
.chat-message-bubble__block--variant-2-4 {
  left: 0;
}
.chat-message-bubble__block--variant-1-8 {
  left: calc(var(--spacing) * 2);
}
.chat-message-bubble__block--variant-2-3 {
  left: 100%;
}
.chat-message-bubble__block-4 {
  z-index: 10;
}
.chat-message-bubble__message-expiry-countdown {
  z-index: 10;
}
.chat-message-bubble__block-30 {
  z-index: 10;
}
.chat-message-bubble__block-38 {
  z-index: 10;
}
.chat-message-bubble__block-6 {
  z-index: 20;
}
.chat-message-bubble__block-32 {
  z-index: 50;
}
.chat-message-bubble__block-37 {
  z-index: 50;
}
.chat-message-bubble__map-pin {
  margin-top: calc(var(--spacing) * .5);
}
.chat-message-bubble__text-23 {
  margin-top: calc(var(--spacing) * .5);
}
.chat-message-bubble__copy-2 {
  margin-top: calc(var(--spacing) * .5);
}
.chat-message-bubble__check-3 {
  margin-top: calc(var(--spacing) * .5);
}
.chat-message-bubble__block--variant-3 {
  margin-top: var(--spacing);
}
.chat-message-bubble__image {
  margin-top: var(--spacing);
}
.chat-message-bubble__block-31 {
  margin-top: var(--spacing);
}
.chat-message-bubble__text-waiting-on {
  margin-top: var(--spacing);
}
.chat-message-bubble__text-29 {
  margin-top: var(--spacing);
}
  margin-top: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__block--variant-4 {
  margin-top: calc(var(--spacing) * 3);
}
.chat-message-bubble__block--variant-1-3 {
  margin-right: calc(var(--spacing) * 2);
}
.chat-message-bubble__text-replied-to {
  margin-bottom: calc(var(--spacing) * .5);
}
.chat-message-bubble__text-4 {
  margin-bottom: var(--spacing);
}
.chat-message-bubble__text-25 {
  margin-bottom: var(--spacing);
}
.chat-message-bubble__text-status {
  margin-bottom: var(--spacing);
}
.chat-message-bubble__text-seen-by {
  margin-bottom: var(--spacing);
}
.chat-message-bubble__text-timestamp {
  margin-bottom: var(--spacing);
}
.chat-message-bubble__block-6 {
  margin-bottom: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__block-7 {
  margin-bottom: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__block-9 {
  margin-bottom: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__block-11 {
  margin-bottom: calc(var(--spacing) * 2);
}
.chat-message-bubble__play {
  margin-left: calc(var(--spacing) * .5);
}
.chat-message-bubble__play-2 {
  margin-left: calc(var(--spacing) * .5);
}
.chat-message-bubble__text-17 {
  margin-left: calc(var(--spacing) * .5);
}
.chat-message-bubble__block--variant-2-3 {
  margin-left: calc(var(--spacing) * 2);
}
.chat-message-bubble__image-2 {
  display: block;
}
.chat-message-bubble__image-3 {
  display: block;
}
.chat-message-bubble__block {
  display: flex;
}
.chat-message-bubble__block-3 {
  display: flex;
}
.chat-message-bubble__block-4 {
  display: flex;
}
.chat-message-bubble__block-6 {
  display: flex;
}
.chat-message-bubble__block-7 {
  display: flex;
}
.chat-message-bubble__text {
  display: flex;
}
.chat-message-bubble__block-12 {
  display: flex;
}
.chat-message-bubble__block-13 {
  display: flex;
}
.chat-message-bubble__block-14 {
  display: flex;
}
.chat-message-bubble__block-16 {
  display: flex;
}
.chat-message-bubble__block-17 {
  display: flex;
}
.chat-message-bubble__block-21 {
  display: flex;
}
.chat-message-bubble__block-22 {
  display: flex;
}
.chat-message-bubble__block-23 {
  display: flex;
}
.chat-message-bubble__block-25 {
  display: flex;
}
.chat-message-bubble__block-26 {
  display: flex;
}
.chat-message-bubble__block-28 {
  display: flex;
}
.chat-message-bubble__block-30 {
  display: flex;
}
.chat-message-bubble__block-31 {
  display: flex;
}
.chat-message-bubble__text-in-send {
  display: flex;
}
.chat-message-bubble__block-32 {
  display: flex;
}
.chat-message-bubble__block-33 {
  display: flex;
}
.chat-message-bubble__block-34 {
  display: flex;
}
.chat-message-bubble__button-9 {
  display: flex;
}
.chat-message-bubble__block-36 {
  display: flex;
}
.chat-message-bubble__block-37 {
  display: flex;
}
.chat-message-bubble__block-38 {
  display: flex;
}
.chat-message-bubble__block-39 {
  display: flex;
}
.chat-message-bubble__audio {
  display: none;
}
.chat-message-bubble__audio-2 {
  display: none;
}
.chat-message-bubble__button-react {
  display: inline-flex;
}
.chat-message-bubble__button-edit-message {
  display: inline-flex;
}
.chat-message-bubble__button-reply {
  display: inline-flex;
}
.chat-message-bubble__button-2 {
  display: inline-flex;
}
.chat-message-bubble__button-download-file {
  display: inline-flex;
}
.chat-message-bubble__button-3 {
  display: inline-flex;
}
.chat-message-bubble__button-save-voice {
  display: inline-flex;
}
.chat-message-bubble__button-4 {
  display: inline-flex;
}
.chat-message-bubble__button-5 {
  display: inline-flex;
}
.chat-message-bubble__button-x {
  display: inline-flex;
}
.chat-message-bubble__button-6 {
  display: inline-flex;
}
.chat-message-bubble__button-retry {
  display: inline-flex;
}
.chat-message-bubble__link-opens-openstreetmap {
  display: inline-flex;
}
.chat-message-bubble__text-19 {
  display: inline-flex;
}
.chat-message-bubble__text-20 {
  display: inline-flex;
}
.chat-message-bubble__button-7 {
  display: inline-flex;
}
.chat-message-bubble__button-10 {
  display: inline-flex;
}
.chat-message-bubble__text-20 {
  height: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__text-in-send {
  height: calc(var(--spacing) * 2);
}
.chat-message-bubble__text-19 {
  height: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__external-link {
  height: calc(var(--spacing) * 3);
}
.chat-message-bubble__check-check {
  height: calc(var(--spacing) * 3);
}
.chat-message-bubble__check-check-2 {
  height: calc(var(--spacing) * 3);
}
.chat-message-bubble__check-2 {
  height: calc(var(--spacing) * 3);
}
.chat-message-bubble__circle-alert {
  height: calc(var(--spacing) * 3);
}
.chat-message-bubble__smile {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__pencil {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__reply {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__check {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__copy {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__play {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__pause {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__download-2 {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__mic {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__play-2 {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__pause-2 {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__download-3 {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__map-pin {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__copy-2 {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__check-3 {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__copy-3 {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__check-4 {
  height: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__image-off {
  height: calc(var(--spacing) * 4);
}
.chat-message-bubble__download {
  height: calc(var(--spacing) * 4);
}
.chat-message-bubble__x {
  height: calc(var(--spacing) * 4);
}
.chat-message-bubble__download-4 {
  height: calc(var(--spacing) * 5);
}
.chat-message-bubble__x-2 {
  height: calc(var(--spacing) * 5);
}
.chat-message-bubble__button-x {
  height: calc(var(--spacing) * 6);
}
.chat-message-bubble__image {
  height: calc(var(--spacing) * 8);
}
.chat-message-bubble__button-3 {
  height: calc(var(--spacing) * 8);
}
.chat-message-bubble__block-14 {
  height: calc(var(--spacing) * 8);
}
.chat-message-bubble__button-save-voice {
  height: calc(var(--spacing) * 8);
}
.chat-message-bubble__button-5 {
  height: calc(var(--spacing) * 8);
}
.chat-message-bubble__block-23 {
  height: calc(var(--spacing) * 8);
}
.chat-message-bubble__text {
  height: calc(var(--spacing) * 9);
}
.chat-message-bubble__block-39 {
  height: 100%;
}
.chat-message-bubble__image-3 {
  max-height: calc(var(--spacing) * 64);
}
.chat-message-bubble__video-2 {
  max-height: calc(var(--spacing) * 64);
}
.chat-message-bubble__image-2 {
  max-height: calc(var(--spacing) * 72);
}
.chat-message-bubble__video {
  max-height: calc(var(--spacing) * 72);
}
.chat-message-bubble__image-4 {
  max-height: 100%;
}
.chat-message-bubble__button-download-file {
  min-height: 44px;
}
.chat-message-bubble__text-20 {
  width: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__text-in-send {
  width: calc(var(--spacing) * 2);
}
.chat-message-bubble__text-19 {
  width: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__external-link {
  width: calc(var(--spacing) * 3);
}
.chat-message-bubble__check-check {
  width: calc(var(--spacing) * 3);
}
.chat-message-bubble__check-check-2 {
  width: calc(var(--spacing) * 3);
}
.chat-message-bubble__check-2 {
  width: calc(var(--spacing) * 3);
}
.chat-message-bubble__circle-alert {
  width: calc(var(--spacing) * 3);
}
.chat-message-bubble__smile {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__pencil {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__reply {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__check {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__copy {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__play {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__pause {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__download-2 {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__mic {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__play-2 {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__pause-2 {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__download-3 {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__map-pin {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__copy-2 {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__check-3 {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__copy-3 {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__check-4 {
  width: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__image-off {
  width: calc(var(--spacing) * 4);
}
.chat-message-bubble__download {
  width: calc(var(--spacing) * 4);
}
.chat-message-bubble__x {
  width: calc(var(--spacing) * 4);
}
.chat-message-bubble__download-4 {
  width: calc(var(--spacing) * 5);
}
.chat-message-bubble__x-2 {
  width: calc(var(--spacing) * 5);
}
.chat-message-bubble__image {
  width: calc(var(--spacing) * 8);
}
.chat-message-bubble__block-2 {
  width: calc(var(--spacing) * 8);
}
.chat-message-bubble__button-3 {
  width: calc(var(--spacing) * 8);
}
.chat-message-bubble__button-save-voice {
  width: calc(var(--spacing) * 8);
}
.chat-message-bubble__button-5 {
  width: calc(var(--spacing) * 8);
}
.chat-message-bubble__text {
  width: calc(var(--spacing) * 9);
}
.chat-message-bubble__block-3 {
  width: 100%;
}
.chat-message-bubble__block-7 {
  width: 100%;
}
.chat-message-bubble__image-2 {
  width: 100%;
}
.chat-message-bubble__video {
  width: 100%;
}
.chat-message-bubble__block-12 {
  width: 100%;
}
.chat-message-bubble__image-3 {
  width: 100%;
}
.chat-message-bubble__video-2 {
  width: 100%;
}
.chat-message-bubble__media-decrypt-status {
  width: 100%;
}
.chat-message-bubble__send-attempts {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 0.75);
  list-style: none;
  margin: 0;
  margin-top: var(--spacing);
  padding: 0;
}
.chat-message-bubble__send-attempt {
  align-items: center;
  display: flex;
  gap: calc(var(--spacing) * 0.75);
  min-height: 44px;
}
.chat-message-bubble__send-dot {
  background-color: var(--app-danger);
  border-radius: 999px;
  flex: none;
  height: 0.625rem;
  width: 0.625rem;
}
.chat-message-bubble__send-dot--ok {
  background-color: var(--app-success);
}
.chat-message-bubble__send-dot--trying {
  background-color: var(--app-warning);
}
.chat-message-bubble__send-dot--skipped {
  background-color: var(--app-muted);
}
.chat-message-bubble__send-host {
  color: var(--app-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-message-bubble__send-state {
  color: var(--app-muted);
  flex: none;
}
.chat-message-bubble__text-send-detail {
  color: var(--app-muted);
  margin-top: calc(var(--spacing) * 0.5);
}
.chat-message-bubble__dialog {
  width: 100%;
}
.chat-message-bubble__button-9 {
  width: 100%;
}
.chat-message-bubble__button-10 {
  width: 100%;
}
.chat-message-bubble__block-39 {
  width: 100%;
}
.chat-message-bubble__text-3 {
  max-width: calc(var(--spacing) * 50);
}
.chat-message-bubble__block-27 {
  max-width: 15rem;
}
.chat-message-bubble__image-4 {
  max-width: 100vw;
}
.chat-message-bubble__block-3 {
  max-width: calc(100% - 2.75rem);
}
.chat-message-bubble__block {
  max-width: 100%;
}
.chat-message-bubble__block-9 {
  max-width: 100%;
}
.chat-message-bubble__image-2 {
  max-width: 100%;
}
.chat-message-bubble__video {
  max-width: 100%;
}
.chat-message-bubble__block-10 {
  max-width: 100%;
}
.chat-message-bubble__text-5 {
  max-width: 100%;
}
.chat-message-bubble__block-12 {
  max-width: 100%;
}
.chat-message-bubble__block-19 {
  max-width: 100%;
}
.chat-message-bubble__image-3 {
  max-width: 100%;
}
.chat-message-bubble__block-20 {
  max-width: 100%;
}
.chat-message-bubble__video-2 {
  max-width: 100%;
}
.chat-message-bubble__text-23 {
  max-width: 100%;
}
.chat-message-bubble__block-7 {
  max-width: var(--container-sm);
}
.chat-message-bubble__media-decrypt-status {
  max-width: var(--container-sm);
}
.chat-message-bubble__dialog {
  max-width: var(--container-sm);
}
.chat-message-bubble__block {
  min-width: 0;
}
.chat-message-bubble__block-3 {
  min-width: 0;
}
.chat-message-bubble__block-8 {
  min-width: 0;
}
.chat-message-bubble__block-10 {
  min-width: 0;
}
.chat-message-bubble__text-5 {
  min-width: 0;
}
.chat-message-bubble__block-12 {
  min-width: 0;
}
.chat-message-bubble__block-18 {
  min-width: 0;
}
.chat-message-bubble__text-7 {
  min-width: 0;
}
.chat-message-bubble__group {
  min-width: 0;
}
.chat-message-bubble__block-27 {
  min-width: 0;
}
.chat-message-bubble__block-29 {
  min-width: 0;
}
.chat-message-bubble__text-26 {
  min-width: 0;
}
.chat-message-bubble__button-download-file {
  min-width: 44px;
}
.chat-message-bubble__block-8 {
  flex: 1;
}
.chat-message-bubble__block-14 {
  flex: 1;
}
.chat-message-bubble__block-15 {
  flex: 1;
}
.chat-message-bubble__block-23 {
  flex: 1;
}
.chat-message-bubble__block-24 {
  flex: 1;
}
.chat-message-bubble__block-29 {
  flex: 1;
}
.chat-message-bubble__text-26 {
  flex: 1;
}
.chat-message-bubble__image {
  flex-shrink: 0;
}
.chat-message-bubble__block-2 {
  flex-shrink: 0;
}
.chat-message-bubble__text {
  flex-shrink: 0;
}
.chat-message-bubble__button-3 {
  flex-shrink: 0;
}
.chat-message-bubble__button-save-voice {
  flex-shrink: 0;
}
.chat-message-bubble__mic {
  flex-shrink: 0;
}
.chat-message-bubble__button-5 {
  flex-shrink: 0;
}
.chat-message-bubble__button-x {
  flex-shrink: 0;
}
.chat-message-bubble__text-8 {
  flex-shrink: 0;
}
.chat-message-bubble__text-9 {
  flex-shrink: 0;
}
.chat-message-bubble__text-10 {
  flex-shrink: 0;
}
.chat-message-bubble__text-11 {
  flex-shrink: 0;
}
.chat-message-bubble__text-12 {
  flex-shrink: 0;
}
.chat-message-bubble__button-6 {
  flex-shrink: 0;
}
.chat-message-bubble__button-retry {
  flex-shrink: 0;
}
.chat-message-bubble__map-pin {
  flex-shrink: 0;
}
.chat-message-bubble__copy-2 {
  flex-shrink: 0;
}
.chat-message-bubble__check-3 {
  flex-shrink: 0;
}
.chat-message-bubble__enter-to-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.chat-message-bubble__enter-from-class {
  --translate-y: var(--spacing);
  translate: var(--translate-x,0) var(--spacing);
}
.chat-message-bubble__enter-from-class {
  --scale-x: 90%;
  --scale-y: 90%;
  --scale-z: 90%;
  scale: 90% 90%;
}
.chat-message-bubble__leave-to-class {
  --scale-x: 90%;
  --scale-y: 90%;
  --scale-z: 90%;
  scale: 90% 90%;
}
.chat-message-bubble__enter-to-class {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
.chat-message-bubble__leave-from-class {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
.chat-message-bubble__text-19 {
  animation: var(--animate-ping);
}
.chat-message-bubble__block--pulse {
  animation: var(--animate-pulse);
}
.chat-message-bubble__image {
  cursor: pointer;
}
.chat-message-bubble__button-react {
  cursor: pointer;
}
.chat-message-bubble__button {
  cursor: pointer;
}
.chat-message-bubble__button-edit-message {
  cursor: pointer;
}
.chat-message-bubble__button-reply {
  cursor: pointer;
}
.chat-message-bubble__button-2 {
  cursor: pointer;
}
.chat-message-bubble__button-download-file {
  cursor: pointer;
}
.chat-message-bubble__button-3 {
  cursor: pointer;
}
.chat-message-bubble__block-14 {
  cursor: pointer;
}
.chat-message-bubble__button-save-voice {
  cursor: pointer;
}
.chat-message-bubble__button-4 {
  cursor: pointer;
}
.chat-message-bubble__button-5 {
  cursor: pointer;
}
.chat-message-bubble__block-23 {
  cursor: pointer;
}
.chat-message-bubble__button-x {
  cursor: pointer;
}
.chat-message-bubble__button-6 {
  cursor: pointer;
}
.chat-message-bubble__button-retry {
  cursor: pointer;
}
.chat-message-bubble__button-7 {
  cursor: pointer;
}
.chat-message-bubble__button-8 {
  cursor: pointer;
}
.chat-message-bubble__button-9 {
  cursor: pointer;
}
.chat-message-bubble__button-10 {
  cursor: pointer;
}
.chat-message-bubble__button-save-image {
  cursor: pointer;
}
.chat-message-bubble__button-close {
  cursor: pointer;
}
.chat-message-bubble__image-2 {
  cursor: zoom-in;
}
.chat-message-bubble__image-3 {
  cursor: zoom-in;
}
.chat-message-bubble__block-39 {
  touch-action: none;
}
.chat-message-bubble__block-3 {
  flex-direction: column;
}
.chat-message-bubble__block-12 {
  flex-direction: column;
}
.chat-message-bubble__block-17 {
  flex-direction: column;
}
.chat-message-bubble__block-21 {
  flex-direction: column;
}
.chat-message-bubble__block-36 {
  flex-direction: column;
}
.chat-message-bubble__block--variant-2 {
  flex-direction: row;
}
.chat-message-bubble__block--variant-1 {
  flex-direction: row-reverse;
}
.chat-message-bubble__block-26 {
  flex-wrap: wrap;
}
.chat-message-bubble__block-4 {
  align-items: center;
}
.chat-message-bubble__button-react {
  align-items: center;
}
.chat-message-bubble__button-edit-message {
  align-items: center;
}
.chat-message-bubble__button-reply {
  align-items: center;
}
.chat-message-bubble__button-2 {
  align-items: center;
}
.chat-message-bubble__block-7 {
  align-items: center;
}
.chat-message-bubble__text {
  align-items: center;
}
.chat-message-bubble__button-download-file {
  align-items: center;
}
.chat-message-bubble__block-13 {
  align-items: center;
}
.chat-message-bubble__button-3 {
  align-items: center;
}
.chat-message-bubble__block-14 {
  align-items: center;
}
.chat-message-bubble__button-save-voice {
  align-items: center;
}
.chat-message-bubble__button-4 {
  align-items: center;
}
.chat-message-bubble__block-22 {
  align-items: center;
}
.chat-message-bubble__button-5 {
  align-items: center;
}
.chat-message-bubble__block-23 {
  align-items: center;
}
.chat-message-bubble__button-x {
  align-items: center;
}
.chat-message-bubble__block-26 {
  align-items: center;
}
.chat-message-bubble__button-6 {
  align-items: center;
}
.chat-message-bubble__button-retry {
  align-items: center;
}
.chat-message-bubble__link-opens-openstreetmap {
  align-items: center;
}
.chat-message-bubble__block-30 {
  align-items: center;
}
.chat-message-bubble__block-31 {
  align-items: center;
}
.chat-message-bubble__text-in-send {
  align-items: center;
}
.chat-message-bubble__block-33 {
  align-items: center;
}
.chat-message-bubble__button-7 {
  align-items: center;
}
.chat-message-bubble__button-10 {
  align-items: center;
}
.chat-message-bubble__block-37 {
  align-items: center;
}
.chat-message-bubble__block-38 {
  align-items: center;
}
.chat-message-bubble__block-39 {
  align-items: center;
}
.chat-message-bubble__block--variant-1-2 {
  align-items: flex-end;
}
.chat-message-bubble__block-32 {
  align-items: flex-end;
}
.chat-message-bubble__block--variant-2-2 {
  align-items: flex-start;
}
.chat-message-bubble__block-28 {
  align-items: flex-start;
}
.chat-message-bubble__button-9 {
  align-items: flex-start;
}
.chat-message-bubble__block-16 {
  justify-content: space-between;
}
.chat-message-bubble__block-25 {
  justify-content: space-between;
}
.chat-message-bubble__block-33 {
  justify-content: space-between;
}
.chat-message-bubble__button-react {
  justify-content: center;
}
.chat-message-bubble__button-edit-message {
  justify-content: center;
}
.chat-message-bubble__button-reply {
  justify-content: center;
}
.chat-message-bubble__button-2 {
  justify-content: center;
}
.chat-message-bubble__text {
  justify-content: center;
}
.chat-message-bubble__button-download-file {
  justify-content: center;
}
.chat-message-bubble__button-3 {
  justify-content: center;
}
.chat-message-bubble__button-save-voice {
  justify-content: center;
}
.chat-message-bubble__button-5 {
  justify-content: center;
}
.chat-message-bubble__button-x {
  justify-content: center;
}
.chat-message-bubble__text-in-send {
  justify-content: center;
}
.chat-message-bubble__block-32 {
  justify-content: center;
}
.chat-message-bubble__button-7 {
  justify-content: center;
}
.chat-message-bubble__block-34 {
  justify-content: center;
}
.chat-message-bubble__button-10 {
  justify-content: center;
}
.chat-message-bubble__block-37 {
  justify-content: center;
}
.chat-message-bubble__block-39 {
  justify-content: center;
}
.chat-message-bubble__block--variant-1-9 {
  justify-content: flex-end;
}
.chat-message-bubble__block--variant-2-7 {
  justify-content: flex-start;
}
.chat-message-bubble__block-4 {
  gap: calc(var(--spacing) * .5);
}
.chat-message-bubble__block-14 {
  gap: calc(var(--spacing) * .5);
}
.chat-message-bubble__block-23 {
  gap: calc(var(--spacing) * .5);
}
.chat-message-bubble__block-6 {
  gap: var(--spacing);
}
.chat-message-bubble__block-17 {
  gap: var(--spacing);
}
.chat-message-bubble__button-6 {
  gap: var(--spacing);
}
.chat-message-bubble__button-retry {
  gap: var(--spacing);
}
.chat-message-bubble__link-opens-openstreetmap {
  gap: var(--spacing);
}
.chat-message-bubble__block-30 {
  gap: var(--spacing);
}
.chat-message-bubble__button-4 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__block-31 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__block-12 {
  gap: calc(var(--spacing) * 2);
}
.chat-message-bubble__block-21 {
  gap: calc(var(--spacing) * 2);
}
.chat-message-bubble__block-28 {
  gap: calc(var(--spacing) * 2);
}
.chat-message-bubble__block-34 {
  gap: calc(var(--spacing) * 2);
}
.chat-message-bubble__button-9 {
  gap: calc(var(--spacing) * 2);
}
.chat-message-bubble__block-36 {
  gap: calc(var(--spacing) * 2);
}
.chat-message-bubble__button-10 {
  gap: calc(var(--spacing) * 2);
}
.chat-message-bubble__block-38 {
  gap: calc(var(--spacing) * 2);
}
.chat-message-bubble__block {
  gap: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__block-7 {
  gap: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__block-22 {
  gap: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__block-13 {
  gap: calc(var(--spacing) * 3);
}
.chat-message-bubble__block-33 {
  gap: calc(var(--spacing) * 3);
}
:where(.chat-message-bubble__block-27>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.chat-message-bubble__block-18>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.chat-message-bubble__block-35>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.chat-message-bubble__dialog>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
.chat-message-bubble__block-26 {
  column-gap: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__block-26 {
  row-gap: var(--spacing);
}
.chat-message-bubble__text-2 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-message-bubble__text-3 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-message-bubble__text-23 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-message-bubble__block-9 {
  overflow: hidden;
}
.chat-message-bubble__block-19 {
  overflow: hidden;
}
.chat-message-bubble__block-20 {
  overflow: hidden;
}
.chat-message-bubble__block-39 {
  overflow: hidden;
}
.chat-message-bubble__block-15 {
  border-radius: 3.40282e38px;
}
.chat-message-bubble__block-24 {
  border-radius: 3.40282e38px;
}
.chat-message-bubble__block-30 {
  border-radius: 3.40282e38px;
}
.chat-message-bubble__text-19 {
  border-radius: 3.40282e38px;
}
.chat-message-bubble__text-20 {
  border-radius: 3.40282e38px;
}
.chat-message-bubble__button-save-image {
  border-radius: 3.40282e38px;
}
.chat-message-bubble__button-close {
  border-radius: 3.40282e38px;
}
.chat-message-bubble__image {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__block-4 {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__block-6 {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__text {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__button-download-file {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__button-3 {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__button-save-voice {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__button-5 {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__button-7 {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__button-9 {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__button-10 {
  border-radius: var(--radius-lg);
}
.chat-message-bubble__button-react {
  border-radius: var(--radius-md);
}
.chat-message-bubble__button-edit-message {
  border-radius: var(--radius-md);
}
.chat-message-bubble__button-reply {
  border-radius: var(--radius-md);
}
.chat-message-bubble__button-2 {
  border-radius: var(--radius-md);
}
.chat-message-bubble__block-11 {
  border-radius: var(--radius-md);
}
.chat-message-bubble__button-x {
  border-radius: var(--radius-md);
}
.chat-message-bubble__block-7 {
  border-radius: var(--radius-xl);
}
.chat-message-bubble__block-9 {
  border-radius: var(--radius-xl);
}
.chat-message-bubble__block--variant-2-5 {
  border-radius: var(--radius-xl);
}
.chat-message-bubble__block--warning {
  border-radius: var(--radius-xl);
}
.chat-message-bubble__block--variant-4-2 {
  border-radius: var(--radius-xl);
}
.chat-message-bubble__block-19 {
  border-radius: var(--radius-xl);
}
.chat-message-bubble__block-20 {
  border-radius: var(--radius-xl);
}
.chat-message-bubble__dialog {
  border-radius: var(--radius-xl);
}
.chat-message-bubble__image {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__button-download-file {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block-9 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block--variant-2-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block--warning {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block--variant-4-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__button-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__button-save-voice {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block-19 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block-20 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__button-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__button-x {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block-30 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__dialog {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__button-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__button-9 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__button-10 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-bubble__block-11 {
  border-left-style: var(--border-style,solid);
  border-left-width: 2px;
}
.chat-message-bubble__block--warning {
  border-color: #f99c0066;
}
.chat-message-bubble__block-11 {
  border-color: var(--ui-zinc-500);
}
.chat-message-bubble__block--variant-2-5 {
  border-color: var(--ui-zinc-700);
}
.chat-message-bubble__image {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__block-4 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__block-6 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__block-7 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__text {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__button-download-file {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__block-9 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__button-3 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__button-save-voice {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__block-19 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__block-20 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__button-5 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__button-x {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__block-30 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__dialog {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__button-7 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__button-9 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__button-10 {
  border-color: var(--ui-zinc-800);
}
.chat-message-bubble__block--variant-4-2 {
  border-color: var(--app-border-quiet);
}
.chat-message-bubble__block--warning {
  background-color: var(--app-warning-soft);
}
.chat-message-bubble__block-9 {
  background-color: var(--ui-black);
}
.chat-message-bubble__video {
  background-color: var(--ui-black);
}
.chat-message-bubble__block-19 {
  background-color: var(--ui-black);
}
.chat-message-bubble__block-20 {
  background-color: var(--ui-black);
}
.chat-message-bubble__block-32 {
  background-color: var(--ui-black);
}
.chat-message-bubble__block-37 {
  background-color: var(--ui-black);
}
.chat-message-bubble__text-20 {
  background-color: var(--color-white);
}
.chat-message-bubble__button-save-image {
  background-color: #ffffff1a;
}
.chat-message-bubble__button-close {
  background-color: #ffffff1a;
}
.chat-message-bubble__block--variant-1-6 {
  background-color: var(--ui-zinc-200);
}
.chat-message-bubble__block--variant-1-7 {
  background-color: var(--ui-zinc-200);
}
.chat-message-bubble__block--muted-2 {
  background-color: var(--ui-zinc-400);
}
.chat-message-bubble__text-19 {
  background-color: var(--ui-zinc-400);
}
.chat-message-bubble__block--selected {
  background-color: var(--ui-zinc-800);
}
.chat-message-bubble__block--selected-2 {
  background-color: var(--ui-zinc-800);
}
.chat-message-bubble__block--variant-2-5 {
  background-color: var(--ui-zinc-800);
}
.chat-message-bubble__button-download-file {
  background-color: var(--ui-zinc-900);
}
.chat-message-bubble__button-7 {
  background-color: var(--ui-zinc-900);
}
.chat-message-bubble__button-10 {
  background-color: var(--ui-zinc-900);
}
.chat-message-bubble__block--variant-4-2 {
  background-color: var(--app-surface-tint);
}
.chat-message-bubble__button-9 {
  background-color: var(--app-surface-tint);
}
.chat-message-bubble__text {
  background-color: var(--ui-zinc-900);
}
.chat-message-bubble__block-11 {
  background-color: var(--app-surface-inset);
}
.chat-message-bubble__button-3 {
  background-color: var(--ui-zinc-950);
}
.chat-message-bubble__button-save-voice {
  background-color: var(--ui-zinc-950);
}
.chat-message-bubble__button-5 {
  background-color: var(--ui-zinc-950);
}
.chat-message-bubble__button-x {
  background-color: var(--ui-zinc-950);
}
.chat-message-bubble__block-30 {
  background-color: var(--ui-zinc-950);
}
.chat-message-bubble__dialog {
  background-color: var(--ui-zinc-950);
}
.chat-message-bubble__block-7 {
  background-color: var(--ui-zinc-950);
}
.chat-message-bubble__block-4 {
  background-color: var(--ui-zinc-950);
}
.chat-message-bubble__block-6 {
  background-color: var(--ui-zinc-950);
}
.chat-message-bubble__play {
  fill: currentColor;
}
.chat-message-bubble__pause {
  fill: currentColor;
}
.chat-message-bubble__play-2 {
  fill: currentColor;
}
.chat-message-bubble__pause-2 {
  fill: currentColor;
}
.chat-message-bubble__image-2 {
  object-fit: contain;
}
.chat-message-bubble__image-3 {
  object-fit: contain;
}
.chat-message-bubble__image-4 {
  object-fit: contain;
}
.chat-message-bubble__image {
  object-fit: cover;
}
.chat-message-bubble__block-4 {
  padding: calc(var(--spacing) * .5);
}
.chat-message-bubble__button-react {
  padding: var(--spacing);
}
.chat-message-bubble__button-edit-message {
  padding: var(--spacing);
}
.chat-message-bubble__button-reply {
  padding: var(--spacing);
}
.chat-message-bubble__button-2 {
  padding: var(--spacing);
}
.chat-message-bubble__button-7 {
  padding: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__button-save-image {
  padding: calc(var(--spacing) * 2);
}
.chat-message-bubble__button-close {
  padding: calc(var(--spacing) * 2);
}
.chat-message-bubble__block-7 {
  padding: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__block-32 {
  padding: calc(var(--spacing) * 4);
}
.chat-message-bubble__dialog {
  padding: calc(var(--spacing) * 5);
}
.chat-message-bubble__button {
  padding-inline: calc(var(--spacing) * .5);
}
.chat-message-bubble__block--variant-1-5 {
  padding-inline: var(--spacing);
}
.chat-message-bubble__block-16 {
  padding-inline: var(--spacing);
}
.chat-message-bubble__button-4 {
  padding-inline: var(--spacing);
}
.chat-message-bubble__block-25 {
  padding-inline: var(--spacing);
}
.chat-message-bubble__block-26 {
  padding-inline: var(--spacing);
}
.chat-message-bubble__block-31 {
  padding-inline: var(--spacing);
}
.chat-message-bubble__text-23 {
  padding-inline: var(--spacing);
}
.chat-message-bubble__button-8 {
  padding-inline: var(--spacing);
}
.chat-message-bubble__block-6 {
  padding-inline: calc(var(--spacing) * 2);
}
.chat-message-bubble__button-x {
  padding-inline: calc(var(--spacing) * 2);
}
.chat-message-bubble__block-30 {
  padding-inline: calc(var(--spacing) * 2);
}
.chat-message-bubble__block-11 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__button-9 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__button-10 {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-message-bubble__block--variant-2-5 {
  padding-inline: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__block--warning {
  padding-inline: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__block--variant-4-2 {
  padding-inline: calc(var(--spacing) * 3.5);
}
.chat-message-bubble__block--variant-1-5 {
  padding-block: calc(var(--spacing) * .5);
}
.chat-message-bubble__block-30 {
  padding-block: calc(var(--spacing) * .5);
}
.chat-message-bubble__block-11 {
  padding-block: var(--spacing);
}
.chat-message-bubble__button-4 {
  padding-block: var(--spacing);
}
.chat-message-bubble__block-23 {
  padding-block: var(--spacing);
}
.chat-message-bubble__block-26 {
  padding-block: var(--spacing);
}
.chat-message-bubble__block-34 {
  padding-block: var(--spacing);
}
.chat-message-bubble__block-6 {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__button-9 {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-message-bubble__button-10 {
  padding-block: calc(var(--spacing) * 2);
}
.chat-message-bubble__block--variant-2-5 {
  padding-block: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__block--warning {
  padding-block: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__block--variant-4-2 {
  padding-block: calc(var(--spacing) * 2.5);
}
.chat-message-bubble__block-36 {
  padding-top: var(--spacing);
}
.chat-message-bubble__button-9 {
  text-align: left;
}
.chat-message-bubble__text-preview-unavailable {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-replied-to {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-4 {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-6 {
  font-family: var(--font-mono);
}
.chat-message-bubble__block-16 {
  font-family: var(--font-mono);
}
.chat-message-bubble__button-x {
  font-family: var(--font-mono);
}
.chat-message-bubble__block-25 {
  font-family: var(--font-mono);
}
.chat-message-bubble__block-26 {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-14 {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-15 {
  font-family: var(--font-mono);
}
.chat-message-bubble__link-opens-openstreetmap {
  font-family: var(--font-mono);
}
.chat-message-bubble__block-30 {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-18 {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-23 {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-25 {
  font-family: var(--font-mono);
}
.chat-message-bubble__button-9 {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-status {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-seen-by {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-timestamp {
  font-family: var(--font-mono);
}
.chat-message-bubble__text-30 {
  font-family: var(--font-mono);
}
.chat-message-bubble__button {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.chat-message-bubble__block-10 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.chat-message-bubble__heading-message-info {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.chat-message-bubble__button-8 {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.chat-message-bubble__block-11 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-message-bubble__button-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-message-bubble__block-35 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-message-bubble__button-10 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-message-bubble__text-preview-unavailable {
  font-size: 10px;
}
.chat-message-bubble__text-replied-to {
  font-size: 10px;
}
.chat-message-bubble__text-4 {
  font-size: 10px;
}
.chat-message-bubble__text-6 {
  font-size: 10px;
}
.chat-message-bubble__block-16 {
  font-size: 10px;
}
.chat-message-bubble__button-x {
  font-size: 10px;
}
.chat-message-bubble__block-25 {
  font-size: 10px;
}
.chat-message-bubble__text-15 {
  font-size: 10px;
}
.chat-message-bubble__text-17 {
  font-size: 10px;
}
.chat-message-bubble__text-18 {
  font-size: 10px;
}
.chat-message-bubble__text-23 {
  font-size: 10px;
}
.chat-message-bubble__block-26 {
  font-size: 11px;
}
.chat-message-bubble__text-14 {
  font-size: 11px;
}
.chat-message-bubble__link-opens-openstreetmap {
  font-size: 11px;
}
.chat-message-bubble__block-30 {
  font-size: 11px;
}
.chat-message-bubble__text-25 {
  font-size: 11px;
}
.chat-message-bubble__button-9 {
  font-size: 11px;
}
.chat-message-bubble__text-status {
  font-size: 11px;
}
.chat-message-bubble__text-seen-by {
  font-size: 11px;
}
.chat-message-bubble__text-timestamp {
  font-size: 11px;
}
.chat-message-bubble__text-30 {
  font-size: 11px;
}
.chat-message-bubble__text-2 {
  font-size: 12px;
}
.chat-message-bubble__text-16 {
  font-size: 12px;
}
.chat-message-bubble__text-16 {
  --leading: 1;
  line-height: 1;
}
.chat-message-bubble__text-5 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-message-bubble__text-24 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-message-bubble__text-7 {
  --leading: var(--leading-snug);
  line-height: var(--leading-snug);
}
.chat-message-bubble__text-13 {
  --leading: var(--leading-snug);
  line-height: var(--leading-snug);
}
.chat-message-bubble__text-2 {
  --leading: var(--leading-tight);
  line-height: var(--leading-tight);
}
.chat-message-bubble__text-preview-unavailable {
  --leading: var(--leading-tight);
  line-height: var(--leading-tight);
}
.chat-message-bubble__heading-message-info {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-message-bubble__text-27 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-message-bubble__heading-message-info {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.chat-message-bubble__text-9 {
  --tracking: var(--tracking-wide);
  letter-spacing: var(--tracking-wide);
}
.chat-message-bubble__text-replied-to {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-message-bubble__text-4 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-message-bubble__text-15 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-message-bubble__text-25 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-message-bubble__text-status {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-message-bubble__text-seen-by {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-message-bubble__text-timestamp {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-message-bubble__block-10 {
  overflow-wrap: break-word;
}
.chat-message-bubble__text-5 {
  overflow-wrap: break-word;
}
.chat-message-bubble__text-7 {
  overflow-wrap: break-word;
}
.chat-message-bubble__text-13 {
  overflow-wrap: break-word;
}
.chat-message-bubble__button-9 {
  word-break: break-all;
}
.chat-message-bubble__text-7 {
  white-space: normal;
}
.chat-message-bubble__text-15 {
  color: #fcbb00e6;
}
.chat-message-bubble__check {
  color: var(--color-emerald-400);
}
.chat-message-bubble__map-pin {
  color: var(--color-emerald-400);
}
.chat-message-bubble__check-3 {
  color: var(--color-emerald-400);
}
.chat-message-bubble__check-4 {
  color: var(--color-emerald-400);
}
.chat-message-bubble__success {
  color: var(--color-emerald-400);
}
.chat-message-bubble__button-retry {
  color: var(--color-red-400);
}
.chat-message-bubble__text-failed-to {
  color: var(--color-red-400);
}
.chat-message-bubble__danger {
  color: var(--color-red-400);
}
.chat-message-bubble__text-21 {
  color: var(--color-sky-400);
}
.chat-message-bubble__info {
  color: var(--color-sky-400);
}
.chat-message-bubble__block--variant-2-5 {
  color: var(--color-white);
}
.chat-message-bubble__heading-message-info {
  color: var(--color-white);
}
.chat-message-bubble__button-save-image {
  color: var(--color-white);
}
.chat-message-bubble__button-close {
  color: var(--color-white);
}
.chat-message-bubble__block--warning {
  color: var(--ui-zinc-100);
}
.chat-message-bubble__text-13 {
  color: var(--ui-zinc-100);
}
.chat-message-bubble__dialog {
  color: var(--ui-zinc-100);
}
.chat-message-bubble__text-2 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__block--variant-1-5 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__block--variant-4-2 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__block-12 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__button-3 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__button-save-voice {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__block-21 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__button-5 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__text-7 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__button-9 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__text-28 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__text-30 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__button-10 {
  color: var(--ui-zinc-200);
}
.chat-message-bubble__button-download-file {
  color: var(--ui-zinc-300);
}
.chat-message-bubble__text-3 {
  color: var(--ui-zinc-300);
}
.chat-message-bubble__link-opens-openstreetmap {
  color: var(--ui-zinc-300);
}
.chat-message-bubble__block-30 {
  color: var(--ui-zinc-300);
}
.chat-message-bubble__variant-5 {
  color: var(--ui-zinc-300);
}
.chat-message-bubble__button-react {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__button-edit-message {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__button-reply {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__button-2 {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__block--muted {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text-replied-to {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__block-17 {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__button-x {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__block-26 {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text-11 {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text-14 {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text-17 {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__button-7 {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text-24 {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text-25 {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text-status {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text-seen-by {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text-timestamp {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__muted {
  color: var(--ui-zinc-400);
}
.chat-message-bubble__text-preview-unavailable {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__text-4 {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__text-6 {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__block-16 {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__block-25 {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__text-18 {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__text-22 {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__text-sent-to {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__text-23 {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__copy-2 {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__text-waiting-on {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__text-29 {
  color: var(--ui-zinc-500);
}
.chat-message-bubble__text-replied-to {
  text-transform: uppercase;
}
.chat-message-bubble__text-4 {
  text-transform: uppercase;
}
.chat-message-bubble__text-9 {
  text-transform: uppercase;
}
.chat-message-bubble__text-15 {
  text-transform: uppercase;
}
.chat-message-bubble__text-25 {
  text-transform: uppercase;
}
.chat-message-bubble__text-status {
  text-transform: uppercase;
}
.chat-message-bubble__text-seen-by {
  text-transform: uppercase;
}
.chat-message-bubble__text-timestamp {
  text-transform: uppercase;
}
.chat-message-bubble__block-16 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-message-bubble__button-x {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-message-bubble__block-25 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-message-bubble__text-18 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-message-bubble__link-opens-openstreetmap {
  text-decoration-line: underline;
}
.chat-message-bubble__link-opens-openstreetmap {
  text-underline-offset: 2px;
}
.chat-message-bubble__block-4 {
  opacity: 0;
}
.chat-message-bubble__enter-from-class {
  opacity: 0;
}
.chat-message-bubble__leave-to-class {
  opacity: 0;
}
.chat-message-bubble__block--hidden {
  opacity: 0;
}
.chat-message-bubble__enter-from-class-2 {
  opacity: 0;
}
.chat-message-bubble__leave-to-class-2 {
  opacity: 0;
}
.chat-message-bubble__text-8 {
  opacity: .4;
}
.chat-message-bubble__text-10 {
  opacity: .4;
}
.chat-message-bubble__text-12 {
  opacity: .4;
}
.chat-message-bubble__text-19 {
  opacity: .75;
}
.chat-message-bubble__block--variant-3-2 {
  opacity: .8;
}
.chat-message-bubble__image {
  opacity: .95;
}
.chat-message-bubble__enter-to-class {
  opacity: 1;
}
.chat-message-bubble__leave-from-class {
  opacity: 1;
}
.chat-message-bubble__enter-to-class-2 {
  opacity: 1;
}
.chat-message-bubble__leave-from-class-2 {
  opacity: 1;
}
.chat-message-bubble__dialog {
  --shadow: 0 25px 50px -12px var(--shadow-color,#00000040);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 25px 50px -12px var(--shadow-color,#00000040);
}
.chat-message-bubble__block-4 {
  --shadow: 0 4px 6px -1px var(--shadow-color,#0000001a), 0 2px 4px -2px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 4px 6px -1px var(--shadow-color,#0000001a), 0 2px 4px -2px var(--shadow-color,#0000001a);
}
.chat-message-bubble__block-30 {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.chat-message-bubble__block-6 {
  --shadow: 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
}
.chat-message-bubble__block--variant-2-5 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-message-bubble__block--warning {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-message-bubble__block--variant-4-2 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-message-bubble__text-20 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-message-bubble__block-4 {
  --backdrop-blur: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.chat-message-bubble__block-6 {
  --backdrop-blur: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.chat-message-bubble__block-32 {
  --backdrop-blur: blur(var(--blur-xs));
  -webkit-backdrop-filter: blur(var(--blur-xs)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-xs)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.chat-message-bubble__button-save-image {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-close {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__block-24 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-react {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-edit-message {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-reply {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__block-7 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__text {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-download-file {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__block-10 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__block-15 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-save-voice {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-4 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-5 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-x {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-6 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__link-opens-openstreetmap {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-7 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-9 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-10 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__image {
  transition-property: opacity;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__block-4 {
  transition-property: opacity;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__enter-active-class-2 {
  transition-property: opacity;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__leave-active-class-2 {
  transition-property: opacity;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__image-3 {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__button-8 {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-bubble__block-15 {
  --duration: 75ms;
  transition-duration: 75ms;
}
.chat-message-bubble__block-24 {
  --duration: 75ms;
  transition-duration: 75ms;
}
.chat-message-bubble__leave-active-class {
  --duration: .1s;
  transition-duration: .1s;
}
.chat-message-bubble__button {
  --duration: .1s;
  transition-duration: .1s;
}
.chat-message-bubble__image {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-message-bubble__block-4 {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-message-bubble__enter-active-class {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-message-bubble__block-7 {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-message-bubble__button-download-file {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-message-bubble__block-10 {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-message-bubble__enter-active-class-2 {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-message-bubble__leave-active-class-2 {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-message-bubble__leave-active-class {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.chat-message-bubble__enter-active-class {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.chat-message-bubble__text-6 {
  -webkit-user-select: none;
  user-select: none;
}
.chat-message-bubble__block-12 {
  -webkit-user-select: none;
  user-select: none;
}
.chat-message-bubble__block-21 {
  -webkit-user-select: none;
  user-select: none;
}
.chat-message-bubble__button-x {
  -webkit-user-select: none;
  user-select: none;
}
.chat-message-bubble__text-18 {
  -webkit-user-select: none;
  user-select: none;
}
.chat-message-bubble__block-39 {
  -webkit-user-select: none;
  user-select: none;
}
.chat-message-bubble__button-download-file:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.chat-message-bubble__button:active {
  --scale-x: 110%;
  --scale-y: 110%;
  --scale-z: 110%;
  scale: 110% 110%;
}
.chat-message-bubble__button-save-voice:disabled {
  opacity: .5;
}
.chat-message-bubble__button-4:disabled {
  opacity: .5;
}
.chat-message-bubble__button-6:disabled {
  opacity: .5;
}
.chat-message-bubble__block--hidden:has([data-expiry]) {
  opacity: 1;
}
[data-theme="light"] .chat-message-bubble__button-save-image {
  background-color: var(--app-surface-soft) !important;
}
[data-theme="light"] .chat-message-bubble__button-close {
  background-color: var(--app-surface-soft) !important;
}
[data-theme="light"] .chat-message-bubble__check {
  color: var(--app-success);
}
[data-theme="light"] .chat-message-bubble__map-pin {
  color: var(--app-success);
}
[data-theme="light"] .chat-message-bubble__check-3 {
  color: var(--app-success);
}
[data-theme="light"] .chat-message-bubble__check-4 {
  color: var(--app-success);
}
[data-theme="light"] .chat-message-bubble__success {
  color: var(--app-success);
}
[data-theme="light"] .chat-message-bubble__button-retry {
  color: var(--app-danger);
}
[data-theme="light"] .chat-message-bubble__text-failed-to {
  color: var(--app-danger);
}
[data-theme="light"] .chat-message-bubble__danger {
  color: var(--app-danger);
}
[data-theme="light"] .chat-message-bubble__text-21 {
  color: var(--app-info);
}
[data-theme="light"] .chat-message-bubble__info {
  color: var(--app-info);
}
[data-theme="light"] .chat-message-bubble__button-download-file {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-message-bubble__text-3 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-message-bubble__link-opens-openstreetmap {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-message-bubble__block-30 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-message-bubble__variant-5 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-message-bubble__button-react {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__button-edit-message {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__button-reply {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__button-2 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__block--muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-replied-to {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__block-17 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__button-x {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__block-26 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-11 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-14 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-17 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__button-7 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-24 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-25 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-status {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-seen-by {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-timestamp {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-preview-unavailable {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-6 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__block-16 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__block-25 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-18 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-22 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-sent-to {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-23 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__copy-2 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-waiting-on {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-29 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__button-save-image:hover {
  background-color: var(--app-surface-hover) !important;
}
[data-theme="light"] .chat-message-bubble__button-close:hover {
  background-color: var(--app-surface-hover) !important;
}
[data-theme="light"] .chat-message-bubble__button-x:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block--warning {
  border-color: color-mix(in oklab,var(--color-amber-500) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block--variant-2-5 {
  border-color: color-mix(in oklab,var(--ui-zinc-700) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block-9 {
  background-color: color-mix(in oklab,var(--ui-black) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__video {
  background-color: color-mix(in oklab,var(--ui-black) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block-19 {
  background-color: color-mix(in oklab,var(--ui-black) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block-20 {
  background-color: color-mix(in oklab,var(--ui-black) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block-32 {
  background-color: color-mix(in oklab,var(--ui-black) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block-37 {
  background-color: color-mix(in oklab,var(--ui-black) 95%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__button-save-image {
  background-color: color-mix(in oklab,var(--color-white) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__button-close {
  background-color: color-mix(in oklab,var(--color-white) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block--variant-2-5 {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 90%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__text {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block-7 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block-4 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 95%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__block-6 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 95%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-bubble__text-15 {
  color: color-mix(in oklab,var(--color-amber-400) 90%,transparent);
}
}
}
</style>
