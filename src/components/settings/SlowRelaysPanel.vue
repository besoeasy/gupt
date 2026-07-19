<script setup>
import { ref, computed, onMounted } from "vue";
import { RefreshCw, Antenna } from "@lucide/vue";
import { getRelayHealthSummary } from "@/lib/idb";
import { getActiveRelays } from "@/lib/relay";

const all = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    all.value = await getRelayHealthSummary();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  refreshActive();
});

const activeRelays = ref([]);

function refreshActive() {
  activeRelays.value = getActiveRelays();
}

const latencyMap = computed(() => {
  const map = {};
  for (const row of all.value) {
    map[row.relay] = row.avgPublishMs || row.avgConnectMs || null;
  }
  return map;
});

const sortedActiveRelays = computed(() => {
  return [...activeRelays.value].sort((a, b) => {
    const la = latencyMap.value[a] ?? Infinity;
    const lb = latencyMap.value[b] ?? Infinity;
    return la - lb;
  });
});

function latencyColor(ms) {
  if (ms == null) return "";
  if (ms < 300) return "text-emerald-400";
  if (ms < 1000) return "text-yellow-400";
  return "text-red-400";
}
</script>

<template>
  <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-(--app-border)">
      <div class="flex items-center gap-1.5">
        <Antenna class="h-3.5 w-3.5 text-emerald-400 shrink-0" :stroke-width="2" />
        <p class="text-xs font-semibold text-(--app-text)">Active Relays</p>
        <span
          class="ml-0.5 rounded-full bg-emerald-400/15 px-1.5 py-px text-[9px] font-bold text-emerald-400"
          >{{ activeRelays.length }}</span
        >
      </div>
      <button
        @click="load; refreshActive()"
        class="inline-flex h-6 w-6 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors"
        :class="{ 'animate-spin': loading }"
        title="Refresh"
      >
        <RefreshCw class="h-3 w-3" :stroke-width="2" />
      </button>
    </div>

    <div v-if="sortedActiveRelays.length" class="px-3 py-3 space-y-1">
      <div
        v-for="url in sortedActiveRelays"
        :key="url"
        class="flex items-center gap-2 rounded-lg bg-(--app-surface-soft) border border-(--app-border) px-2.5 py-1.5 text-[11px]"
      >
        <span class="h-3 w-3 shrink-0 rounded-full bg-emerald-400/60" />
        <span class="font-mono truncate text-(--app-text-soft)" :title="url">
          {{ url.replace(/^wss:\/\//i, "") }}
        </span>
        <span
          class="ml-auto shrink-0 tabular-nums whitespace-nowrap"
          :class="latencyColor(latencyMap[url])"
        >
          {{ latencyMap[url] != null ? latencyMap[url] + "ms" : "—" }}
        </span>
      </div>
    </div>

    <div v-else class="flex items-center gap-2 px-4 py-3">
      <p class="text-xs text-(--app-muted)">No active connections yet.</p>
    </div>
  </div>
</template>
