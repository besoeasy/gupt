<script setup>
import { ref, computed, onMounted } from "vue";
import { AlertTriangle, RefreshCw, Wifi, TrendingDown, TrendingUp, Antenna } from "@lucide/vue";
import { getRelayHealthSummary } from "@/lib/idb";
import { getActiveRelays } from "@/lib/relay";

const all = ref([]);
const loading = ref(false);
const activeTab = ref("worst");

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

// Worst 5: replace or degraded tiers (already sorted worst-first)
const worstRows = computed(() =>
  all.value.filter((r) => r.tier === "replace" || r.tier === "degraded").slice(0, 5),
);

// Best 5: good tier, sorted by success rate desc then avgPublishMs asc
const bestRows = computed(() => {
  const good = all.value.filter((r) => r.tier === "good");
  return good
    .sort((a, b) => {
      const rateA = a.publishSuccessRate ?? 0;
      const rateB = b.publishSuccessRate ?? 0;
      if (rateB !== rateA) return rateB - rateA;
      return (a.avgPublishMs ?? Infinity) - (b.avgPublishMs ?? Infinity);
    })
    .slice(0, 5);
});

const rows = computed(() => (activeTab.value === "worst" ? worstRows.value : bestRows.value));

function tierStyle(tier) {
  if (tier === "replace") return { label: "Poor", text: "text-red-400" };
  if (tier === "degraded") return { label: "Slow", text: "text-amber-400" };
  if (tier === "good") return { label: "Good", text: "text-emerald-400" };
  return { label: "?", text: "text-zinc-500" };
}

function slowdown(entry) {
  if (!entry.avgPublishMs) return null;
  const delta = entry.avgPublishMs - 300;
  if (delta <= 0) return null;
  return delta >= 1000 ? `+${(delta / 1000).toFixed(1)}s` : `+${delta}ms`;
}

const activeRelays = ref([]);

function refreshActive() {
  activeRelays.value = getActiveRelays();
}

const sortedActiveRelays = computed(() => {
  return [...activeRelays.value].sort((a, b) => {
    const la = latencyMap.value[a] ?? Infinity;
    const lb = latencyMap.value[b] ?? Infinity;
    return la - lb;
  });
});

const latencyMap = computed(() => {
  const map = {};
  for (const row of all.value) {
    map[row.relay] = row.avgPublishMs || row.avgConnectMs || null;
  }
  return map;
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
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-(--app-border)">
      <div class="flex items-center gap-1.5">
        <AlertTriangle class="h-3.5 w-3.5 text-amber-400 shrink-0" :stroke-width="2" />
        <p class="text-xs font-semibold text-(--app-text)">Relay Performance</p>
      </div>
      <button
        @click="load"
        class="inline-flex h-6 w-6 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors"
        :class="{ 'animate-spin': loading }"
        title="Refresh"
      >
        <RefreshCw class="h-3 w-3" :stroke-width="2" />
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-(--app-border)">
      <button
        @click="activeTab = 'worst'"
        class="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium transition-colors"
        :class="
          activeTab === 'worst'
            ? 'text-red-400 border-b-2 border-red-400 -mb-px'
            : 'text-(--app-muted) hover:text-(--app-text)'
        "
      >
        <TrendingDown class="h-3 w-3" :stroke-width="2" />
        Worst 5
        <span
          v-if="worstRows.length"
          class="ml-0.5 rounded-full bg-red-400/15 px-1.5 py-px text-[9px] font-bold text-red-400"
          >{{ worstRows.length }}</span
        >
      </button>
      <button
        @click="activeTab = 'best'"
        class="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium transition-colors"
        :class="
          activeTab === 'best'
            ? 'text-emerald-400 border-b-2 border-emerald-400 -mb-px'
            : 'text-(--app-muted) hover:text-(--app-text)'
        "
      >
        <TrendingUp class="h-3 w-3" :stroke-width="2" />
        Best 5
        <span
          v-if="bestRows.length"
          class="ml-0.5 rounded-full bg-emerald-400/15 px-1.5 py-px text-[9px] font-bold text-emerald-400"
          >{{ bestRows.length }}</span
        >
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="!loading && rows.length === 0" class="flex items-center gap-2 px-4 py-3">
      <Wifi class="h-3.5 w-3.5 text-emerald-400 shrink-0" :stroke-width="2" />
      <p class="text-xs text-(--app-muted)">
        <template v-if="activeTab === 'worst'">
          All relays performing well — data builds as you send messages.
        </template>
        <template v-else>
          No healthy relays tracked yet — data builds as you send messages.
        </template>
      </p>
    </div>

    <!-- Table -->
    <table v-else class="w-full text-[11px]">
      <thead>
        <tr class="border-b border-(--app-border) text-(--app-muted)">
          <th class="px-4 py-1.5 text-left font-medium">Relay</th>
          <th class="px-3 py-1.5 text-right font-medium">Success</th>
          <th class="px-3 py-1.5 text-right font-medium">Avg</th>
          <th class="px-3 py-1.5 text-right font-medium">Slowdown</th>
          <th class="px-3 py-1.5 text-right font-medium">Failed</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-(--app-border)">
        <tr
          v-for="entry in rows"
          :key="entry.relay"
          class="hover:bg-(--app-surface-hover) transition-colors"
        >
          <td class="px-4 py-2">
            <div class="flex items-center gap-1.5">
              <span
                class="shrink-0 rounded px-1.5 py-0.5 font-bold uppercase tracking-wide text-[9px]"
                :class="tierStyle(entry.tier).text"
              >
                {{ tierStyle(entry.tier).label }}
              </span>
              <span class="break-all font-mono text-(--app-text)">
                {{ entry.relay }}
              </span>
            </div>
          </td>
          <td
            class="px-3 py-2 text-right tabular-nums whitespace-nowrap"
            :class="tierStyle(entry.tier).text"
          >
            {{ entry.publishSuccessRate != null ? entry.publishSuccessRate + "%" : "—" }}
          </td>
          <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap text-(--app-muted)">
            {{ entry.avgPublishMs ? entry.avgPublishMs + "ms" : "—" }}
          </td>
          <td
            class="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold"
            :class="activeTab === 'best' ? 'text-emerald-400' : 'text-red-400'"
          >
            {{ activeTab === "best" ? (slowdown(entry) ? "—" : "✓") : (slowdown(entry) ?? "—") }}
          </td>
          <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap text-(--app-muted)">
            {{ entry.publishFail }}
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Active Relays -->
    <div class="border-t border-(--app-border)">
      <div class="flex items-center justify-between px-4 py-2.5">
        <div class="flex items-center gap-1.5">
          <Antenna class="h-3.5 w-3.5 text-emerald-400 shrink-0" :stroke-width="2" />
          <p class="text-xs font-semibold text-(--app-text)">Active Relays</p>
          <span
            class="ml-0.5 rounded-full bg-emerald-400/15 px-1.5 py-px text-[9px] font-bold text-emerald-400"
            >{{ activeRelays.length }}</span
          >
        </div>
        <button
          @click="refreshActive"
          class="inline-flex h-6 w-6 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors"
          title="Refresh"
        >
          <RefreshCw class="h-3 w-3" :stroke-width="2" />
        </button>
      </div>

      <div v-if="activeRelays.length" class="px-3 pb-3 space-y-1">
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
      <div v-else class="flex items-center gap-2 px-4 pb-3">
        <p class="text-xs text-(--app-muted)">No active connections yet.</p>
      </div>
    </div>
  </div>
</template>
