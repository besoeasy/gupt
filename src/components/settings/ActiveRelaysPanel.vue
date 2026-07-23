<script setup>
import { computed } from "vue";
import { RefreshCw, Activity } from "@lucide/vue";
import { getRelayRanking } from "@/lib/idb";
import { getKnownRelays } from "@/lib/relay";
import { useDexieLiveQuery } from "@/composables/useDexieLiveQuery";
import { EXPLOIT_SLOTS, EXPLORE_SLOTS } from "@/lib/relay/constants";

const { data: allRanked, loading, refresh } = useDexieLiveQuery(() => getRelayRanking());

const ACTIVE_EMOJIS = ["⚡", "🚀", "🔥", "💎", "🌟", "✨", "💥", "🎯"];

const allRelays = computed(() => {
  const known = getKnownRelays();
  const rankedMap = new Map((allRanked.value || []).map((r) => [r.relay, r]));

  const rankedRelays = (allRanked.value || []).map((r) => r.relay);
  const activeSet = new Set(rankedRelays.slice(0, EXPLOIT_SLOTS));

  const rankedSet = new Set(rankedRelays);
  const untestedRelays = known.filter((r) => !rankedSet.has(r));
  untestedRelays.slice(0, EXPLORE_SLOTS).forEach((r) => activeSet.add(r));

  if (activeSet.size === 0) {
    known.slice(0, EXPLOIT_SLOTS + EXPLORE_SLOTS).forEach((r) => activeSet.add(r));
  }

  const allUrls = Array.from(new Set([...known, ...(allRanked.value || []).map((r) => r.relay)]));

  let activeIndex = 0;
  const list = allUrls.map((url) => {
    const stats = rankedMap.get(url);
    const isActive = activeSet.has(url);
    let emoji = "💤";
    if (isActive) {
      emoji = ACTIVE_EMOJIS[activeIndex % ACTIVE_EMOJIS.length];
      activeIndex++;
    }
    return {
      relay: url,
      isActive,
      emoji,
      score: stats?.score ?? null,
      latencyMs: stats?.latencyMs ?? 0,
    };
  });

  return list.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.score !== null && b.score !== null) return b.score - a.score;
    if (a.score !== null) return -1;
    if (b.score !== null) return 1;
    return a.relay.localeCompare(b.relay);
  });
});

const activeCount = computed(() => allRelays.value.filter((r) => r.isActive).length);
const totalCount = computed(() => allRelays.value.length);

function relayHost(url) {
  return url.replace(/^wss:\/\//i, "");
}
</script>

<template>
  <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-(--app-border)">
      <div class="flex items-center gap-1.5">
        <Activity class="h-3.5 w-3.5 text-emerald-400 shrink-0" :stroke-width="2" />
        <p class="text-xs font-semibold text-(--app-text)">Active Relays</p>
        <span
          class="ml-0.5 rounded-full bg-emerald-400/15 px-1.5 py-px text-[9px] font-bold text-emerald-400"
          >{{ activeCount }}/{{ totalCount }}</span
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

    <div v-if="allRelays.length" class="px-3 py-3 space-y-1">
      <div
        v-for="entry in allRelays"
        :key="entry.relay"
        class="flex items-center gap-2 rounded-lg bg-(--app-surface-soft) border border-(--app-border) px-2.5 py-1.5 text-[11px]"
        :class="{ 'border-emerald-500/30 bg-emerald-500/5': entry.isActive }"
      >
        <span class="shrink-0 text-sm select-none" role="img">{{ entry.emoji }}</span>
        <span class="font-mono truncate text-(--app-text-soft)" :title="entry.relay">
          {{ relayHost(entry.relay) }}
        </span>
        <span
          v-if="entry.isActive"
          class="ml-1 shrink-0 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-bold text-emerald-400 uppercase tracking-wider"
        >
          Active
        </span>
        <span
          class="ml-auto shrink-0 tabular-nums whitespace-nowrap font-semibold"
          :class="entry.isActive ? 'text-emerald-400' : 'text-(--app-muted)'"
        >
          <template v-if="entry.score !== null">
            {{ entry.latencyMs > 0 ? entry.latencyMs.toFixed(0) + "ms" : "new" }}
            <span class="opacity-50">/</span>
            {{ (entry.score * 100).toFixed(0) }}%
          </template>
          <template v-else> untested </template>
        </span>
      </div>
    </div>

    <div v-else class="flex items-center gap-2 px-4 py-3">
      <p class="text-xs text-(--app-muted)">No relay data yet. Send a message to start ranking.</p>
    </div>
  </div>
</template>
