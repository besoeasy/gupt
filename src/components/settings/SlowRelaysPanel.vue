<script setup>
import { ref, computed, onMounted } from "vue";
import { AlertTriangle, RefreshCw, Wifi } from "lucide-vue-next";
import { getRelayHealthSummary } from "@/lib/idb";

const rows = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const all = await getRelayHealthSummary();
    // Keep only relays with enough data and known bad/degraded performance.
    // Sort worst first (already done by getRelayHealthSummary), take top 5.
    rows.value = all
      .filter((r) => r.tier === "replace" || r.tier === "degraded")
      .slice(0, 5);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// Colour + label per tier
function tierStyle(tier) {
  if (tier === "replace")  return { label: "Poor",     dot: "bg-red-500",    bar: "bg-red-500",    text: "text-red-400" };
  if (tier === "degraded") return { label: "Slow",     dot: "bg-amber-400",  bar: "bg-amber-400",  text: "text-amber-400" };
  return                          { label: "Unknown",  dot: "bg-zinc-500",   bar: "bg-zinc-500",   text: "text-zinc-400" };
}

// How much a relay is slowing us down relative to "good" (roughly <300 ms publish).
// Returns a string like "+1.2 s" or null if no latency data.
function slowdown(entry) {
  if (!entry.avgPublishMs) return null;
  const BASELINE_MS = 300;
  const delta = entry.avgPublishMs - BASELINE_MS;
  if (delta <= 0) return null;
  return delta >= 1000
    ? `+${(delta / 1000).toFixed(1)} s`
    : `+${delta} ms`;
}

// Width of the success-rate bar (0-100%).
function barWidth(rate) {
  return `${Math.max(2, rate ?? 0)}%`;
}

// Trim relay URL for display.
function shortUrl(url) {
  return url.replace(/^wss?:\/\//, "").replace(/\/$/, "");
}
</script>

<template>
  <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-(--app-border)">
      <div class="flex items-center gap-2">
        <AlertTriangle class="h-4 w-4 text-amber-400 shrink-0" :stroke-width="2" />
        <p class="text-sm font-semibold text-(--app-text)">Underperforming relays</p>
      </div>
      <button
        @click="load"
        class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors"
        :class="{ 'animate-spin': loading }"
        title="Refresh"
      >
        <RefreshCw class="h-3.5 w-3.5" :stroke-width="2" />
      </button>
    </div>

    <!-- No data -->
    <div
      v-if="!loading && rows.length === 0"
      class="flex flex-col items-center gap-2 px-4 py-8 text-center"
    >
      <Wifi class="h-7 w-7 text-emerald-400" :stroke-width="1.5" />
      <p class="text-sm font-semibold text-(--app-text)">All relays performing well</p>
      <p class="text-xs text-(--app-muted)">
        No underperforming relays detected. Data is collected automatically as you send messages.
      </p>
    </div>

    <!-- Relay rows -->
    <ul v-else class="divide-y divide-(--app-border)">
      <li
        v-for="entry in rows"
        :key="entry.relay"
        class="px-4 py-3 space-y-2"
      >
        <!-- URL + tier badge -->
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :class="tierStyle(entry.tier).dot"
          />
          <p
            class="min-w-0 flex-1 truncate font-mono text-xs text-(--app-text)"
            :title="entry.relay"
          >
            {{ shortUrl(entry.relay) }}
          </p>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            :class="tierStyle(entry.tier).text"
          >
            {{ tierStyle(entry.tier).label }}
          </span>
        </div>

        <!-- Success rate bar -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px] text-(--app-muted)">
            <span>Publish success rate</span>
            <span class="tabular-nums font-semibold" :class="tierStyle(entry.tier).text">
              {{ entry.publishSuccessRate ?? "—" }}{{ entry.publishSuccessRate != null ? "%" : "" }}
            </span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-(--app-surface)">
            <div
              class="h-1.5 rounded-full transition-all duration-500"
              :class="tierStyle(entry.tier).bar"
              :style="{ width: barWidth(entry.publishSuccessRate) }"
            />
          </div>
        </div>

        <!-- Stats row -->
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-(--app-muted)">
          <span v-if="entry.avgPublishMs" class="tabular-nums">
            avg {{ entry.avgPublishMs }} ms
          </span>
          <span v-if="slowdown(entry)" class="text-red-400 font-semibold tabular-nums">
            {{ slowdown(entry) }} vs healthy
          </span>
          <span class="tabular-nums">
            {{ entry.publishFail }} failed sends
          </span>
          <span v-if="entry.lastError" class="truncate max-w-[200px]" :title="entry.lastError">
            {{ entry.lastError }}
          </span>
        </div>
      </li>
    </ul>

    <!-- Footer hint -->
    <p
      v-if="rows.length > 0"
      class="px-4 py-2.5 text-[11px] text-(--app-muted) border-t border-(--app-border)"
    >
      You can remove these relays from the relay list to improve send speed.
    </p>
  </div>
</template>
