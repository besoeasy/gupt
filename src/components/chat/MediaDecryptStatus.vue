<script setup>
import { computed, ref } from "vue";
import { ChevronDown, Loader2 } from "lucide-vue-next";
import { MEDIA_PHASE, SOURCE_STATUS, progressSummary } from "@/lib/mediaDecrypt";

const props = defineProps({
  progress: { type: Object, default: null },
  compact: { type: Boolean, default: false },
});

const expanded = ref(false);

const isActive = computed(() => {
  const phase = props.progress?.phase;
  return phase === MEDIA_PHASE.FETCH || phase === MEDIA_PHASE.DECRYPT;
});

const isFailed = computed(() => props.progress?.phase === MEDIA_PHASE.FAILED);

const summary = computed(() => progressSummary(props.progress));

const sources = computed(() => props.progress?.sources || []);

const hasSources = computed(() => sources.value.length > 0);

function statusLabel(status) {
  if (status === SOURCE_STATUS.OK) return "OK";
  if (status === SOURCE_STATUS.TRYING) return "Trying…";
  if (status === SOURCE_STATUS.FAILED) return "Failed";
  if (status === SOURCE_STATUS.SKIPPED) return "Skipped";
  return "Pending";
}

function statusClass(status) {
  if (status === SOURCE_STATUS.OK) return "text-emerald-400";
  if (status === SOURCE_STATUS.TRYING) return "text-(--app-primary)";
  if (status === SOURCE_STATUS.FAILED) return "text-red-400";
  if (status === SOURCE_STATUS.SKIPPED) return "text-zinc-500";
  return "text-zinc-500";
}

function typeBadge(type) {
  const value = String(type || "").toLowerCase();
  if (value === "blossom") return "Blossom";
  if (value === "originless") return "Originless";
  if (value === "ipfs") return "IPFS";
  return value ? value : "Mirror";
}
</script>

<template>
  <div v-if="progress && (isActive || isFailed || hasSources)" class="space-y-1.5">
    <div class="flex items-start gap-2" :class="compact ? 'text-[10px]' : 'text-xs'">
      <Loader2
        v-if="isActive"
        class="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-(--app-primary)"
        :stroke-width="2"
        aria-hidden="true"
      />
      <p class="min-w-0 flex-1 leading-snug" :class="isFailed ? 'text-red-400' : 'text-zinc-400'">
        {{ summary }}
      </p>
      <button
        v-if="hasSources"
        type="button"
        class="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
        @click="expanded = !expanded"
      >
        Sources
        <ChevronDown
          class="h-3 w-3 transition-transform duration-200"
          :class="expanded ? 'rotate-180' : ''"
          :stroke-width="2"
          aria-hidden="true"
        />
      </button>
    </div>

    <div
      v-if="expanded && hasSources"
      class="rounded-xl border border-white/8 bg-black/15 px-2.5 py-2 space-y-1"
    >
      <div
        v-for="source in sources"
        :key="source.id"
        class="flex items-start justify-between gap-2 text-[10px]"
      >
        <div class="min-w-0">
          <p class="truncate font-medium text-zinc-300">{{ source.label }}</p>
          <p v-if="source.error" class="truncate text-red-400/80">{{ source.error }}</p>
        </div>
        <div class="shrink-0 text-right">
          <span class="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500">
            {{ typeBadge(source.type) }}
          </span>
          <p class="mt-0.5 font-semibold" :class="statusClass(source.status)">
            {{ statusLabel(source.status) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>