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

const emit = defineEmits(["download", "retry", "reply", "react", "edit"]);

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

// Safely linkify plain text – escapes HTML then wraps URLs in <a> tags.
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
    :class="[mine ? 'flex-row-reverse' : 'flex-row', isConsecutive ? 'mt-1' : 'mt-4']"
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
    <!-- Spacer to align consecutive messages with previous avatar -->
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
            @click="showReactionPicker = !showReactionPicker"
            class="inline-flex items-center justify-center border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) p-1.5 rounded-xl shadow-sm transition hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-yellow-300"
            title="React"
          >
            <Smile class="w-3.5 h-3.5" :stroke-width="2.2" aria-hidden="true" />
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
              class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] absolute bottom-full mb-1.5 flex gap-0.5 rounded-2xl px-2 py-1.5 shadow-xl z-20"
              :class="mine ? 'right-0' : 'left-0'"
            >
              <button
                v-for="e in REACT_EMOJIS"
                :key="e"
                @click="react(e)"
                class="text-base px-0.5 hover:scale-125 transition-transform duration-100 active:scale-110"
                :title="e"
              >
                {{ e }}
              </button>
            </div>
          </Transition>
        </div>
        <!-- Edit (own text messages only) -->
        <button
          v-if="mine && message.type === 'text'"
          @click="emit('edit', message)"
          class="inline-flex items-center justify-center border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) p-1.5 rounded-xl shadow-sm transition hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          title="Edit message"
        >
          <Pencil class="w-3.5 h-3.5" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <button
          @click="emit('reply', message)"
          class="inline-flex items-center justify-center border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) p-1.5 rounded-xl shadow-sm transition hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-primary)"
          title="Reply"
        >
          <Reply class="w-3.5 h-3.5" :stroke-width="2.2" aria-hidden="true" />
        </button>
      </div>

      <!-- Bubble -->
      <div
        class="relative min-w-0 max-w-full overflow-wrap-anywhere break-words rounded-[20px] px-4 py-3 text-sm transition-all duration-150"
        :class="
          mine
            ? 'rounded-br-md border border-[color-mix(in_srgb,var(--app-primary)_46%,transparent)] text-white shadow-[0_16px_48px_color-mix(in_srgb,var(--app-primary)_18%,transparent)]'
            : isMentioned
              ? `border border-(--app-border) bg-(--bubble-them-bg) text-(--bubble-them-text) shadow-[0_14px_42px_rgba(0,0,0,0.14)] bg-amber-500/10 rounded-bl-md border border-amber-500/30 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]${mentionPulseActive ? ' animate-pulse' : ''}`
              : 'rounded-bl-md border border-(--app-border) bg-(--bubble-them-bg) text-(--bubble-them-text) shadow-[0_14px_42px_rgba(0,0,0,0.14)]'
        "
        :style="mine ? { backgroundImage: 'var(--bubble-mine-bg)' } : undefined"
        @contextmenu.prevent="openMessageInfo"
      >
        <!-- Replied-to Snippet -->
        <div
          v-if="message.replyTo"
          class="mb-2 rounded-xl border-l-2 border-white/30 bg-white/10 px-2.5 py-2 opacity-85"
        >
          <p class="text-[10px] font-semibold mb-0.5">Replied to message</p>
          <p class="text-xs truncate max-w-50">{{ message.replyExcerpt || "Audio/Media" }}</p>
        </div>
        <!-- Sender name (groups) -->
        <p
          v-if="showSenderName && !mine"
          class="text-[10px] font-semibold text-zinc-400 mb-1.5 tracking-wide"
        >
          {{ senderName }}
        </p>

        <!-- ── Text ── -->
        <template v-if="message.type === 'text'">
          <template v-if="talkyUrl">
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-1.5 opacity-60">
                <Video class="w-3 h-3 shrink-0" :stroke-width="2" aria-hidden="true" />
                <span class="text-[10px] font-semibold uppercase tracking-wide">Video Meeting</span>
              </div>
              <a
                :href="talkyUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex max-w-full items-center gap-2 whitespace-normal break-all rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95"
                :class="
                  mine
                    ? 'bg-white/20 hover:bg-white/30 text-white'
                    : 'bg-(--app-success-soft) hover:bg-emerald-500/20 text-emerald-300'
                "
              >
                <Video class="w-3.5 h-3.5 shrink-0" :stroke-width="2" aria-hidden="true" />
                Join Meeting
              </a>
            </div>
          </template>
          <template v-else>
            <p
              class="min-w-0 max-w-full overflow-wrap-anywhere break-words leading-relaxed"
              v-html="linkifyText"
            ></p>
            <span v-if="message.editedAt" class="text-[10px] opacity-40 select-none">
              · edited</span
            >
          </template>
        </template>

        <!-- ── Voice note ── -->
        <template v-else-if="message.type === 'voice'">
          <!-- Decrypted: player -->
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
                @click="togglePlay"
                class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90"
                :class="mine ? 'bg-white/20 hover:bg-white/30' : 'bg-white/10 hover:bg-white/18'"
                :aria-label="playing ? 'Pause' : 'Play'"
              >
                <Play v-if="!playing" class="w-4 h-4 ml-0.5" :stroke-width="2" aria-hidden="true" />
                <Pause v-else class="w-4 h-4" :stroke-width="2" aria-hidden="true" />
              </button>
              <!-- Waveform -->
              <div class="flex-1 flex items-center gap-0.5 h-8 cursor-pointer" @click="seek">
                <div
                  v-for="(bar, idx) in waveformBars"
                  :key="idx"
                  class="flex-1 rounded-full transition-colors duration-75"
                  :class="
                    (idx / waveformBars.length) * 100 <= progress
                      ? mine
                        ? 'bg-white'
                        : 'bg-[#0095f6]'
                      : mine
                        ? 'bg-white/25'
                        : 'bg-white/15'
                  "
                  :style="{ height: bar + '%' }"
                />
              </div>
            </div>
            <div
              class="flex justify-between px-0.5 text-[10px] font-mono tabular-nums"
              :class="mine ? 'text-white/50' : 'text-white/40'"
            >
              <span>{{ formatDuration(currentSecs) }}</span>
              <span>{{ formatDuration(totalSecs) }}</span>
            </div>
          </div>

          <!-- Not yet loaded -->
          <div v-else class="w-full min-w-0 max-w-full space-y-2">
            <button
              @click="emit('download', message)"
              class="flex items-center gap-2.5 text-xs px-3.5 py-2 rounded-xl transition-all duration-150 active:scale-95"
              :class="mine ? 'bg-white/15 hover:bg-white/22' : 'bg-white/7 hover:bg-white/12'"
              :disabled="isMediaBusy"
            >
              <Mic class="w-3.5 h-3.5 shrink-0" :stroke-width="1.8" aria-hidden="true" />
              <span>{{ isMediaBusy ? "Decrypting…" : "Play voice note" }}</span>
            </button>
          </div>
        </template>

        <!-- ── File / media attachment ── -->
        <template v-else-if="isMediaMessage(message)">
          <div class="space-y-2 min-w-0">
            <!-- Image -->
            <div v-if="isImage(mediaMime) && blobUrl" class="max-w-full overflow-hidden rounded-xl">
              <img
                :src="blobUrl"
                :alt="getFileLabel(message)"
                class="block max-h-64 max-w-full w-full object-contain bg-black/20 cursor-zoom-in sm:hover:scale-[1.02] sm:transition-transform sm:duration-200"
                @click="openLightbox"
              />
            </div>
            <!-- Video -->
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
            <!-- Audio (non-voice) -->
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
                    @click="togglePlay"
                    class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90"
                    :class="
                      mine ? 'bg-white/20 hover:bg-white/30' : 'bg-white/10 hover:bg-white/18'
                    "
                    :aria-label="playing ? 'Pause' : 'Play'"
                  >
                    <Play
                      v-if="!playing"
                      class="w-4 h-4 ml-0.5"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                    <Pause v-else class="w-4 h-4" :stroke-width="2" aria-hidden="true" />
                  </button>
                  <!-- Waveform -->
                  <div class="flex-1 flex items-center gap-0.5 h-8 cursor-pointer" @click="seek">
                    <div
                      v-for="(bar, idx) in waveformBars"
                      :key="idx"
                      class="flex-1 rounded-full transition-colors duration-75"
                      :class="
                        (idx / waveformBars.length) * 100 <= progress
                          ? mine
                            ? 'bg-white'
                            : 'bg-[#0095f6]'
                          : mine
                            ? 'bg-white/25'
                            : 'bg-white/15'
                      "
                      :style="{ height: bar + '%' }"
                    />
                  </div>
                </div>
                <div
                  class="flex justify-between px-0.5 text-[10px] font-mono tabular-nums"
                  :class="mine ? 'text-white/50' : 'text-white/40'"
                >
                  <span>{{ formatDuration(currentSecs) }}</span>
                  <span>{{ formatDuration(totalSecs) }}</span>
                </div>
              </div>
            </div>

            <!-- File info row -->
            <div
              class="rounded-xl px-3 py-2.5 space-y-0.5"
              :class="mine ? 'bg-white/10' : 'bg-white/5'"
            >
              <p class="text-xs font-semibold truncate">{{ getFileLabel(message) }}</p>
              <p class="text-[10px] opacity-50 truncate">
                {{ mediaMime || "application/octet-stream" }}
              </p>
            </div>

            <!-- Action row -->
            <div class="space-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  @click="emit('download', message)"
                  class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all duration-150 active:scale-95"
                  :class="mine ? 'bg-white/15 hover:bg-white/22' : 'bg-white/7 hover:bg-white/12'"
                  :disabled="isMediaBusy"
                >
                  <Download class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
                  {{ isMediaBusy ? "Decrypting…" : blobUrl ? "Download" : "Decrypt" }}
                </button>
                <template v-if="hasFailed">
                  <button
                    @click="emit('retry', message)"
                    class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all duration-150 active:scale-95 text-red-400 bg-red-400/10 hover:bg-red-400/20"
                  >
                    Retry
                  </button>
                  <span class="text-[10px] opacity-50 text-red-400">Failed</span>
                </template>
              </div>
            </div>
          </div>
        </template>

        <!-- ── Unknown / unsupported type ── -->
        <template v-else>
          <div class="italic text-[11px] opacity-50">Unsupported message type</div>
        </template>

        <!-- Reactions -->
        <div
          v-if="message.reactions?.length"
          class="absolute -bottom-3 flex items-center gap-0.5 border border-(--app-border) bg-(--app-surface) rounded-full px-1.5 py-0.5 shadow-sm z-10"
          :class="mine ? 'left-2' : 'right-2'"
        >
          <span
            v-for="r in message.reactions"
            :key="r.emoji"
            class="text-[13px] leading-none"
            :title="`${r.count} reaction${r.count > 1 ? 's' : ''}`"
            >{{ r.emoji }}{{ r.count > 1 ? r.count : "" }}</span
          >
        </div>
      </div>

      <MediaDecryptStatus
        v-if="showDecryptStatus"
        :progress="mediaProgress"
        compact
        class="mt-1.5 w-full max-w-sm"
      />

      <!-- Timestamp + delivery status -->
      <div
        class="message-meta flex items-center gap-1 mt-0.5 px-1 transition-opacity duration-200"
        :class="[
          mine ? 'justify-end' : 'justify-start',
          mine ? 'opacity-80' : 'opacity-0 group-hover/bubble:opacity-100',
        ]"
      >
        <p class="text-[10px] text-zinc-500 select-none">{{ formatTime(message.ts) }}</p>
        <span
          v-if="mine && message.status === 'pending'"
          class="message-status message-status-pending text-zinc-400"
          title="Sending…"
        >
          <Clock class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
        </span>

        <span
          v-else-if="mine && message.status === 'sent' && message.readByPeer"
          class="message-status message-status-read text-sky-400/90"
          title="Read"
        >
          <CheckCheck class="h-3 w-3" :stroke-width="2.5" aria-hidden="true" />
        </span>

        <span
          v-else-if="mine && message.status === 'sent'"
          class="message-status message-status-sent text-emerald-400/80"
          title="Sent"
        >
          <Check class="h-3 w-3" :stroke-width="2.5" aria-hidden="true" />
        </span>

        <span
          v-else-if="mine && message.status === 'failed'"
          class="message-status message-status-failed text-red-400/90"
          title="Failed to send"
        >
          <AlertCircle class="h-3 w-3" :stroke-width="2.25" aria-hidden="true" />
        </span>
      </div>
    </div>
  </div>

  <!-- ── Message info panel ───────────────────────────────────────────── -->
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
        class="fixed inset-0 z-9998 flex items-end sm:items-center justify-center p-4 bg-black/60"
        @click.self="closeMessageInfo"
      >
        <div
          class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] w-full max-w-sm rounded-2xl p-4 space-y-4 shadow-xl"
          role="dialog"
          aria-labelledby="message-info-title"
          @click.stop
        >
          <div class="flex items-center justify-between gap-3">
            <h3 id="message-info-title" class="text-(--app-text) text-sm font-semibold">
              Message info
            </h3>
            <button
              @click="closeMessageInfo"
              class="inline-flex items-center justify-center border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) p-1.5 rounded-xl shrink-0 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
              aria-label="Close"
            >
              <X class="w-4 h-4" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>

          <div class="flex justify-center gap-2 py-2">
            <button
              v-for="e in REACT_EMOJIS"
              :key="e"
              @click="
                react(e);
                closeMessageInfo();
              "
              class="text-2xl px-1 hover:scale-125 transition-transform duration-100 active:scale-110"
              :title="e"
            >
              {{ e }}
            </button>
          </div>

          <div class="space-y-3 text-xs">
            <p v-if="isGroupMessage" class="text-zinc-500 leading-relaxed">
              Group messages are real, but they travel as private gift-wrapped envelopes to each
              member's inbox — not as public relay posts. They won't show up on njump or other
              public explorers.
            </p>

            <div>
              <p class="text-zinc-500 mb-1">{{ isGroupMessage ? "Message ID" : "Event ID" }}</p>
              <button
                type="button"
                @click="copyEventId"
                class="text-(--app-text-soft) w-full flex items-start gap-2 text-left font-mono text-[11px] break-all transition-colors rounded-lg px-2 py-1.5 -mx-2 hover:text-(--app-text) hover:bg-(--app-surface-hover)"
                :title="idCopied ? 'Copied!' : 'Tap to copy'"
              >
                <span class="flex-1 min-w-0">{{ eventId }}</span>
                <Copy
                  v-if="!idCopied"
                  class="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-50"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <Check
                  v-else
                  class="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400"
                  :stroke-width="2.5"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div v-if="showEnvelopeId">
              <p class="text-zinc-500 mb-1">Private envelope ID</p>
              <p class="text-(--app-text-soft) font-mono text-[11px] break-all">{{ envelopeId }}</p>
              <p class="text-zinc-600 mt-1 leading-relaxed">
                NIP-59 gift-wrap on your relays. Member-only — not publicly indexed.
              </p>
            </div>

            <div>
              <p class="text-zinc-500 mb-1">Status</p>
              <p class="text-(--app-text-soft)" :class="statusColorClass">{{ statusLabel }}</p>
              <p v-if="message.error" class="text-red-400/80 mt-1 break-words">
                {{ message.error }}
              </p>
            </div>

            <div>
              <p class="text-zinc-500 mb-1">Timestamp</p>
              <p class="text-(--app-text-soft)">{{ fullTimestamp }}</p>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <button
              v-if="copyableMessageText"
              type="button"
              @click="copyMessageText"
              class="bg-(--app-surface-soft) text-(--app-text-soft) w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2.5 rounded-xl transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            >
              <Copy v-if="!textCopied" class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
              <Check
                v-else
                class="w-3.5 h-3.5 text-emerald-400"
                :stroke-width="2.5"
                aria-hidden="true"
              />
              {{ textCopied ? "Copied!" : "Copy message text" }}
            </button>

            <a
              v-if="njumpUrl"
              :href="njumpUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2.5 rounded-xl bg-(--app-primary-soft) hover:bg-(--app-primary)/20 text-(--app-primary) transition-colors"
            >
              <ExternalLink class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
              Inspect on njump
            </a>

            <button
              type="button"
              @click="copyRaw"
              class="bg-(--app-surface-soft) text-(--app-text-soft) w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2.5 rounded-xl transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            >
              <Copy v-if="!debugCopied" class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
              <Check
                v-else
                class="w-3.5 h-3.5 text-emerald-400"
                :stroke-width="2.5"
                aria-hidden="true"
              />
              {{ debugCopied ? "Copied!" : "Copy debug JSON" }}
            </button>
          </div>

          <p class="text-[10px] text-zinc-600 text-center">Long-press or right-click any message</p>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Lightbox overlay ──────────────────────────────────────────────── -->
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
        class="fixed inset-0 z-9999 flex items-center justify-center bg-black/95"
        @click.self="closeLightbox"
      >
        <button
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
