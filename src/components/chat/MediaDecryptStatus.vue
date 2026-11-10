<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { XCircle, Copy, Check, ExternalLink } from "@lucide/vue";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";
import { copyToClipboard } from "@/lib/clipboard";

const props = defineProps({
  progress: { type: Object, default: null },
  compact: { type: Boolean, default: false },
});

const phase = computed(() => props.progress?.phase || MEDIA_PHASE.IDLE);
const isActive = computed(
  () => phase.value === MEDIA_PHASE.FETCH || phase.value === MEDIA_PHASE.DECRYPT,
);
const isSuccess = computed(
  () => phase.value === MEDIA_PHASE.DONE || phase.value === MEDIA_PHASE.CACHED,
);
const isFailed = computed(() => phase.value === MEDIA_PHASE.FAILED);
// A fetch failure is not final: an automatic retry is already scheduled. Keep
// the fetching animation instead of flashing an error the user cannot act on.
const isRetrying = computed(() => isFailed.value && Boolean(props.progress?.retry));
const isWorking = computed(() => isActive.value || isRetrying.value);
const visible = computed(() => isActive.value || isFailed.value);

const blobHash = computed(() => {
  if (props.progress?.hash) return props.progress.hash;
  if (props.progress?.cid) return props.progress.cid;
  const sources = props.progress?.sources || [];
  for (const s of sources) {
    if (s.hash) return s.hash;
    if (s.cid) return s.cid;
  }
  return null;
});

const isSlowFetch = ref(false);
const copied = ref(false);
let slowFetchTimer = null;
let copyTimeout = null;

watch(
  isActive,
  (active) => {
    if (slowFetchTimer) clearTimeout(slowFetchTimer);
    slowFetchTimer = null;
    isSlowFetch.value = false;

    if (active) {
      slowFetchTimer = setTimeout(() => {
        isSlowFetch.value = true;
      }, 20_000);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (slowFetchTimer) clearTimeout(slowFetchTimer);
  if (copyTimeout) clearTimeout(copyTimeout);
});

async function copyBlobHash() {
  if (!blobHash.value) return;
  await copyToClipboard(blobHash.value);
  copied.value = true;
  if (copyTimeout) clearTimeout(copyTimeout);
  copyTimeout = setTimeout(() => {
    copied.value = false;
  }, 1500);
}

const FETCH_MESSAGES = [
  "Grabbing it…",
  "Fetching…",
  "On its way…",
  "Almost there…",
  "Pulling it down…",
  "Downloading…",
  "Getting it for you…",
  "One sec…",
];

const DECRYPT_MESSAGES = ["Unlocking…", "Decrypting…", "Opening…", "Cracking it open…"];

const RETRYING_MESSAGES = [
  "Getting your file…",
  "Still fetching…",
  "Trying another relay…",
  "Almost there…",
];

const messageIndex = ref(0);
const messages = computed(() => {
  if (phase.value === MEDIA_PHASE.FAILED) return RETRYING_MESSAGES;
  if (phase.value === MEDIA_PHASE.DECRYPT) return DECRYPT_MESSAGES;
  return FETCH_MESSAGES;
});
const statusText = computed(() => messages.value[messageIndex.value % messages.value.length]);

let timer = null;
watch(
  isWorking,
  (active) => {
    clearInterval(timer);
    timer = null;
    messageIndex.value = 0;
    if (active) {
      timer = setInterval(() => {
        messageIndex.value++;
      }, 2400);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => clearInterval(timer));

const errorText = computed(() => props.progress?.error || "Couldn't load");

// Ticking clock so the retry countdown counts down live instead of sitting
// static between progress emissions. Remaining time is derived from the
// retry's `at` timestamp plus its `nextRetryMs` delay.
const now = ref(Date.now());
let countdownTimer = null;

// A failed preview can still have a scheduled automatic retry waiting behind
// it, so count that down too instead of only showing it while active.
const hasPendingRetry = computed(
  () => Boolean(props.progress?.retry) && (isActive.value || isFailed.value),
);

watch(
  hasPendingRetry,
  (pending) => {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    if (pending) {
      now.value = Date.now();
      countdownTimer = setInterval(() => {
        now.value = Date.now();
      }, 1000);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});

const retryText = computed(() => {
  const retry = props.progress?.retry;
  if (!retry || !(isActive.value || isFailed.value)) return "";
  // Touch `now` so this recomputes every tick.
  const elapsed = now.value - (retry.at ?? now.value);
  const remainingMs = Math.max(0, (retry.nextRetryMs ?? 0) - elapsed);
  // Automatic retries are unbounded, so there is no total to show.
  const label = retry.retries ? `${retry.attempt}/${retry.retries}` : `${retry.attempt}`;
  if (remainingMs <= 0) return `Retry ${label} · retrying…`;
  return `Retry ${label} · next in ${Math.ceil(remainingMs / 1000)}s`;
});
const retryLabel = computed(() => props.progress?.retry?.label || "");
</script>

<template>
  <div v-if="visible" class="flex flex-col gap-1 transition-opacity duration-300">
    <div
      class="flex items-center gap-2 px-1 py-1 text-zinc-400 font-mono"
      :class="compact ? 'text-[11px]' : 'text-xs'"
    >
      <svg
        v-if="isWorking"
        class="h-3.5 w-3.5 shrink-0 text-zinc-200"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle class="media-fetch-ring" cx="12" cy="12" r="8.5" stroke-dasharray="16 38" />
        <g class="media-fetch-arrow">
          <path d="M12 7.5v8" />
          <path d="m8.75 12.25 3.25 3.25 3.25-3.25" />
        </g>
        <path class="media-fetch-tray" d="M6.5 19.5h11" />
      </svg>
      <XCircle v-else class="h-3.5 w-3.5 shrink-0 text-red-400" :stroke-width="1.8" />
      <span class="truncate font-medium">{{ isWorking ? statusText : errorText }}</span>
    </div>

    <div
      v-if="retryText"
      class="px-1 font-mono text-zinc-500"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
    >
      <span>{{ retryText }}</span>
      <span v-if="retryLabel" class="truncate text-zinc-600"> via {{ retryLabel }}</span>
    </div>

    <!-- Soft Shimmer Decrypting Transition Bar -->
    <div
      v-if="isWorking"
      class="h-1 w-full max-w-[200px] rounded-full overflow-hidden bg-zinc-800 my-0.5"
    >
      <div class="h-full w-full rounded-full skeleton-shimmer" />
    </div>

    <div
      v-if="blobHash && (isSlowFetch || isFailed)"
      class="flex items-center gap-2 px-1 text-zinc-400"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
    >
      <button
        type="button"
        @click.stop="copyBlobHash"
        class="inline-flex items-center gap-1 font-mono bg-zinc-900 hover:bg-zinc-800 px-1.5 py-0.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 cursor-pointer select-none transition-colors"
        :title="blobHash"
      >
        <Check v-if="copied" class="h-3 w-3 text-emerald-400" />
        <Copy v-else class="h-3 w-3" />
        <span>{{ copied ? "Copied Hash" : `${blobHash.slice(0, 8)}…${blobHash.slice(-6)}` }}</span>
      </button>
    </div>

    <p
      v-if="isSlowFetch || isFailed"
      class="px-1 text-zinc-500 font-mono leading-relaxed"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
    >
      Slow on the shared relay node.
      <a
        href="https://github.com/rabta-protocol/rabta"
        target="_blank"
        rel="noopener noreferrer"
        @click.stop
        class="inline-flex items-center gap-0.5 font-medium text-zinc-300 hover:text-white hover:underline underline-offset-2 cursor-pointer"
      >
        Run your own Rabta relay
        <ExternalLink class="h-2.5 w-2.5" :stroke-width="1.8" />
      </a>
    </p>
  </div>
</template>
