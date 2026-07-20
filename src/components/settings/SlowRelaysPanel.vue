<script setup>
import { computed } from "vue";
import { RefreshCw, Trophy, AlertTriangle } from "@lucide/vue";
import { getRelayRanking } from "@/lib/idb";
import { readRelays } from "@/lib/relay";
import { useDexieLiveQuery } from "@/composables/useDexieLiveQuery";
import { EXPLOIT_SLOTS, EXPLORE_SLOTS } from "@/lib/relay/constants";

const { data: allRanked, loading, refresh } = useDexieLiveQuery(() => getRelayRanking());

const activeRelays = computed(() => {
  if (!allRanked.value?.length) return [];
  const active = new Set(
    allRanked.value.slice(0, EXPLOIT_SLOTS + EXPLORE_SLOTS).map((r) => r.relay),
  );
  return allRanked.value
    .filter((r) => active.has(r.relay))
    .sort((a, b) => (a.latencyMs || Infinity) - (b.latencyMs || Infinity));
});

const totalCount = computed(() => allRanked.value?.length || 0);

const worstRelays = computed(() => {
  if (!allRanked.value?.length) return [];
  return allRanked.value.slice(-3).reverse();
});

function relayHost(url) {
  return url.replace(/^wss:\/\//i, "");
}
</script>

<template>
  <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-(--app-border)">
      <div class="flex items-center gap-1.5">
        <Trophy class="h-3.5 w-3.5 text-amber-400 shrink-0" :stroke-width="2" />
        <p class="text-xs font-semibold text-(--app-text)">Top Relays</p>
        <span
          class="ml-0.5 rounded-full bg-amber-400/15 px-1.5 py-px text-[9px] font-bold text-amber-400"
          >{{ activeRelays.length }}/{{ totalCount }}</span
        >
      </div>
      <button
        @click="refresh"
        class="inline-flex h-6 w-6 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors"
        :class="{ 'animate-spin': loading }"
        title="Refresh"
      >
        <RefreshCw class="h-3 w-3" :stroke-width="2" />
      </button>
    </div>

    <div v-if="activeRelays.length" class="px-3 py-3 space-y-1">
      <div
        v-for="entry in activeRelays"
        :key="entry.relay"
        class="flex items-center gap-2 rounded-lg bg-(--app-surface-soft) border border-(--app-border) px-2.5 py-1.5 text-[11px]"
      >
        <span class="shrink-0 h-2 w-2 rounded-full bg-emerald-400 opacity-60" />
        <span class="font-mono truncate text-(--app-text-soft)" :title="entry.relay">
          {{ relayHost(entry.relay) }}
        </span>
        <span
          class="ml-auto shrink-0 tabular-nums whitespace-nowrap font-semibold text-emerald-400"
        >
          {{ entry.latencyMs > 0 ? entry.latencyMs.toFixed(0) + "ms" : "new" }}
        </span>
      </div>
    </div>

    <div v-else class="flex items-center gap-2 px-4 py-3">
      <p class="text-xs text-(--app-muted)">No relay data yet. Send a message to start ranking.</p>
    </div>
  </div>

  <div
    v-if="worstRelays.length"
    class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) overflow-hidden"
  >
    <div class="flex items-center gap-1.5 px-4 py-2.5 border-b border-(--app-border)">
      <AlertTriangle class="h-3.5 w-3.5 text-red-400 shrink-0" :stroke-width="2" />
      <p class="text-xs font-semibold text-(--app-text)">Worst Relays</p>
      <span
        class="ml-0.5 rounded-full bg-red-400/15 px-1.5 py-px text-[9px] font-bold text-red-400"
        >{{ worstRelays.length }}</span
      >
    </div>

    <div class="px-3 py-3 space-y-1">
      <div
        v-for="entry in worstRelays"
        :key="entry.relay"
        class="flex items-center gap-2 rounded-lg bg-(--app-surface-soft) border border-(--app-border) px-2.5 py-1.5 text-[11px]"
      >
        <span class="shrink-0 h-2 w-2 rounded-full bg-red-400 opacity-60" />
        <span class="font-mono truncate text-(--app-text-soft)" :title="entry.relay">
          {{ relayHost(entry.relay) }}
        </span>
        <span class="ml-auto shrink-0 tabular-nums whitespace-nowrap font-semibold text-red-400">
          {{ (entry.score * 100).toFixed(0) }}%
        </span>
      </div>
    </div>
  </div>
</template>
