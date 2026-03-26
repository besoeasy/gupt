<script setup>
import { ref, watch, computed } from "vue";
import { Download, Mic, Pause, Play, Copy, Heart, Reply } from "lucide-vue-next";
import {
  formatTime,
  formatDuration,
  isImage,
  isVideo,
  isAudio,
  getFileLabel,
} from "@/lib/chatUtils";
import { roboHashUrl } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "reka-ui";

const props = defineProps({
  message: { type: Object, required: true },
  mine: { type: Boolean, default: false },
  blobUrl: { type: String, default: null },
  isLoading: { type: Boolean, default: false },
  hasFailed: { type: Boolean, default: false },
  showSenderName: { type: Boolean, default: false },
  senderName: { type: String, default: "" },
  senderAvatar: { type: String, default: "" },
  // Spaceless handle of the current user (e.g. "LucaTheReaper") for mention detection
  selfHandle: { type: String, default: "" },
  reactions: { type: Array, default: () => [] },
});

const emit = defineEmits(["download", "reply", "react"]);

const copied = ref(false);
const isZoomed = ref(false);

async function copyRaw() {
  try {
    const source = props.message?.rawPayload || props.message?.payload || props.message;
    await navigator.clipboard.writeText(JSON.stringify(source, null, 2));
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch (e) {
    // ignore clipboard failure for now; could show toast later
  }
}

// True when this message's text contains @selfHandle (case-insensitive, word-boundary aware)
const isMentioned = computed(() => {
  if (!props.selfHandle || props.mine || props.message?.type !== "text") return false;
  const text = props.message.text || "";
  return new RegExp(`@${props.selfHandle}(?:\\s|$|[^\\w])`, "i").test(text);
});

const aggregatedReactions = computed(() => {
  const counts = {};
  for (const rx of props.reactions || []) {
    const char = rx.reaction || "❤️";
    counts[char] = (counts[char] || 0) + 1;
  }
  return counts;
});

function handleReact() {
  emit("react", props.message.id);
}

function handleReply() {
  emit("reply", props.message);
}

function scrollToReply() {
  if (!props.message.replyTo) return;
  const el = document.getElementById(`msg-${props.message.replyTo}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add(
      "ring-2",
      "ring-primary",
      "ring-offset-2",
      "ring-offset-background",
      "rounded-xl",
    );
    setTimeout(() => {
      el.classList.remove(
        "ring-2",
        "ring-primary",
        "ring-offset-2",
        "ring-offset-background",
        "rounded-xl",
      );
    }, 2000);
  }
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

const mediaMime = computed(() => props.message?.media?.mime || "application/octet-stream");
</script>

<template>
  <div class="flex gap-2 group/bubble" :class="mine ? 'flex-row-reverse' : 'flex-row'">
    <!-- Peer avatar -->
    <img
      v-if="!mine && senderAvatar"
      :src="avatarDisplaySrc"
      class="w-7 h-7 rounded-md shrink-0 mt-1 bg-muted object-cover opacity-90"
      :title="senderName"
      loading="lazy"
      @error="onAvatarError"
    />

    <div
      class="flex flex-col w-full max-w-[85%] sm:max-w-[75%]"
      :class="mine ? 'items-end' : 'items-start'"
    >
      <div
        class="flex items-end gap-2 relative group-hover/bubble:z-10 max-w-full"
        :class="mine ? 'flex-row' : 'flex-row-reverse'"
      >
        <!-- Hover actions (shown on hover, below bubble) -->
        <div
          class="opacity-0 group-hover/bubble:opacity-100 flex items-center gap-1 transition-opacity shrink-0 mb-1"
          :class="mine ? 'ml-2' : 'mr-2'"
        >
          <button
            @click="handleReact"
            title="React"
            class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          >
            <Heart class="h-4 w-4" />
          </button>
          <button
            @click="handleReply"
            title="Reply"
            class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          >
            <Reply class="h-4 w-4" />
          </button>
        </div>

        <!-- Bubble wrapper -->
        <div
          class="relative shrink-1 min-w-[3rem] mb-1.5"
          :class="mine ? 'text-right' : 'text-left'"
        >
          <!-- Heart icon top right if reacted -->
          <div
            v-if="aggregatedReactions && Object.keys(aggregatedReactions).length > 0"
            class="absolute -bottom-3 right-0 bg-background/95 backdrop-blur-sm border border-border/80 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-foreground shadow-md flex items-center justify-center gap-1 z-20 transition-transform scale-100 group-hover/bubble:scale-105 ring-1 ring-background"
          >
            <span class="leading-none tracking-tighter" style="font-size: 11px">❤️</span>
            <span v-if="aggregatedReactions['❤️'] > 1" class="pr-0.5">{{
              aggregatedReactions["❤️"]
            }}</span>
          </div>

          <!-- Bubble -->
          <div
            class="rounded-xl px-3.5 py-2 text-sm break-words shadow-sm relative inline-block text-left"
            :class="
              mine
                ? 'bg-primary/15 dark:bg-primary/20 text-foreground rounded-br-sm border border-primary/20 shadow-sm'
                : isMentioned
                  ? 'bg-amber-950/70 text-amber-200 rounded-bl-sm border border-amber-500/30 shadow-[0_0_0_1px_rgba(245,158,11,0.12)] motion-safe:animate-pulse'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-sm border border-black/5 dark:border-white/5 shadow-sm'
            "
          >
            <!-- Reply Preview -->
            <div
              v-if="message.replyPreview"
              class="mb-2.5 px-3 py-2.5 text-[11px] opacity-90 cursor-pointer hover:opacity-100 transition-opacity text-left w-full rounded-xl relative overflow-hidden"
              :class="
                mine
                  ? 'bg-primary-foreground/10 ring-1 ring-primary-foreground/30 text-primary-foreground'
                  : 'bg-zinc-200/50 dark:bg-zinc-900/50 ring-1 ring-black/5 dark:ring-white/5'
              "
              @click="scrollToReply"
              title="Click to scroll to message"
            >
              <div
                class="absolute left-0 top-0 bottom-0 w-[3px]"
                :class="mine ? 'bg-primary/50' : 'bg-muted-foreground/30'"
              ></div>
              <div
                class="flex items-center gap-1.5 mb-1.5 pl-1.5"
                :title="message.replyPreview.sender"
              >
                <img
                  v-if="message.replyPreview.sender"
                  :src="roboHashUrl(message.replyPreview.sender)"
                  class="w-3.5 h-3.5 rounded-full bg-background object-cover ring-1 ring-border/50 shadow-sm shrink-0"
                />
                <span
                  class="font-bold text-[10.5px] tracking-wide block truncate w-full pr-1"
                  :class="mine ? 'text-primary' : 'text-zinc-700 dark:text-zinc-300'"
                  >{{ message.replyPreview.sender || "Someone" }}</span
                >
              </div>
              <p
                class="line-clamp-4 break-words whitespace-pre-wrap leading-relaxed pl-1.5"
                :class="
                  mine
                    ? 'text-foreground/90 dark:text-foreground/80'
                    : 'text-zinc-600 dark:text-zinc-400'
                "
              >
                {{ message.replyPreview.text }}
              </p>
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
              <p class="leading-relaxed break-words break-all sm:break-normal">
                {{ message.text }}
              </p>
            </template>

            <!-- ── Voice note ── -->
            <template v-else-if="message.type === 'voice'">
              <!-- Decrypted: player -->
              <div v-if="blobUrl" class="flex items-center gap-3 w-52 sm:w-60">
                <audio
                  ref="audioEl"
                  :src="blobUrl"
                  preload="metadata"
                  class="hidden"
                  @timeupdate="onTimeUpdate"
                  @ended="onEnded"
                  @loadedmetadata="onLoadedMetadata"
                />
                <!-- Play/Pause circle -->
                <Button
                  @click="togglePlay"
                  class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90"
                  :class="
                    mine
                      ? 'bg-primary/10 hover:bg-primary/20 text-primary'
                      : 'bg-background/40 hover:bg-background/60 text-foreground'
                  "
                >
                  <Play
                    v-if="!playing"
                    class="w-4 h-4 ml-0.5"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <Pause v-else class="w-4 h-4" :stroke-width="2" aria-hidden="true" />
                </Button>

                <!-- Track + time -->
                <div class="flex-1 flex flex-col gap-1.5">
                  <div
                    class="h-1.5 rounded-full cursor-pointer overflow-hidden select-none transition-all duration-150 hover:h-2"
                    :class="mine ? 'bg-primary/20' : 'bg-background/40'"
                    @click="seek"
                  >
                    <div
                      class="h-full rounded-full transition-[width] duration-100"
                      :class="mine ? 'bg-primary' : 'bg-primary'"
                      :style="{ width: progress + '%' }"
                    />
                  </div>
                  <div
                    class="flex justify-between text-[10px] opacity-55 font-mono tabular-nums leading-none"
                  >
                    <span>{{ formatDuration(currentSecs) }}</span>
                    <span>{{ formatDuration(totalSecs) }}</span>
                  </div>
                </div>

                <Mic
                  class="w-3.5 h-3.5 shrink-0 opacity-40"
                  :stroke-width="1.8"
                  aria-hidden="true"
                />
              </div>

              <!-- Not yet loaded -->
              <Button
                v-else
                @click="emit('download', message)"
                class="flex items-center gap-2.5 text-xs px-3.5 py-2 rounded-md transition-all duration-150 active:scale-95"
                :class="
                  mine
                    ? 'bg-primary/10 hover:bg-primary/20 text-primary'
                    : 'bg-background/40 hover:bg-background/60 text-foreground'
                "
              >
                <Mic class="w-3.5 h-3.5 shrink-0" :stroke-width="1.8" aria-hidden="true" />
                <span>{{ isLoading ? "Decrypting…" : "Play voice note" }}</span>
              </Button>
            </template>

            <!-- ── File / media attachment ── -->
            <template v-else>
              <div class="space-y-2 min-w-0 max-w-full">
                <!-- Image -->
                <div
                  v-if="isImage(mediaMime) && blobUrl"
                  class="overflow-hidden rounded-md relative group/img max-w-sm"
                >
                  <Dialog>
                    <DialogTrigger as-child @click="isZoomed = false">
                      <img
                        :src="blobUrl"
                        :alt="getFileLabel(message)"
                        class="max-h-64 w-auto max-w-full object-contain bg-background/20 transition-transform duration-200 group-hover/img:scale-[1.02] cursor-zoom-in"
                      />
                    </DialogTrigger>
                    <DialogContent
                      class="sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-[85vw] xl:max-w-[80vw] h-[90vh] border-none bg-transparent p-0 shadow-none flex flex-col justify-center items-center"
                    >
                      <VisuallyHidden><DialogTitle>Image Preview</DialogTitle></VisuallyHidden>
                      <div
                        class="relative w-full h-full flex justify-center items-center overflow-auto group/zoom"
                      >
                        <img
                          :src="blobUrl"
                          :alt="getFileLabel(message)"
                          class="max-h-[90vh] object-contain rounded-md"
                          :class="{
                            'w-full h-auto max-h-none object-scale-down cursor-zoom-out': isZoomed,
                            'max-w-full cursor-zoom-in': !isZoomed,
                          }"
                          @click.stop="isZoomed = !isZoomed"
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <!-- Video -->
                <div v-else-if="isVideo(mediaMime) && blobUrl" class="overflow-hidden rounded-md">
                  <video
                    :src="blobUrl"
                    controls
                    class="max-h-64 w-auto max-w-full bg-background/20 rounded-md"
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
                  />
                  <div class="flex items-center gap-3 w-52">
                    <Button
                      @click="togglePlay"
                      class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90"
                      :class="
                        mine
                          ? 'bg-primary/10 hover:bg-primary/20 text-primary'
                          : 'bg-background/40 hover:bg-background/60 text-foreground'
                      "
                    >
                      <Play
                        v-if="!playing"
                        class="w-4 h-4 ml-0.5"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                      <Pause v-else class="w-4 h-4" :stroke-width="2" aria-hidden="true" />
                    </Button>
                    <div class="flex-1 flex flex-col gap-1.5">
                      <div
                        class="h-1.5 rounded-full cursor-pointer overflow-hidden hover:h-2 transition-all duration-150"
                        :class="mine ? 'bg-primary/20' : 'bg-background/40'"
                        @click="seek"
                      >
                        <div
                          class="h-full rounded-full bg-primary transition-[width] duration-100"
                          :style="{ width: progress + '%' }"
                        />
                      </div>
                      <div
                        class="flex justify-between text-[10px] opacity-55 font-mono tabular-nums leading-none"
                      >
                        <span>{{ formatDuration(currentSecs) }}</span>
                        <span>{{ formatDuration(totalSecs) }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- File info row -->
                <div
                  class="rounded-md px-3 py-2.5 space-y-0.5"
                  :class="
                    mine
                      ? 'bg-primary-foreground/10 text-primary-foreground'
                      : 'bg-background/40 text-foreground'
                  "
                >
                  <p class="text-xs font-semibold truncate">{{ getFileLabel(message) }}</p>
                  <p class="text-[10px] opacity-50 truncate">
                    {{ mediaMime || "application/octet-stream" }}
                  </p>
                </div>

                <!-- Action row -->
                <div class="flex items-center gap-2 flex-wrap">
                  <Button
                    @click="emit('download', message)"
                    class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all duration-150 active:scale-95"
                    :class="
                      mine
                        ? 'bg-primary/10 hover:bg-primary/20 text-primary'
                        : 'bg-background/40 hover:bg-background/60 text-foreground'
                    "
                  >
                    <Download class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
                    {{ isLoading ? "Decrypting…" : blobUrl ? "Download" : "Decrypt" }}
                  </Button>

                  <Button
                    @click="copyRaw"
                    class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all duration-150 active:scale-95"
                    :class="
                      mine
                        ? 'bg-primary/10 hover:bg-primary/20 text-primary'
                        : 'bg-background/40 hover:bg-background/60 text-foreground'
                    "
                    title="Copy raw message JSON"
                  >
                    <Copy class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
                    <span v-if="copied" class="text-[11px]">Copied</span>
                    <span v-else class="hidden sm:inline">Copy JSON</span>
                  </Button>
                  <span v-if="hasFailed" class="text-[10px] opacity-50 text-red-400">Failed</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
      <!-- Close the new flex wrapper -->

      <!-- Timestamp -->
      <p
        class="text-[10px] text-zinc-700 mt-1 px-1 select-none opacity-0 group-hover/bubble:opacity-100 transition-opacity duration-200"
      >
        {{ formatTime(message.ts) }}
      </p>
    </div>
  </div>
</template>
