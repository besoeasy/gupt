<script setup>
import { ref, onMounted } from "vue";
import { AlertTriangle, RefreshCw, Wifi } from "lucide-vue-next";
import { getRelayHealthSummary } from "@/lib/idb";

const rows = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const all = await getRelayHealthSummary();
    rows.value = all
      .filter((r) => r.tier === "replace" || r.tier === "degraded")
      .slice(0, 5);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function tierStyle(tier) {
  if (tier === "replace")  return { label: "Poor", text: "text-red-400"   };
  if (tier === "degraded") return { label: "Slow", text: "text-amber-400" };
  return                          { label: "?",    text: "text-zinc-500"  };
}

function slowdown(entry) {
  if (!entry.avgPublishMs) return null;
  const delta = entry.avgPublishMs - 300;
  if (delta <= 0) return null;
  return delta >= 1000 ? `+${(delta / 1000).toFixed(1)}s` : `+${delta}ms`;
}

</script>

<template>
  <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-(--app-border)">
      <div class="flex items-center gap-1.5">
        <AlertTriangle class="h-3.5 w-3.5 text-amber-400 shrink-0" :stroke-width="2" />
        <p class="text-xs font-semibold text-(--app-text)">Underperforming relays</p>
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

    <!-- Empty -->
    <div v-if="!loading && rows.length === 0" class="flex items-center gap-2 px-4 py-3">
      <Wifi class="h-3.5 w-3.5 text-emerald-400 shrink-0" :stroke-width="2" />
      <p class="text-xs text-(--app-muted)">All relays performing well — data builds as you send messages.</p>
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
        <tr v-for="entry in rows" :key="entry.relay" class="hover:bg-(--app-surface-hover) transition-colors">
          <td class="px-4 py-2 max-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="shrink-0 rounded px-1.5 py-0.5 font-bold uppercase tracking-wide text-[9px]" :class="tierStyle(entry.tier).text">
                {{ tierStyle(entry.tier).label }}
              </span>
              <span class="truncate font-mono text-(--app-text)" :title="entry.relay">
                {{ entry.relay }}
              </span>
            </div>
          </td>
          <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap" :class="tierStyle(entry.tier).text">
            {{ entry.publishSuccessRate != null ? entry.publishSuccessRate + "%" : "—" }}
          </td>
          <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap text-(--app-muted)">
            {{ entry.avgPublishMs ? entry.avgPublishMs + "ms" : "—" }}
          </td>
          <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap text-red-400 font-semibold">
            {{ slowdown(entry) ?? "—" }}
          </td>
          <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap text-(--app-muted)">
            {{ entry.publishFail }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
