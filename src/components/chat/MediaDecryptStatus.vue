<script setup>
import { computed, ref, watch } from "vue";
import {
  CheckCircle2,
  ChevronDown,
  Cloud,
  Download,
  Globe,
  Lock,
  Server,
  XCircle,
} from "lucide-vue-next";
import { MEDIA_PHASE, SOURCE_STATUS } from "@/lib/mediaDecrypt";

const props = defineProps({
  progress: { type: Object, default: null },
  compact: { type: Boolean, default: false },
});

const expanded = ref(false);

const phase = computed(() => props.progress?.phase || MEDIA_PHASE.IDLE);
const sources = computed(() => props.progress?.sources || []);

const isActive = computed(
  () => phase.value === MEDIA_PHASE.FETCH || phase.value === MEDIA_PHASE.DECRYPT,
);
const isSuccess = computed(
  () => phase.value === MEDIA_PHASE.DONE || phase.value === MEDIA_PHASE.CACHED,
);
const isFailed = computed(() => phase.value === MEDIA_PHASE.FAILED);

const tryingSources = computed(() =>
  sources.value.filter((source) => source.status === SOURCE_STATUS.TRYING),
);
const settledCount = computed(() =>
  sources.value.filter((source) =>
    [SOURCE_STATUS.OK, SOURCE_STATUS.FAILED, SOURCE_STATUS.SKIPPED].includes(source.status),
  ).length,
);
const progressPercent = computed(() => {
  if (!sources.value.length) return isActive.value ? 12 : 0;
  const base = (settledCount.value / sources.value.length) * 100;
  if (phase.value === MEDIA_PHASE.DECRYPT) return Math.max(base, 88);
  if (isSuccess.value) return 100;
  if (isActive.value) return Math.max(8, Math.min(base + (tryingSources.value.length ? 14 : 0), 92));
  return base;
});

const headline = computed(() => {
  if (phase.value === MEDIA_PHASE.CACHED) return "Loaded from cache";
  if (phase.value === MEDIA_PHASE.DONE) {
    const winner = sources.value.find((source) => source.id === props.progress?.winnerId);
    return winner ? `Ready via ${winner.label}` : "Decrypted & ready";
  }
  if (phase.value === MEDIA_PHASE.DECRYPT) return "Unlocking on your device…";
  if (phase.value === MEDIA_PHASE.FETCH) {
    if (tryingSources.value.length > 1) {
      return `Trying ${tryingSources.value.length} mirrors`;
    }
    if (tryingSources.value.length === 1) {
      return `Downloading from ${tryingSources.value[0].label}`;
    }
    return "Finding a mirror…";
  }
  if (isFailed.value) {
    return props.progress?.errorKind === "decrypt"
      ? "Decrypt failed on every mirror"
      : "All mirrors unreachable";
  }
  return "Preparing download…";
});

const subline = computed(() => {
  if (isFailed.value) return props.progress?.error || "Tap Decrypt to try again.";
  if (isSuccess.value) return "Decrypted locally on this device.";
  if (phase.value === MEDIA_PHASE.DECRYPT) return "Your key never leaves this browser.";
  if (phase.value === MEDIA_PHASE.FETCH && sources.value.length > 1) {
    return `${settledCount.value} of ${sources.value.length} mirrors checked`;
  }
  return "Fetching encrypted blob";
});

watch(
  isActive,
  (active) => {
    if (active) expanded.value = true;
  },
  { immediate: true },
);

function typeIcon(type) {
  const value = String(type || "").toLowerCase();
  if (value === "blossom") return Cloud;
  if (value === "ipfs") return Globe;
  return Server;
}

function typeBadge(type) {
  const value = String(type || "").toLowerCase();
  if (value === "blossom") return "Blossom";
  if (value === "originless") return "Originless";
  if (value === "ipfs") return "IPFS";
  return value ? value : "Mirror";
}

function statusLabel(status) {
  if (status === SOURCE_STATUS.OK) return "Got it";
  if (status === SOURCE_STATUS.TRYING) return "Fetching…";
  if (status === SOURCE_STATUS.FAILED) return "Failed";
  if (status === SOURCE_STATUS.SKIPPED) return "Skipped";
  return "Queued";
}

const headlineClass = computed(() => {
  if (isFailed.value) return "text-red-400";
  if (isSuccess.value) return "text-emerald-400";
  if (isActive.value) return "text-(--app-primary)";
  return "text-zinc-200";
});
</script>

<template>
  <div
    v-if="progress && (isActive || isFailed || isSuccess || sources.length)"
    class="w-full min-w-0"
    :class="compact ? 'text-[11px]' : 'text-xs'"
  >
    <div class="flex items-start gap-2">
      <component
        :is="
          phase === MEDIA_PHASE.FETCH
            ? Download
            : phase === MEDIA_PHASE.DECRYPT
              ? Lock
              : isSuccess
                ? CheckCircle2
                : isFailed
                  ? XCircle
                  : Download
        "
        class="mt-0.5 h-3.5 w-3.5 shrink-0"
        :class="headlineClass"
        :stroke-width="2"
        aria-hidden="true"
      />

      <div class="min-w-0 flex-1">
        <p class="font-semibold leading-snug" :class="headlineClass">{{ headline }}</p>
        <p class="mt-0.5 leading-snug text-zinc-500">{{ subline }}</p>
      </div>

      <button
        v-if="sources.length"
        type="button"
        class="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-zinc-500 transition-colors hover:text-zinc-300"
        @click="expanded = !expanded"
      >
        {{ sources.length }} mirrors
        <ChevronDown
          class="h-3 w-3 transition-transform duration-200"
          :class="expanded ? 'rotate-180' : ''"
          :stroke-width="2"
          aria-hidden="true"
        />
      </button>
    </div>

    <div v-if="isActive || isFailed" class="mt-2 flex items-center gap-2">
      <div class="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          class="h-full rounded-full transition-all duration-500 ease-out"
          :class="
            isFailed
              ? 'bg-red-400'
              : isSuccess
                ? 'bg-emerald-400'
                : 'bg-(--app-primary)'
          "
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
      <span class="shrink-0 text-[10px] font-semibold tabular-nums text-zinc-500">
        {{ Math.round(progressPercent) }}%
      </span>
    </div>

    <ul
      v-if="expanded && sources.length"
      class="mt-2 space-y-1 border-t border-white/10 pt-2"
    >
      <li
        v-for="source in sources"
        :key="source.id"
        class="flex items-start gap-2 py-0.5"
      >
        <component
          :is="typeIcon(source.type)"
          class="mt-0.5 h-3 w-3 shrink-0 text-zinc-500"
          :stroke-width="2"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="truncate font-medium text-zinc-300">{{ source.label }}</span>
            <span class="shrink-0 text-[9px] font-bold uppercase tracking-wide text-zinc-600">
              {{ typeBadge(source.type) }}
            </span>
          </div>
          <p v-if="source.error" class="truncate text-[10px] text-red-400/90">{{ source.error }}</p>
        </div>
        <span
          class="shrink-0 text-[10px] font-semibold"
          :class="{
            'text-emerald-400': source.status === SOURCE_STATUS.OK,
            'text-(--app-primary)': source.status === SOURCE_STATUS.TRYING,
            'text-red-400': source.status === SOURCE_STATUS.FAILED,
            'text-zinc-600': source.status === SOURCE_STATUS.SKIPPED,
            'text-zinc-500': source.status === SOURCE_STATUS.PENDING,
          }"
        >
          {{ statusLabel(source.status) }}
        </span>
      </li>
    </ul>
  </div>
</template>