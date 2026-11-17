<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { XCircle, Copy, Check, ExternalLink, RefreshCw, ChevronDown } from "@lucide/vue";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";
import { copyToClipboard } from "@/lib/clipboard";
import { formatBytes } from "@/lib/chatUtils";
import RelayEventLink from "@/components/RelayEventLink.vue";

const props = defineProps({
  progress: { type: Object, default: null },
  compact: { type: Boolean, default: false },
  retryable: { type: Boolean, default: false },
  eventId: { type: String, default: "" },
});

const emit = defineEmits(["retry"]);

const phase = computed(() => props.progress?.phase || MEDIA_PHASE.IDLE);
const isActive = computed(
  () =>
    phase.value === MEDIA_PHASE.FETCH ||
    phase.value === MEDIA_PHASE.DECRYPT ||
    phase.value === MEDIA_PHASE.QUEUED,
);
const isSuccess = computed(
  () => phase.value === MEDIA_PHASE.DONE || phase.value === MEDIA_PHASE.CACHED,
);
const isFailed = computed(() => phase.value === MEDIA_PHASE.FAILED);
// Set only while a fetch retry is still pending; a final failure clears it so
// the error and the manual restart button become visible.
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

const rawEventId = computed(() => {
  const explicit = String(props.eventId || "").trim();
  if (explicit) return explicit;
  const fromProg = String(props.progress?.eventId || "").trim();
  if (fromProg) return fromProg;
  return "";
});

const parts = computed(() => {
  if (Array.isArray(props.progress?.parts) && props.progress.parts.length) {
    return props.progress.parts;
  }
  const fromSource = props.progress?.sources?.[0]?.parts;
  if (Array.isArray(fromSource) && fromSource.length) {
    return fromSource;
  }
  return [];
});

const showPartsList = ref(false);
const copiedPartIdx = ref(-1);
let copiedPartTimer = null;

async function copyPartHash(hash, idx) {
  if (!hash) return;
  await copyToClipboard(hash);
  copiedPartIdx.value = idx;
  if (copiedPartTimer) clearTimeout(copiedPartTimer);
  copiedPartTimer = setTimeout(() => {
    copiedPartIdx.value = -1;
  }, 1500);
}

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
  if (copiedPartTimer) clearTimeout(copiedPartTimer);
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
  if (phase.value === MEDIA_PHASE.QUEUED) return ["Waiting in download queue (max 3 at a time)…"];
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
  // Automatic attempts are bounded, so show the total when the relay reports it.
  const label = retry.retries ? `${retry.attempt}/${retry.retries}` : `${retry.attempt}`;
  if (remainingMs <= 0) return `Retry ${label} · retrying…`;
  return `Retry ${label} · next in ${Math.ceil(remainingMs / 1000)}s`;
});
const retryLabel = computed(() => props.progress?.retry?.label || "");

const downloadPercent = computed(() => {
  const p = props.progress?.percent;
  return typeof p === "number" && p >= 0 ? Math.min(100, Math.max(0, Math.round(p))) : 0;
});

const bytesProgress = computed(() => {
  const loaded = props.progress?.loadedBytes || 0;
  const total = props.progress?.totalBytes || 0;
  if (loaded > 0 && total > 0) {
    return `${formatBytes(loaded)} / ${formatBytes(total)}`;
  }
  if (loaded > 0) {
    return formatBytes(loaded);
  }
  return "";
});

const partsProgress = computed(() => {
  const loaded = props.progress?.partsLoaded || 0;
  const total = props.progress?.totalParts || parts.value.length || 0;
  if (total > 1 && loaded > 0) {
    return `${loaded}/${total} parts`;
  }
  return "";
});

const progressDetail = computed(() => {
  if (phase.value === MEDIA_PHASE.QUEUED) return "Queued…";
  if (phase.value === MEDIA_PHASE.DECRYPT) return "Decrypting…";
  if (partsProgress.value && bytesProgress.value) {
    return `${partsProgress.value} · ${bytesProgress.value}`;
  }
  if (bytesProgress.value) return bytesProgress.value;
  if (partsProgress.value) return partsProgress.value;
  return "";
});
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
      <button
        v-if="retryable && isFailed && !isWorking"
        type="button"
        @click.stop="emit('retry')"
        class="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white cursor-pointer"
      >
        <RefreshCw class="h-3 w-3" :stroke-width="1.8" />
        <span>Retry</span>
      </button>
    </div>

    <div
      v-if="retryText"
      class="px-1 font-mono text-zinc-500"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
    >
      <span>{{ retryText }}</span>
      <span v-if="retryLabel" class="truncate text-zinc-600"> via {{ retryLabel }}</span>
    </div>

    <!-- Live Progress Bar with Percentage and Byte Counter -->
    <div
      v-if="isWorking"
      class="flex flex-col gap-1 w-full max-w-[240px] my-0.5"
    >
      <div
        v-if="progressDetail || downloadPercent > 0"
        class="flex items-center justify-between text-[10px] font-mono text-zinc-400 tabular-nums px-0.5"
      >
        <span class="truncate">{{ progressDetail || statusText }}</span>
        <span v-if="downloadPercent > 0" class="font-semibold text-zinc-200 shrink-0 ml-1">
          {{ downloadPercent }}%
        </span>
      </div>
      <div class="h-1.5 w-full rounded-full overflow-hidden bg-zinc-800">
        <div
          class="h-full rounded-full bg-emerald-500 transition-all duration-200"
          :class="{ 'skeleton-shimmer': downloadPercent === 0 }"
          :style="{ width: `${downloadPercent > 0 ? downloadPercent : 15}%` }"
        />
      </div>
    </div>

    <div
      v-if="(blobHash || rawEventId) && (isSlowFetch || isFailed)"
      class="flex flex-wrap items-center gap-2 px-1 text-zinc-400"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
    >
      <button
        v-if="blobHash"
        type="button"
        @click.stop="copyBlobHash"
        class="inline-flex items-center gap-1 font-mono bg-zinc-900 hover:bg-zinc-800 px-1.5 py-0.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 cursor-pointer select-none transition-colors"
        :title="blobHash"
      >
        <Check v-if="copied" class="h-3 w-3 text-emerald-400" />
        <Copy v-else class="h-3 w-3" />
        <span>{{ copied ? "Copied Hash" : `${blobHash.slice(0, 8)}…${blobHash.slice(-6)}` }}</span>
      </button>

      <button
        v-if="parts.length > 1"
        type="button"
        @click.stop="showPartsList = !showPartsList"
        class="inline-flex items-center gap-1 font-mono bg-zinc-900 hover:bg-zinc-800 px-1.5 py-0.5 rounded-md border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 cursor-pointer select-none transition-colors"
        :title="`${parts.length} split pieces`"
      >
        <span>{{ parts.length }} parts</span>
        <ChevronDown
          class="h-2.5 w-2.5 text-zinc-500 transition-transform duration-150"
          :class="showPartsList ? 'rotate-180' : ''"
        />
      </button>

      <RelayEventLink
        v-if="rawEventId"
        :event-id="rawEventId"
        variant="link"
        label="Inspect on Rabta relay"
        placement="top"
      />
    </div>

    <!-- Collapsible list of individual parts when split into multiple pieces -->
    <div
      v-if="showPartsList && parts.length > 1 && (isSlowFetch || isFailed)"
      class="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-zinc-950/80 border border-zinc-800/80 my-1 font-mono"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
    >
      <div class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-0.5">
        Split into {{ parts.length }} parts:
      </div>
      <div
        v-for="(partHash, pIdx) in parts"
        :key="partHash"
        class="flex items-center justify-between gap-2 text-zinc-400 py-0.5 hover:text-zinc-200"
      >
        <span class="text-zinc-500 shrink-0">#{{ pIdx + 1 }}</span>
        <span class="truncate flex-1 font-mono text-[10px]">{{ partHash.slice(0, 10) }}…{{ partHash.slice(-8) }}</span>
        <button
          type="button"
          @click.stop="copyPartHash(partHash, pIdx)"
          class="p-0.5 hover:text-white cursor-pointer"
          :title="`Copy part ${pIdx + 1} hash: ${partHash}`"
        >
          <Check v-if="copiedPartIdx === pIdx" class="h-3 w-3 text-emerald-400" />
          <Copy v-else class="h-3 w-3" />
        </button>
      </div>
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
