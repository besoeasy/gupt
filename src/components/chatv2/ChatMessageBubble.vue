<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Copy,
  Download,
  ExternalLink,
  Mic,
  Pause,
  Play,
  Reply,
  Pencil,
  Smile,
  Video,
  X,
} from "@lucide/vue";
import {
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
import { triggerHaptic, HAPTIC } from "@/lib/haptics";
import MediaDecryptStatus from "@/components/chat/MediaDecryptStatus.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { roboHashUrl } from "@/lib/crypto";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";

const props = defineProps({
  message: { type: Object, required: true },
  mine: { type: Boolean, default: false },
  blobUrl: { type: String, default: null },
  isLoading: { type: Boolean, default: false },
  mediaProgress: { type: Object, default: null },
  hasFailed: { type: Boolean, default: false },
  showSenderName: { type: Boolean, default: false },
  senderName: { type: String, default: "" },
  senderAvatar: { type: String, default: "" },
  selfHandle: { type: String, default: "" },
  isConsecutive: { type: Boolean, default: false },
});

const emit = defineEmits(["download", "retry", "reply", "react", "edit", "image-load"]);

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
  return String(props.message?.text || "").trim();
});

const NOSTR_EVENT_ID_RE = /^[a-f0-9]{64}$/i;
const isGroupMessage = computed(() => Boolean(props.message?.groupId));
const clientMsgId = computed(() => String(props.message?.id || "").trim());
const envelopeId = computed(() => String(props.message?.wrapId || "").trim());

const eventId = computed(() => {
  if (isGroupMessage.value) return clientMsgId.value || "—";
  const wrapId = envelopeId.value;
  if (NOSTR_EVENT_ID_RE.test(wrapId)) return wrapId;
  if (NOSTR_EVENT_ID_RE.test(clientMsgId.value)) return clientMsgId.value;
  return wrapId || clientMsgId.value || "—";
});

const njumpUrl = computed(() => {
  if (isGroupMessage.value) return "";
  const id = eventId.value;
  if (!NOSTR_EVENT_ID_RE.test(id)) return "";
  return `https://njump.me/${encodeURIComponent(id)}`;
});

const readByNames = computed(() => props.message?.readByNames || []);
const unreadByNames = computed(() => props.message?.unreadByNames || []);
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
  if (status === "pending") return "In send queue";
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
  if (status === "pending") return "text-zinc-400";
  if (status === "sent") {
    if (hasFullRead.value) return "text-sky-400";
    if (hasPartialRead.value) return "text-zinc-400";
    return "text-emerald-400";
  }
  if (status === "failed") return "text-red-400";
  return "text-zinc-300";
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
  if (phase === MEDIA_PHASE.FETCH || phase === MEDIA_PHASE.DECRYPT) return true;
  return props.isLoading;
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

onUnmounted(() => {
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
const avatarDisplaySrc = computed(() =>
  avatarError.value ? roboHashUrl(props.message?.sender || "") : props.senderAvatar,
);

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

const TALKY_RE = /^https:\/\/talky\.io\/[a-f0-9]{64}$/i;
const talkyUrl = computed(() => {
  if (props.message?.type !== "text") return null;
  const text = (props.message?.text || "").trim();
  return TALKY_RE.test(text) ? text : null;
});

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
    result += `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 opacity-90 hover:opacity-100 break-all">${url}</a>`;
    lastIndex = m.index + m[0].length;
  }
  result += esc(text.slice(lastIndex));
  return result;
});
</script>

<template>
  <div
    class="flex min-w-0 max-w-full gap-2.5 group/bubble"
    :class="[mine ? 'flex-row-reverse' : 'flex-row', isConsecutive ? 'mt-1' : 'mt-3']"
    :style="{ transform: bubbleTransform, transition: bubbleTransition }"
    @touchstart.passive="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend.passive="handleTouchEnd"
  >
    <!-- Peer avatar: only on first message of a group -->
    <img
      v-if="!mine && senderAvatar && !isConsecutive"
      :src="avatarDisplaySrc"
      class="w-8 h-8 rounded-lg border border-zinc-800 shrink-0 mt-1 object-cover opacity-95 transition-opacity duration-150 hover:opacity-100 cursor-pointer"
      :title="senderName"
      loading="lazy"
      @error="onAvatarError"
    />
    <div v-else-if="!mine && isConsecutive" class="w-8 shrink-0" />

    <div
      class="relative flex min-w-0 w-full max-w-[calc(100%-2.75rem)] flex-col sm:max-w-[72%] lg:max-w-[64%] xl:max-w-[58%]"
      :class="mine ? 'items-end' : 'items-start'"
    >
      <!-- Hover Actions -->
      <div
        class="absolute top-0 flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-950/95 p-0.5 shadow-md backdrop-blur-md opacity-0 group-hover/bubble:opacity-100 transition-opacity duration-150 z-10"
        :class="mine ? 'right-full mr-2' : 'left-full ml-2'"
      >
        <!-- Reaction picker trigger -->
        <div class="relative">
          <button
            type="button"
            @click="showReactionPicker = !showReactionPicker"
            class="inline-flex items-center justify-center text-zinc-400 p-1 rounded-md hover:bg-zinc-800 hover:text-yellow-400 transition-colors cursor-pointer"
            title="React"
          >
            <Smile class="w-3.5 h-3.5" :stroke-width="1.8" />
          </button>
          <Transition
            enter-active-class="transition-all duration-150 ease-out"
            enter-from-class="opacity-0 scale-90 translate-y-1"
            enter-to-class="opacity-100 scale-100 translate-y-0"
            leave-active-class="transition-all duration-100 ease-in"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-90"
          >
            <div
              v-if="showReactionPicker"
              class="border border-zinc-800 bg-zinc-950/95 shadow-xl absolute bottom-full mb-1.5 flex gap-1 rounded-lg px-2 py-1.5 z-20 backdrop-blur-md"
              :class="mine ? 'right-0' : 'left-0'"
            >
              <button
                v-for="e in REACT_EMOJIS"
                :key="e"
                type="button"
                @click="react(e)"
                class="text-sm px-0.5 hover:scale-125 transition-transform duration-100 active:scale-110 cursor-pointer"
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
          class="inline-flex items-center justify-center text-zinc-400 p-1 rounded-md hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
          title="Edit message"
        >
          <Pencil class="w-3.5 h-3.5" :stroke-width="1.8" />
        </button>
        <button
          type="button"
          @click="emit('reply', message)"
          class="inline-flex items-center justify-center text-zinc-400 p-1 rounded-md hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
          title="Reply"
        >
          <Reply class="w-3.5 h-3.5" :stroke-width="1.8" />
        </button>
        <button
          v-if="copyableMessageText"
          type="button"
          @click="copyMessageTextFromHover"
          class="inline-flex items-center justify-center text-zinc-400 p-1 rounded-md hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
          :title="hoverCopied ? 'Copied!' : 'Copy text'"
        >
          <Check v-if="hoverCopied" class="w-3.5 h-3.5 text-emerald-400" :stroke-width="2" />
          <Copy v-else class="w-3.5 h-3.5" :stroke-width="1.8" />
        </button>
      </div>

      <!-- Media preview outside the colored bubble -->
      <div
        v-if="showExternalMediaPreview"
        class="mb-1.5 max-w-full overflow-hidden rounded-xl border border-zinc-800 bg-black/40"
      >
        <img
          v-if="isImage(mediaMime)"
          :src="blobUrl"
          :alt="getFileLabel(message)"
          class="block max-h-72 max-w-full w-full object-contain cursor-zoom-in"
          @click="openLightbox"
          @load="emit('image-load')"
        />
        <video v-else :src="blobUrl" controls class="max-h-72 max-w-full w-full bg-black/40" />
      </div>

      <!-- Bubble (Geist sharp card style) -->
      <div
        class="relative min-w-0 max-w-full overflow-wrap-anywhere break-words text-sm transition-colors duration-150"
        :class="
          useInlineChrome
            ? 'px-1 py-0.5 text-zinc-200'
            : mine
              ? 'rounded-xl border border-zinc-700/80 bg-zinc-800/90 px-3.5 py-2.5 text-white shadow-xs'
              : isMentioned
                ? `rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-zinc-100 shadow-xs${mentionPulseActive ? ' animate-pulse' : ''}`
                : 'rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3.5 py-2.5 text-zinc-200 shadow-xs'
        "
        @contextmenu.prevent="openMessageInfo"
      >
        <!-- Replied-to Snippet -->
        <div
          v-if="message.replyTo"
          class="mb-2 rounded-md border-l-2 border-zinc-500 bg-zinc-950/40 px-2.5 py-1 text-xs"
          :class="useInlineChrome ? 'text-zinc-400' : ''"
        >
          <p class="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-0.5">
            Replied to message
          </p>
          <p class="truncate max-w-50 text-zinc-300">
            {{ message.replyExcerpt || "Audio/Media" }}
          </p>
        </div>

        <!-- Sender name (groups) -->
        <p
          v-if="showSenderName && !mine"
          class="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1"
        >
          {{ senderName }}
        </p>

        <!-- ── Text ── -->
        <template v-if="message.type === 'text'">
          <template v-if="talkyUrl">
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-1.5 opacity-75">
                <Video class="w-3 h-3 shrink-0" :stroke-width="1.8" />
                <span class="text-[10px] font-mono uppercase tracking-wider">Video Meeting</span>
              </div>
              <a
                :href="talkyUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex max-w-full items-center gap-2 whitespace-normal break-all rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 hover:border-zinc-600"
              >
                <Video class="w-3.5 h-3.5 shrink-0" :stroke-width="1.8" />
                Join Meeting
              </a>
            </div>
          </template>
          <template v-else>
            <p
              class="min-w-0 max-w-full overflow-wrap-anywhere break-words leading-relaxed"
              v-html="linkifyText"
            ></p>
            <span v-if="message.editedAt" class="text-[10px] font-mono text-zinc-500 select-none">
              · edited</span
            >
          </template>
        </template>

        <!-- ── Voice note ── -->
        <template v-else-if="message.type === 'voice'">
          <div
            v-if="blobUrl"
            class="flex w-full min-w-0 max-w-full flex-col gap-2 select-none text-zinc-200"
          >
            <audio
              ref="audioEl"
              :src="blobUrl"
              preload="metadata"
              class="hidden"
              @timeupdate="onTimeUpdate"
              @ended="onEnded"
              @loadedmetadata="onLoadedMetadata"
              @durationchange="onDurationChange"
            />
            <div class="flex items-center gap-3">
              <button
                type="button"
                @click="togglePlay"
                class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
                :aria-label="playing ? 'Pause' : 'Play'"
              >
                <Play v-if="!playing" class="h-3.5 w-3.5 ml-0.5 fill-current" :stroke-width="1.8" />
                <Pause v-else class="h-3.5 w-3.5 fill-current" :stroke-width="1.8" />
              </button>
              <div class="flex h-8 flex-1 cursor-pointer items-center gap-0.5" @click="seek">
                <div
                  v-for="(bar, idx) in waveformBars"
                  :key="idx"
                  class="flex-1 rounded-full transition-colors duration-75"
                  :class="
                    (idx / waveformBars.length) * 100 <= progress ? 'bg-zinc-200' : 'bg-zinc-800'
                  "
                  :style="{ height: bar + '%' }"
                />
              </div>
            </div>
            <div class="flex justify-between px-1 text-[10px] font-mono tabular-nums text-zinc-500">
              <span>{{ formatDuration(currentSecs) }}</span>
              <span>{{ formatDuration(totalSecs) }}</span>
            </div>
          </div>

          <div v-else class="flex flex-col gap-1 text-zinc-400">
            <button
              type="button"
              @click="emit('download', message)"
              class="inline-flex items-center gap-1.5 px-1 py-1 text-xs transition-colors hover:text-white disabled:opacity-50 cursor-pointer"
              :disabled="isMediaBusy"
            >
              <Mic class="h-3.5 w-3.5 shrink-0" :stroke-width="1.8" />
              <span>{{ isMediaBusy ? "Decrypting…" : "Play voice note" }}</span>
            </button>
          </div>
        </template>

        <!-- ── Media attachment ── -->
        <template v-else-if="isMediaMessage(message)">
          <div class="space-y-2 min-w-0">
            <!-- In-bubble preview only when not shown outside (decrypting / non-visual) -->
            <div
              v-if="!showExternalMediaPreview && isImage(mediaMime) && blobUrl"
              class="max-w-full overflow-hidden rounded-xl border border-zinc-800 bg-black/40"
            >
              <img
                :src="blobUrl"
                :alt="getFileLabel(message)"
                class="block max-h-64 max-w-full w-full object-contain cursor-zoom-in hover:scale-[1.01] transition-transform"
                @click="openLightbox"
                @load="emit('image-load')"
              />
            </div>
            <div
              v-else-if="!showExternalMediaPreview && isVideo(mediaMime) && blobUrl"
              class="max-w-full overflow-hidden rounded-xl border border-zinc-800 bg-black/40"
            >
              <video :src="blobUrl" controls class="max-h-64 max-w-full w-full" />
            </div>
            <div v-else-if="isAudio(mediaMime) && blobUrl">
              <audio
                ref="audioEl"
                :src="blobUrl"
                preload="metadata"
                class="hidden"
                @timeupdate="onTimeUpdate"
                @ended="onEnded"
                @loadedmetadata="onLoadedMetadata"
                @durationchange="onDurationChange"
              />
              <div class="flex flex-col gap-2 select-none text-zinc-200">
                <div class="flex items-center gap-2.5">
                  <button
                    type="button"
                    @click="togglePlay"
                    class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
                    :aria-label="playing ? 'Pause' : 'Play'"
                  >
                    <Play
                      v-if="!playing"
                      class="h-3.5 w-3.5 ml-0.5 fill-current"
                      :stroke-width="1.8"
                    />
                    <Pause v-else class="h-3.5 w-3.5 fill-current" :stroke-width="1.8" />
                  </button>

                  <div
                    ref="waveformRef"
                    class="group/wave relative flex h-8 flex-1 cursor-pointer items-center gap-0.5 py-1"
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
                      class="flex-1 rounded-full transition-all duration-75"
                      :class="[
                        (idx / waveformBars.length) * 100 <= progress
                          ? 'bg-zinc-200'
                          : hoverProgress !== null &&
                              (idx / waveformBars.length) * 100 <= hoverProgress
                            ? 'bg-zinc-400'
                            : 'bg-zinc-800 group-hover/wave:bg-zinc-700',
                      ]"
                      :style="{ height: bar + '%' }"
                    />
                  </div>

                  <button
                    type="button"
                    @click.stop="cyclePlaybackSpeed"
                    class="inline-flex h-6 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 px-2 text-[10px] font-mono text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 tabular-nums select-none shrink-0 cursor-pointer"
                    :title="`Playback speed: ${playbackSpeed}x`"
                  >
                    {{ playbackSpeed }}x
                  </button>
                </div>
                <div
                  class="flex justify-between px-1 text-[10px] font-mono tabular-nums text-zinc-500"
                >
                  <span>{{ formatDuration(currentSecs) }}</span>
                  <span>{{ formatDuration(totalSecs) }}</span>
                </div>
              </div>
            </div>

            <!-- File meta + download — one inline row: name · format · action -->
            <div
              class="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1 py-1 text-[11px] font-mono text-zinc-400"
            >
              <span class="min-w-0 break-words whitespace-normal text-zinc-200 leading-snug">
                {{ fileBaseName }}
              </span>
              <template v-if="fileExtension">
                <span class="opacity-40 shrink-0" aria-hidden="true">·</span>
                <span class="uppercase tracking-wide shrink-0">{{ fileExtension }}</span>
              </template>
              <span class="opacity-40 shrink-0" aria-hidden="true">·</span>
              <button
                type="button"
                @click="emit('download', message)"
                class="inline-flex items-center gap-1 shrink-0 transition-colors hover:text-white disabled:opacity-50 cursor-pointer"
                :disabled="isMediaBusy"
              >
                <Download class="h-3.5 w-3.5" :stroke-width="1.8" />
                {{ isMediaBusy ? "Decrypting…" : blobUrl ? "Download" : "Decrypt" }}
              </button>
              <button
                v-if="hasFailed"
                type="button"
                @click="emit('retry', message)"
                class="inline-flex items-center gap-1 shrink-0 text-red-400 hover:opacity-80 cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        </template>

        <template v-else />

        <!-- Reactions list -->
        <div
          v-if="message.reactions?.length"
          class="absolute -bottom-2.5 flex items-center gap-1 border border-zinc-800 bg-zinc-950 rounded-full px-2 py-0.5 shadow-sm z-10 text-zinc-300 font-mono text-[11px]"
          :class="mine ? 'left-2' : 'right-2'"
        >
          <span
            v-for="r in message.reactions"
            :key="r.emoji"
            class="text-[12px] leading-none"
            :title="`${r.count} reaction${r.count > 1 ? 's' : ''}`"
          >
            {{ r.emoji
            }}<span v-if="r.count > 1" class="text-[10px] ml-0.5 text-zinc-400">{{ r.count }}</span>
          </span>
        </div>
      </div>

      <MediaDecryptStatus
        v-if="showDecryptStatus"
        :progress="mediaProgress"
        compact
        class="mt-1.5 w-full max-w-sm"
      />

      <!-- Timestamp + Status -->
      <div
        class="message-meta flex items-center gap-1.5 mt-1 px-1"
        :class="[
          mine ? 'justify-end' : 'justify-start',
          mine ? 'opacity-80' : 'opacity-0 group-hover/bubble:opacity-100',
        ]"
      >
        <p class="text-[10px] font-mono text-zinc-500 select-none tabular-nums">
          {{ formatTime(message.ts) }}
        </p>

        <!-- Glowing dot in send queue -->
        <span
          v-if="mine && message.status === 'pending'"
          class="relative flex h-2 w-2 items-center justify-center"
          title="In send queue"
        >
          <span
            class="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-zinc-400 opacity-75"
          />
          <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-white shadow-xs" />
        </span>

        <!-- Double tick when everyone has seen, or delivered -->
        <span
          v-else-if="mine && (hasFullRead || message.status === 'delivered')"
          class="text-sky-400"
          :title="seenTickTitle"
        >
          <CheckCheck class="h-3 w-3" :stroke-width="2.2" />
        </span>

        <!-- Grey double tick when some group members have seen -->
        <span v-else-if="mine && hasPartialRead" class="text-zinc-500" :title="seenTickTitle">
          <CheckCheck class="h-3 w-3" :stroke-width="2.2" />
        </span>

        <!-- Single tick when sent to relays -->
        <span
          v-else-if="mine && message.status === 'sent'"
          class="text-zinc-500"
          title="Sent to relays"
        >
          <Check class="h-3 w-3" :stroke-width="2.2" />
        </span>

        <!-- Alert icon when failed -->
        <span
          v-else-if="mine && message.status === 'failed'"
          class="text-red-400"
          title="Failed to send"
        >
          <AlertCircle class="h-3 w-3" :stroke-width="2" />
        </span>
      </div>
      <p
        v-if="!mine && isGroupMessage && seenByCaption"
        class="text-[10px] font-mono text-zinc-500 mt-0.5 px-1 max-w-full truncate"
        :title="seenByCaption"
      >
        {{ seenByCaption }}
      </p>
    </div>
  </div>

  <!-- Message Info Teleport Modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showMessageInfo"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
        @click.self="closeMessageInfo"
      >
        <div
          class="border border-zinc-800 bg-zinc-950 text-zinc-100 w-full max-w-sm rounded-xl p-5 space-y-4 shadow-2xl"
          role="dialog"
          @click.stop
        >
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-medium tracking-tight text-white">Message Info</h3>
            <button
              type="button"
              @click="closeMessageInfo"
              class="inline-flex items-center justify-center border border-zinc-800 bg-zinc-900 text-zinc-400 p-1.5 rounded-lg hover:border-zinc-700 hover:text-white transition-colors cursor-pointer"
            >
              <X class="w-4 h-4" :stroke-width="1.8" />
            </button>
          </div>

          <div class="flex justify-center gap-2 py-1">
            <button
              v-for="e in REACT_EMOJIS"
              :key="e"
              type="button"
              @click="
                react(e);
                closeMessageInfo();
              "
              class="text-xl px-1 hover:scale-125 transition-transform cursor-pointer"
            >
              {{ e }}
            </button>
          </div>

          <div class="space-y-3 text-xs">
            <p v-if="isGroupMessage" class="text-zinc-400 leading-relaxed">
              Group messages are delivered as NIP-59 private gift-wrapped envelopes directly to
              members' inboxes.
            </p>

            <div>
              <p class="text-zinc-400 mb-1 font-mono text-[11px] uppercase tracking-wider">
                {{ isGroupMessage ? "Message ID" : "Event ID" }}
              </p>
              <button
                type="button"
                @click="copyEventId"
                class="text-zinc-200 w-full flex items-start gap-2 text-left font-mono text-[11px] break-all rounded-lg px-2.5 py-1.5 border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-700 transition-colors cursor-pointer"
              >
                <span class="flex-1 min-w-0">{{ eventId }}</span>
                <Copy
                  v-if="!idCopied"
                  class="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-500"
                  :stroke-width="1.8"
                />
                <Check
                  v-else
                  class="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400"
                  :stroke-width="2"
                />
              </button>
            </div>

            <div>
              <p class="text-zinc-400 mb-1 font-mono text-[11px] uppercase tracking-wider">
                Status
              </p>
              <p :class="statusColorClass" class="font-medium">{{ statusLabel }}</p>
            </div>

            <div v-if="isGroupMessage && (readByNames.length || unreadByNames.length)">
              <p class="text-zinc-400 mb-1 font-mono text-[11px] uppercase tracking-wider">
                Seen by
              </p>
              <p class="text-zinc-200">
                {{ readByNames.length ? readByNames.join(", ") : "Nobody yet" }}
              </p>
              <p v-if="unreadByNames.length" class="text-zinc-500 mt-1">
                Waiting on {{ unreadByNames.join(", ") }}
              </p>
            </div>

            <div>
              <p class="text-zinc-400 mb-1 font-mono text-[11px] uppercase tracking-wider">
                Timestamp
              </p>
              <p class="text-zinc-200 font-mono text-[11px]">{{ fullTimestamp }}</p>
            </div>
          </div>

          <div class="flex flex-col gap-2 pt-1">
            <button
              v-if="copyableMessageText"
              type="button"
              @click="copyMessageText"
              class="border border-zinc-800 bg-zinc-900 text-zinc-200 w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
            >
              <Copy v-if="!textCopied" class="w-3.5 h-3.5" :stroke-width="1.8" />
              <Check v-else class="w-3.5 h-3.5 text-emerald-400" :stroke-width="2" />
              {{ textCopied ? "Copied!" : "Copy message text" }}
            </button>

            <a
              v-if="njumpUrl"
              :href="njumpUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 font-medium hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <ExternalLink class="w-3.5 h-3.5" :stroke-width="1.8" />
              Inspect on njump
            </a>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Lightbox Teleport Modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="lightboxOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
        @click.self="closeLightbox"
      >
        <button
          type="button"
          @click="closeLightbox"
          class="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          aria-label="Close"
        >
          <X class="w-5 h-5" :stroke-width="2" />
        </button>

        <div
          class="w-full h-full flex items-center justify-center overflow-hidden touch-none select-none"
          @touchstart="lbTouchStart"
          @touchmove.prevent="lbTouchMove"
          @touchend="lbTouchEnd"
          @click="lbHandleClick"
        >
          <img
            :src="blobUrl"
            :alt="getFileLabel(message)"
            class="max-h-full max-w-[100vw] object-contain pointer-events-none sm:max-w-full"
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
