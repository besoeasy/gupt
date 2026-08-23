<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { Loader2, XCircle, Copy, Check, ExternalLink } from "@lucide/vue";
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
const visible = computed(() => isActive.value || isFailed.value);

const cid = computed(() => {
  const sources = props.progress?.sources || [];
  for (const s of sources) {
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

async function copyCid() {
  if (!cid.value) return;
  await copyToClipboard(cid.value);
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

const messageIndex = ref(0);
const messages = computed(() =>
  phase.value === MEDIA_PHASE.DECRYPT ? DECRYPT_MESSAGES : FETCH_MESSAGES,
);
const statusText = computed(() => messages.value[messageIndex.value % messages.value.length]);

let timer = null;
watch(
  isActive,
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
</script>

<template>
  <div v-if="visible" class="flex flex-col gap-1 transition-opacity duration-300">
    <div
      class="flex items-center gap-2 px-1 py-1 text-(--app-muted)"
      :class="compact ? 'text-[11px]' : 'text-xs'"
    >
      <Loader2
        v-if="isActive"
        class="h-3.5 w-3.5 shrink-0 animate-spin text-(--app-primary)"
        :stroke-width="2"
      />
      <XCircle v-else class="h-3.5 w-3.5 shrink-0 text-(--app-danger)" :stroke-width="2" />
      <span class="truncate font-medium">{{ isFailed ? errorText : statusText }}</span>
    </div>

    <!-- Soft Shimmer Decrypting Transition Bar -->
    <div
      v-if="isActive"
      class="h-1 w-full max-w-[200px] rounded-full overflow-hidden bg-(--app-surface-soft) my-0.5"
    >
      <div class="h-full w-full rounded-full skeleton-shimmer" />
    </div>

    <div
      v-if="cid && (isSlowFetch || isFailed)"
      class="flex items-center gap-2 px-1 text-(--app-muted)"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
    >
      <button
        type="button"
        @click.stop="copyCid"
        class="inline-flex items-center gap-1 font-mono bg-(--app-bg-subtle) hover:bg-(--app-bg-hover) px-1.5 py-0.5 rounded border border-(--app-border) cursor-pointer select-none transition-colors"
        :title="cid"
      >
        <Check v-if="copied" class="h-3 w-3 text-(--app-success)" />
        <Copy v-else class="h-3 w-3" />
        <span>{{ copied ? "Copied CID" : `${cid.slice(0, 8)}…${cid.slice(-6)}` }}</span>
      </button>

      <a
        :href="`https://check.ipfs.network/?cid=${cid}`"
        target="_blank"
        rel="noopener noreferrer"
        @click.stop
        class="inline-flex items-center gap-1 text-(--app-muted) hover:text-(--app-text) underline cursor-pointer transition-colors"
        title="Check CID health on check.ipfs.network"
      >
        <span>ipfs check</span>
        <ExternalLink class="h-2.5 w-2.5" />
      </a>
    </div>

    <p
      v-if="isSlowFetch || isFailed"
      class="px-1 text-(--app-muted) leading-relaxed"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
    >
      Slow on the shared pin node.
      <a
        href="https://github.com/besoeasy/Originless"
        target="_blank"
        rel="noopener noreferrer"
        @click.stop
        class="inline-flex items-center gap-0.5 font-medium text-(--app-primary) hover:underline underline-offset-2 cursor-pointer"
      >
        Run your own Originless
        <ExternalLink class="h-2.5 w-2.5" :stroke-width="2" />
      </a>
    </p>
  </div>
</template>
