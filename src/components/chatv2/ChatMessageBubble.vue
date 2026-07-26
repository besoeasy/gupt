<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
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
  debugCopied.value = false;
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
    try {
      navigator.vibrate(10);
    } catch {}
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
    emit("reply", props.message);
    try {
      navigator.vibrate(10);
    } catch {}
  }
  swipeX.value = 0;
  swipeTracking = false;
}

const bubbleTransform = computed(() => (swipeX.value ? `translateX(${swipeX.value}px)` : ""));
const bubbleTransition = computed(() => (swipeX.value ? "none" : "transform 0.2s ease-out"));

const showMessageInfo = ref(false);
const idCopied = ref(false);
const debugCopied = ref(false);
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

const showEnvelopeId = computed(
  () => isGroupMessage.value && Boolean(envelopeId.value) && envelopeId.value !== clientMsgId.value,
);

const njumpUrl = computed(() => {
  if (isGroupMessage.value) return "";
  const id = eventId.value;
  if (!NOSTR_EVENT_ID_RE.test(id)) return "";
  return `https://njump.me/${encodeURIComponent(id)}`;
});

const statusLabel = computed(() => {
  const status = props.message?.status;
  if (status === "pending") return "Sending…";
  if (status === "sent") {
    return props.message?.readByPeer ? "Read" : "Sent";
  }
  if (status === "failed") return "Failed to send";
  return props.mine ? "Delivered" : "Received";
});

const statusColorClass = computed(() => {
  const status = props.message?.status;
  if (status === "pending") return "text-zinc-400";
  if (status === "sent") {
    return props.message?.readByPeer ? "text-sky-400" : "text-emerald-400";
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

async function copyRaw() {
  try {
    const source = props.message?.rawPayload || props.message?.payload || props.message;
    await copyToClipboard(JSON.stringify(source, null, 2));
    debugCopied.value = true;
    setTimeout(() => (debugCopied.value = false), 1500);
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
const playing = ref(false);
const progress = ref(0);
const currentSecs = ref(0);

function durationFromMessage() {
  const ms = Number(props.message?.durationMs || 0);
  return ms > 0 ? Math.round(ms / 1000) : 0;
}

const totalSecs = ref(durationFromMessage());

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
  if (!el) return;
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

function seek(e) {
  const el = audioEl.value;
  const duration = playbackDuration(el);
  if (!el || !duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  el.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
}

function onLoadedMetadata() {
  syncTotalDuration(audioEl.value);
}

function onDurationChange() {
  syncTotalDuration(audioEl.value);
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
      class="w-8 h-8 rounded-2xl shrink-0 mt-1 object-cover opacity-95 transition-transform duration-200 hover:scale-105 cursor-pointer"
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
        class="absolute top-0 flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity duration-200 z-10 pt-1"
        :class="mine ? 'right-full mr-2' : 'left-full ml-2'"
      >
        <!-- Reaction picker trigger -->
        <div class="relative">
          <button
            type="button"
            @click="showReactionPicker = !showReactionPicker"
            class="inline-flex items-center justify-center border border-(--app-border) bg-(--app-surface) text-(--app-text-soft) p-1.5 rounded-xl shadow-sm transition hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-yellow-400"
            title="React"
          >
            <Smile class="w-3.5 h-3.5" :stroke-width="2.2" />
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
              class="border border-(--app-border) bg-(--app-surface) shadow-lg absolute bottom-full mb-1.5 flex gap-0.5 rounded-2xl px-2 py-1.5 z-20"
              :class="mine ? 'right-0' : 'left-0'"
            >
              <button
                v-for="e in REACT_EMOJIS"
                :key="e"
                type="button"
                @click="react(e)"
                class="text-base px-0.5 hover:scale-125 transition-transform duration-100 active:scale-110"
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
          class="inline-flex items-center justify-center border border-(--app-border) bg-(--app-surface) text-(--app-text-soft) p-1.5 rounded-xl shadow-sm transition hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          title="Edit message"
        >
          <Pencil class="w-3.5 h-3.5" :stroke-width="2.2" />
        </button>
        <button
          type="button"
          @click="emit('reply', message)"
          class="inline-flex items-center justify-center border border-(--app-border) bg-(--app-surface) text-(--app-text-soft) p-1.5 rounded-xl shadow-sm transition hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-primary)"
          title="Reply"
        >
          <Reply class="w-3.5 h-3.5" :stroke-width="2.2" />
        </button>
        <button
          v-if="copyableMessageText"
          type="button"
          @click="copyMessageTextFromHover"
          class="inline-flex items-center justify-center border border-(--app-border) bg-(--app-surface) text-(--app-text-soft) p-1.5 rounded-xl shadow-sm transition hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          :title="hoverCopied ? 'Copied!' : 'Copy text'"
        >
          <Check v-if="hoverCopied" class="w-3.5 h-3.5 text-emerald-400" :stroke-width="2.5" />
          <Copy v-else class="w-3.5 h-3.5" :stroke-width="2.2" />
        </button>
      </div>

      <!-- Bubble (SOLID FLAT DESIGN - NO GRADIENTS / NO BLUR) -->
      <div
        class="relative min-w-0 max-w-full overflow-wrap-anywhere break-words rounded-[20px] px-4 py-3 text-sm transition-all duration-150"
        :class="
          mine
            ? 'rounded-br-md bg-(--app-primary) text-white font-medium'
            : isMentioned
              ? `bg-amber-500/20 text-(--app-text) rounded-bl-md border border-amber-500/40${mentionPulseActive ? ' animate-pulse' : ''}`
              : 'rounded-bl-md border border-(--app-border) bg-(--app-surface-soft) text-(--app-text)'
        "
        @contextmenu.prevent="openMessageInfo"
      >
        <!-- Replied-to Snippet -->
        <div
          v-if="message.replyTo"
          class="mb-2 rounded-xl border-l-2 border-current/40 bg-black/10 px-2.5 py-1.5"
        >
          <p class="text-[10px] font-bold mb-0.5 opacity-80">Replied to message</p>
          <p class="text-xs truncate max-w-50 opacity-90">
            {{ message.replyExcerpt || "Audio/Media" }}
          </p>
        </div>

        <!-- Sender name (groups) -->
        <p
          v-if="showSenderName && !mine"
          class="text-[10px] font-semibold text-(--app-muted) mb-1 tracking-wide"
        >
          {{ senderName }}
        </p>

        <!-- ── Text ── -->
        <template v-if="message.type === 'text'">
          <template v-if="talkyUrl">
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-1.5 opacity-75">
                <Video class="w-3 h-3 shrink-0" :stroke-width="2" />
                <span class="text-[10px] font-semibold uppercase tracking-wide">Video Meeting</span>
              </div>
              <a
                :href="talkyUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex max-w-full items-center gap-2 whitespace-normal break-all rounded-xl px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 bg-black/15 hover:bg-black/25 text-current"
              >
                <Video class="w-3.5 h-3.5 shrink-0" :stroke-width="2" />
                Join Meeting
              </a>
            </div>
          </template>
          <template v-else>
            <p
              class="min-w-0 max-w-full overflow-wrap-anywhere break-words leading-relaxed"
              v-html="linkifyText"
            ></p>
            <span v-if="message.editedAt" class="text-[10px] opacity-60 select-none">
              · edited</span
            >
          </template>
        </template>

        <!-- ── Voice note ── -->
        <template v-else-if="message.type === 'voice'">
          <div v-if="blobUrl" class="flex w-full min-w-0 max-w-full flex-col gap-2 select-none">
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
                class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 bg-black/15 hover:bg-black/25 text-current"
                :aria-label="playing ? 'Pause' : 'Play'"
              >
                <Play v-if="!playing" class="w-4 h-4 ml-0.5" :stroke-width="2" />
                <Pause v-else class="w-4 h-4" :stroke-width="2" />
              </button>
              <div class="flex-1 flex items-center gap-0.5 h-8 cursor-pointer" @click="seek">
                <div
                  v-for="(bar, idx) in waveformBars"
                  :key="idx"
                  class="flex-1 rounded-full transition-colors duration-75"
                  :class="
                    (idx / waveformBars.length) * 100 <= progress
                      ? 'bg-current'
                      : 'opacity-30 bg-current'
                  "
                  :style="{ height: bar + '%' }"
                />
              </div>
            </div>
            <div class="flex justify-between px-0.5 text-[10px] font-mono tabular-nums opacity-75">
              <span>{{ formatDuration(currentSecs) }}</span>
              <span>{{ formatDuration(totalSecs) }}</span>
            </div>
          </div>

          <div v-else class="w-full min-w-0 max-w-full space-y-2">
            <button
              type="button"
              @click="emit('download', message)"
              class="flex items-center gap-2.5 text-xs px-3.5 py-2 rounded-xl transition-all active:scale-95 bg-black/10 hover:bg-black/20 text-current"
              :disabled="isMediaBusy"
            >
              <Mic class="w-3.5 h-3.5 shrink-0" :stroke-width="1.8" />
              <span>{{ isMediaBusy ? "Decrypting…" : "Play voice note" }}</span>
            </button>
          </div>
        </template>

        <!-- ── Media attachment ── -->
        <template v-else-if="isMediaMessage(message)">
          <div class="space-y-2 min-w-0">
            <div v-if="isImage(mediaMime) && blobUrl" class="max-w-full overflow-hidden rounded-xl">
              <img
                :src="blobUrl"
                :alt="getFileLabel(message)"
                class="block max-h-64 max-w-full w-full object-contain bg-black/20 cursor-zoom-in hover:scale-[1.01] transition-transform"
                @click="openLightbox"
                @load="emit('image-load')"
              />
            </div>
            <div
              v-else-if="isVideo(mediaMime) && blobUrl"
              class="max-w-full overflow-hidden rounded-xl"
            >
              <video
                :src="blobUrl"
                controls
                class="max-h-64 max-w-full w-full bg-black/40 rounded-xl"
              />
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
              <div class="flex flex-col gap-2 select-none">
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    @click="togglePlay"
                    class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 bg-black/15 hover:bg-black/25 text-current"
                    :aria-label="playing ? 'Pause' : 'Play'"
                  >
                    <Play v-if="!playing" class="w-4 h-4 ml-0.5" :stroke-width="2" />
                    <Pause v-else class="w-4 h-4" :stroke-width="2" />
                  </button>
                  <div class="flex-1 flex items-center gap-0.5 h-8 cursor-pointer" @click="seek">
                    <div
                      v-for="(bar, idx) in waveformBars"
                      :key="idx"
                      class="flex-1 rounded-full transition-colors duration-75"
                      :class="
                        (idx / waveformBars.length) * 100 <= progress
                          ? 'bg-current'
                          : 'opacity-30 bg-current'
                      "
                      :style="{ height: bar + '%' }"
                    />
                  </div>
                </div>
                <div
                  class="flex justify-between px-0.5 text-[10px] font-mono tabular-nums opacity-75"
                >
                  <span>{{ formatDuration(currentSecs) }}</span>
                  <span>{{ formatDuration(totalSecs) }}</span>
                </div>
              </div>
            </div>

            <!-- File info row -->
            <div class="rounded-xl px-3 py-2.5 space-y-0.5 bg-black/10">
              <p class="text-xs font-semibold truncate">{{ getFileLabel(message) }}</p>
              <p class="text-[10px] opacity-60 truncate">
                {{ mediaMime || "application/octet-stream" }}
              </p>
            </div>

            <!-- Download action -->
            <div class="space-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  @click="emit('download', message)"
                  class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all active:scale-95 bg-black/15 hover:bg-black/25 text-current"
                  :disabled="isMediaBusy"
                >
                  <Download class="w-3.5 h-3.5" :stroke-width="1.8" />
                  {{ isMediaBusy ? "Decrypting…" : blobUrl ? "Download" : "Decrypt" }}
                </button>
                <template v-if="hasFailed">
                  <button
                    type="button"
                    @click="emit('retry', message)"
                    class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all active:scale-95 text-red-400 bg-red-400/10 hover:bg-red-400/20"
                  >
                    Retry
                  </button>
                </template>
              </div>
            </div>
          </div>
        </template>

        <template v-else />

        <!-- Reactions list -->
        <div
          v-if="message.reactions?.length"
          class="absolute -bottom-3 flex items-center gap-0.5 border border-(--app-border) bg-(--app-surface) rounded-full px-1.5 py-0.5 shadow-sm z-10 text-(--app-text)"
          :class="mine ? 'left-2' : 'right-2'"
        >
          <span
            v-for="r in message.reactions"
            :key="r.emoji"
            class="text-[13px] leading-none"
            :title="`${r.count} reaction${r.count > 1 ? 's' : ''}`"
          >
            {{ r.emoji }}{{ r.count > 1 ? r.count : "" }}
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
        class="message-meta flex items-center gap-1 mt-1 px-1"
        :class="[
          mine ? 'justify-end' : 'justify-start',
          mine ? 'opacity-80' : 'opacity-0 group-hover/bubble:opacity-100',
        ]"
      >
        <p class="text-[10px] text-(--app-muted) select-none">{{ formatTime(message.ts) }}</p>

        <span v-if="mine && message.status === 'pending'" class="text-zinc-400" title="Sending…">
          <Clock class="h-3 w-3" :stroke-width="2" />
        </span>

        <span
          v-else-if="mine && message.status === 'sent' && message.readByPeer"
          class="text-sky-400"
          title="Read"
        >
          <CheckCheck class="h-3 w-3" :stroke-width="2.5" />
        </span>

        <span v-else-if="mine && message.status === 'sent'" class="text-emerald-400" title="Sent">
          <Check class="h-3 w-3" :stroke-width="2.5" />
        </span>

        <span
          v-else-if="mine && message.status === 'failed'"
          class="text-red-400"
          title="Failed to send"
        >
          <AlertCircle class="h-3 w-3" :stroke-width="2.25" />
        </span>
      </div>
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
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
        @click.self="closeMessageInfo"
      >
        <div
          class="border border-(--app-border) bg-(--app-surface) text-(--app-text) w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl"
          role="dialog"
          @click.stop
        >
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-bold">Message Info</h3>
            <button
              type="button"
              @click="closeMessageInfo"
              class="inline-flex items-center justify-center border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) p-1.5 rounded-xl hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            >
              <X class="w-4 h-4" :stroke-width="2" />
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
              class="text-2xl px-1 hover:scale-125 transition-transform"
            >
              {{ e }}
            </button>
          </div>

          <div class="space-y-3 text-xs">
            <p v-if="isGroupMessage" class="text-(--app-muted) leading-relaxed">
              Group messages are delivered as NIP-59 private gift-wrapped envelopes directly to
              members' inboxes.
            </p>

            <div>
              <p class="text-(--app-muted) mb-1 font-medium">
                {{ isGroupMessage ? "Message ID" : "Event ID" }}
              </p>
              <button
                type="button"
                @click="copyEventId"
                class="text-(--app-text) w-full flex items-start gap-2 text-left font-mono text-[11px] break-all rounded-xl px-2.5 py-1.5 bg-(--app-surface-soft) hover:bg-(--app-surface-hover)"
              >
                <span class="flex-1 min-w-0">{{ eventId }}</span>
                <Copy
                  v-if="!idCopied"
                  class="w-3.5 h-3.5 shrink-0 mt-0.5 text-(--app-muted)"
                  :stroke-width="2"
                />
                <Check
                  v-else
                  class="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400"
                  :stroke-width="2.5"
                />
              </button>
            </div>

            <div>
              <p class="text-(--app-muted) mb-1 font-medium">Status</p>
              <p :class="statusColorClass" class="font-semibold">{{ statusLabel }}</p>
            </div>

            <div>
              <p class="text-(--app-muted) mb-1 font-medium">Timestamp</p>
              <p class="text-(--app-text)">{{ fullTimestamp }}</p>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <button
              v-if="copyableMessageText"
              type="button"
              @click="copyMessageText"
              class="bg-(--app-surface-soft) text-(--app-text) w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2.5 rounded-xl hover:bg-(--app-surface-hover)"
            >
              <Copy v-if="!textCopied" class="w-3.5 h-3.5" :stroke-width="2" />
              <Check v-else class="w-3.5 h-3.5 text-emerald-400" :stroke-width="2.5" />
              {{ textCopied ? "Copied!" : "Copy message text" }}
            </button>

            <a
              v-if="njumpUrl"
              :href="njumpUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2.5 rounded-xl bg-(--app-primary-soft) text-(--app-primary) font-semibold hover:bg-(--app-primary)/20"
            >
              <ExternalLink class="w-3.5 h-3.5" :stroke-width="2" />
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
