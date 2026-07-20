<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { Loader2, XCircle } from "@lucide/vue";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";

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
  <div
    v-if="visible"
    class="flex items-center gap-2 px-1 py-1 text-(--app-muted) transition-opacity duration-300"
    :class="compact ? 'text-[11px]' : 'text-xs'"
  >
    <Loader2 v-if="isActive" class="h-3.5 w-3.5 shrink-0 animate-spin" :stroke-width="2" />
    <XCircle v-else class="h-3.5 w-3.5 shrink-0 text-(--app-danger)" :stroke-width="2" />
    <span class="truncate">{{ isFailed ? errorText : statusText }}</span>
  </div>
</template>
