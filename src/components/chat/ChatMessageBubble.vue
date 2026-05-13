<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import {
  Check,
  Clock,
  Download,
  Mic,
  Pause,
  Play,
  Reply,
  Pencil,
  Smile,
  TriangleAlert,
  Video,
  X,
} from "lucide-vue-next";
import {
  formatTime,
  formatDuration,
  isImage,
  isVideo,
  isAudio,
  getFileLabel,
} from "@/lib/chatUtils";
import { copyToClipboard } from "@/lib/clipboard";
import { roboHashUrl } from "@/lib/crypto";

const props = defineProps({
  message: { type: Object, required: true },
  mine: { type: Boolean, default: false },
  blobUrl: { type: String, default: null },
  isLoading: { type: Boolean, default: false },
  hasFailed: { type: Boolean, default: false },
  showSenderName: { type: Boolean, default: false },
  senderName: { type: String, default: "" },
  senderAvatar: { type: String, default: "" },
  selfHandle: { type: String, default: "" },
  isConsecutive: { type: Boolean, default: false },
});

const emit = defineEmits(["download", "reply", "react", "edit"]);

const REACT_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
const showReactionPicker = ref(false);
function react(emoji) {
  showReactionPicker.value = false;
  emit("react", { message: props.message, emoji });
}

// Swipe to reply
const swipeX = ref(0);
let touchStartX = 0;
let touchStartY = 0;
let swipeTracking = false;

function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  swipeTracking = false;
  swipeX.value = 0;
}

function handleTouchMove(e) {
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;
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

const copied = ref(false);

async function copyRaw() {
  try {
    const source = props.message?.rawPayload || props.message?.payload || props.message;
    await copyToClipboard(JSON.stringify(source, null, 2));
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch (e) {
    // ignore clipboard failure
  }
}

// True when this message's text contains @selfHandle (case-insensitive, word-boundary aware)
const isMentioned = computed(() => {
  if (!props.selfHandle || props.mine || props.message?.type !== "text") return false;
  const text = props.message.text || "";
  return new RegExp(`@${props.selfHandle}(?:\\s|$|[^\\w])`, "i").test(text);
});

// Pulse for 3 seconds after mount if mentioned, then stop
const mentionPulseActive = ref(false);
onMounted(() => {
  if (isMentioned.value) {
    mentionPulseActive.value = true;
    setTimeout(() => {
      mentionPulseActive.value = false;
    }, 3000);
  }
});

// Hacker scramble effect for decrypting state
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&?";
const scrambleText = ref("");
let scrambleTimer = null;
function startScramble(target) {
  let frame = 0;
  const totalFrames = 18;
  scrambleText.value = target
    .split("")
    .map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)])
    .join("");
  clearInterval(scrambleTimer);
  scrambleTimer = setInterval(() => {
    frame++;
    const revealed = Math.floor((frame / totalFrames) * target.length);
    scrambleText.value = target
      .split("")
      .map((ch, i) => (i < revealed ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
      .join("");
    if (frame >= totalFrames) {
      scrambleText.value = target;
      clearInterval(scrambleTimer);
      // restart loop for continuous glitch effect while still loading
      if (props.isLoading) startScramble(target);
    }
  }, 60);
}
watch(
  () => props.isLoading,
  (loading) => {
    if (loading) {
      startScramble("Decrypting...");
    } else {
      clearInterval(scrambleTimer);
      scrambleText.value = "";
    }
  },
  { immediate: true },
);
onUnmounted(() => clearInterval(scrambleTimer));

// ── Lightbox ──────────────────────────────────────────────────────────────
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
    // double-tap: toggle 2.5× or reset
    lightboxScale.value = lightboxScale.value > 1 ? 1 : 2.5;
    lightboxOffsetX.value = 0;
    lightboxOffsetY.value = 0;
  }
  lbLastTap = n;
}
// ──────────────────────────────────────────────────────────────────────────

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
const totalSecs = ref(props.message.durationMs ? Math.round(props.message.durationMs / 1000) : 0);

watch(
  () => props.blobUrl,
  (url) => {
    if (!url) return;
    playing.value = false;
    progress.value = 0;
    currentSecs.value = 0;
  },
);

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
  if (!el || !el.duration) return;
  progress.value = (el.currentTime / el.duration) * 100;
  currentSecs.value = Math.floor(el.currentTime);
  if (!totalSecs.value && el.duration) totalSecs.value = Math.floor(el.duration);
}

function onEnded() {
  playing.value = false;
  progress.value = 0;
  currentSecs.value = 0;
}

function seek(e) {
  const el = audioEl.value;
  if (!el || !el.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  el.currentTime = ((e.clientX - rect.left) / rect.width) * el.duration;
}

function onLoadedMetadata() {
  const el = audioEl.value;
  if (el?.duration) totalSecs.value = Math.floor(el.duration);
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
    class="flex gap-2.5 group/bubble"
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
      class="flex flex-col max-w-[84%] sm:max-w-[70%] lg:max-w-[64%] relative"
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
            class="ui-icon-button p-1.5 rounded-xl shadow-sm transition hover:text-yellow-300"
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
              class="ui-panel absolute bottom-full mb-1.5 flex gap-0.5 rounded-2xl px-2 py-1.5 shadow-xl z-20"
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
          class="ui-icon-button p-1.5 rounded-xl shadow-sm transition"
          title="Edit message"
        >
          <Pencil class="w-3.5 h-3.5" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <button
          @click="emit('reply', message)"
          class="ui-icon-button p-1.5 rounded-xl shadow-sm transition hover:text-(--app-primary)"
          title="Reply"
        >
          <Reply class="w-3.5 h-3.5" :stroke-width="2.2" aria-hidden="true" />
        </button>
      </div>

      <!-- Bubble -->
      <div
        class="rounded-[20px] px-4 py-3 text-sm wrap-break-word transition-all duration-150 relative"
        :class="
          mine
            ? 'bubble-mine rounded-br-md'
            : isMentioned
              ? `bubble-them bg-amber-500/10 rounded-bl-md border border-amber-500/30 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]${mentionPulseActive ? ' animate-pulse' : ''}`
              : 'bubble-them rounded-bl-md'
        "
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
                class="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all duration-150 active:scale-95"
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
            <p class="leading-relaxed" v-html="linkifyText"></p>
            <span v-if="message.editedAt" class="text-[10px] opacity-40 select-none">
              · edited</span
            >
          </template>
        </template>

        <!-- ── Voice note ── -->
        <template v-else-if="message.type === 'voice'">
          <!-- Decrypted: player -->
          <div v-if="blobUrl" class="flex flex-col gap-2 w-56 sm:w-64 select-none">
            <audio
              ref="audioEl"
              :src="blobUrl"
              preload="metadata"
              class="hidden"
              @timeupdate="onTimeUpdate"
              @ended="onEnded"
              @loadedmetadata="onLoadedMetadata"
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
          <button
            v-else
            @click="emit('download', message)"
            class="flex items-center gap-2.5 text-xs px-3.5 py-2 rounded-xl transition-all duration-150 active:scale-95"
            :class="mine ? 'bg-white/15 hover:bg-white/22' : 'bg-white/7 hover:bg-white/12'"
          >
            <Mic class="w-3.5 h-3.5 shrink-0" :stroke-width="1.8" aria-hidden="true" />
            <span>{{ isLoading ? scrambleText : "Play voice note" }}</span>
          </button>
        </template>

        <!-- ── File / media attachment ── -->
        <template v-else>
          <div class="space-y-2 min-w-0">
            <!-- Image -->
            <div v-if="isImage(mediaMime) && blobUrl" class="overflow-hidden rounded-xl">
              <img
                :src="blobUrl"
                :alt="getFileLabel(message)"
                class="max-h-64 w-full object-contain bg-black/20 transition-transform duration-200 hover:scale-[1.02] cursor-zoom-in"
                @click="openLightbox"
              />
            </div>
            <!-- Video -->
            <div v-else-if="isVideo(mediaMime) && blobUrl" class="overflow-hidden rounded-xl">
              <video :src="blobUrl" controls class="max-h-64 w-full bg-black/40 rounded-xl" />
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
            <div class="flex items-center gap-2 flex-wrap">
              <button
                @click="emit('download', message)"
                class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all duration-150 active:scale-95"
                :class="mine ? 'bg-white/15 hover:bg-white/22' : 'bg-white/7 hover:bg-white/12'"
              >
                <Download class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
                {{ isLoading ? scrambleText : blobUrl ? "Download" : "Decrypt" }}
              </button>

              <span v-if="hasFailed" class="text-[10px] opacity-50 text-red-400">Failed</span>
            </div>
          </div>
        </template>

        <!-- Reactions -->
        <div
          v-if="message.reactions?.length"
          class="absolute -bottom-3 flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-full px-1.5 py-0.5 shadow-sm z-10"
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

      <!-- Timestamp + delivery status (status only shown for own outgoing messages) -->
      <div
        class="flex items-center gap-1.5 mt-1 px-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity duration-200"
        :class="mine ? 'justify-end' : 'justify-start'"
      >
        <p class="text-[10px] text-zinc-500 select-none">{{ formatTime(message.ts) }}</p>
        <span v-if="mine && message.status === 'pending'" class="text-zinc-500" title="Sending…">
          <Clock class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
        </span>
        <span
          v-else-if="mine && message.status === 'failed'"
          class="text-red-400"
          :title="message.error || 'Failed to send'"
        >
          <TriangleAlert class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
        </span>
        <span v-else-if="mine && message.status === 'sent'" class="text-zinc-500" title="Sent">
          <Check class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
        </span>
      </div>
    </div>
  </div>

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
            class="max-w-full max-h-full object-contain pointer-events-none"
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
