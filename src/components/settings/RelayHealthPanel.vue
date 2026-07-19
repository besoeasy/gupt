<script setup>
import { computed, onMounted, ref } from "vue";
import { DEFAULT_RELAYS } from "@/config/servers";
import { getKnownRelays, tierDotClass, tierBadgeClass, formatTrafficRate } from "@/lib/relay";
import { getRelayHealthSummary } from "@/lib/idb";

const relayTrafficByUrl = ref({});

async function loadRelayTrafficStats() {
  try {
    const rows = await getRelayHealthSummary();
    const next = {};
    for (const row of rows) {
      if (row?.relay) next[row.relay] = row;
    }
    relayTrafficByUrl.value = next;
  } catch {
    relayTrafficByUrl.value = {};
  }
}

function relayList() {
  const known = getKnownRelays();
  return known.length ? known : [...DEFAULT_RELAYS];
}

const trafficRank = { replace: 0, degraded: 1, unknown: 2, good: 3 };

const mergedRelayRows = computed(() => {
  const seen = new Set();
  const rows = [];
  for (const url of relayList()) {
    seen.add(url);
    const traffic = relayTrafficByUrl.value[String(url || "")] || null;
    rows.push({
      url,
      label: url.replace(/^wss:\/\//i, ""),
      traffic,
    });
  }
  for (const [url, traffic] of Object.entries(relayTrafficByUrl.value)) {
    if (seen.has(url)) continue;
    rows.push({
      url,
      label: url.replace(/^wss:\/\//i, ""),
      traffic,
    });
  }
  return rows.sort((left, right) => {
    const leftRank = trafficRank[left.traffic?.tier] ?? 2;
    const rightRank = trafficRank[right.traffic?.tier] ?? 2;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.label.localeCompare(right.label);
  });
});

const relaysToReplace = computed(() =>
  Object.values(relayTrafficByUrl.value).filter((entry) => entry.tier === "replace"),
);

const relaysDegraded = computed(() =>
  Object.values(relayTrafficByUrl.value).filter((entry) => entry.tier === "degraded"),
);

const relaysHealthy = computed(() =>
  Object.values(relayTrafficByUrl.value).filter((entry) => entry.tier === "good"),
);

onMounted(() => {
  void loadRelayTrafficStats();
});
</script>

<template>
  <div
    class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-4"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-sm font-semibold">Relay Health</p>
        <p class="text-[11px] text-zinc-500 mt-0.5">90-day traffic stats · worst relays first</p>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div class="rounded-xl bg-(--app-surface-soft) px-3 py-2">
        <p class="text-lg font-bold tabular-nums">{{ mergedRelayRows.length }}</p>
        <p class="text-[10px] text-zinc-500">Relays</p>
      </div>
      <div class="rounded-xl bg-emerald-500/8 px-3 py-2">
        <p class="text-lg font-bold tabular-nums text-emerald-400">{{ relaysHealthy.length }}</p>
        <p class="text-[10px] text-zinc-500">Healthy</p>
      </div>
      <div class="rounded-xl bg-yellow-500/8 px-3 py-2">
        <p class="text-lg font-bold tabular-nums text-yellow-400">{{ relaysDegraded.length }}</p>
        <p class="text-[10px] text-zinc-500">Degraded</p>
      </div>
      <div class="rounded-xl bg-red-500/8 px-3 py-2">
        <p class="text-lg font-bold tabular-nums text-red-400">{{ relaysToReplace.length }}</p>
        <p class="text-[10px] text-zinc-500">Replace</p>
      </div>
    </div>

    <div
      v-if="relaysToReplace.length"
      class="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-300"
    >
      {{ relaysToReplace.length }} relay{{ relaysToReplace.length === 1 ? "" : "s" }} with
      consistently low publish success — swap them out of your relay list.
    </div>

    <div v-if="mergedRelayRows.length" class="space-y-1.5">
      <div
        v-for="row in mergedRelayRows"
        :key="row.url"
        class="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) transition-colors duration-150 hover:bg-(--app-surface-hover)"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="shrink-0 h-2 w-2 rounded-full" :class="tierDotClass(row.traffic?.tier)" />
          <p class="truncate font-mono text-xs text-(--app-text-soft)" :title="row.url">
            {{ row.label }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1.5 flex-wrap justify-end">
          <span
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap leading-tight tabular-nums"
            :class="
              row.traffic
                ? tierBadgeClass(row.traffic.tier)
                : 'bg-(--app-surface-soft) text-(--app-muted)'
            "
            :title="
              row.traffic
                ? 'Publish ' +
                  formatTrafficRate(row.traffic.publishSuccessRate) +
                  ' · ' +
                  row.traffic.publishOk +
                  '/' +
                  row.traffic.publishTotal
                : 'No traffic recorded yet'
            "
          >
            Pub
            <span class="opacity-70">
              {{ row.traffic ? formatTrafficRate(row.traffic.publishSuccessRate) : "—" }}
            </span>
          </span>

          <span
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap leading-tight tabular-nums bg-(--app-surface-soft) text-(--app-muted)"
            :title="
              row.traffic?.connectTotal
                ? 'Connect ' +
                  formatTrafficRate(row.traffic.connectSuccessRate) +
                  ' · ' +
                  row.traffic.connectOk +
                  '/' +
                  row.traffic.connectTotal
                : 'No connect samples yet'
            "
          >
            Con
            <span class="opacity-70">
              {{
                row.traffic?.connectTotal ? formatTrafficRate(row.traffic.connectSuccessRate) : "—"
              }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <div v-else class="py-8 text-center text-sm text-zinc-500">No relays configured.</div>

    <p class="text-[10px] leading-relaxed text-zinc-600">
      Health is derived from real publish/connect/query outcomes recorded in the last 90 days. Send
      messages to populate publish stats.
    </p>
  </div>
</template>
