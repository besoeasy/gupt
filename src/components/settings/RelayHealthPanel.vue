<script setup>
import { computed, onMounted, ref } from "vue";
import { RefreshCw } from "lucide-vue-next";
import { DEFAULT_RELAYS } from "@/config/servers";
import { getKnownRelays } from "@/lib/api";
import { getRelayHealthSummary } from "@/lib/idb";
import {
  formatTrafficRate,
  probeBadgeClass,
  probeRelay,
  tierDot,
  trafficTierBadgeClass,
} from "@/lib/relayHealth";

const relayResults = ref([]);
const relayTrafficByUrl = ref({});
const relayChecking = ref(false);
const relayCheckedAt = ref(null);

function relayList() {
  const known = getKnownRelays();
  return known.length ? known : [...DEFAULT_RELAYS];
}

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

function trafficFor(url) {
  return relayTrafficByUrl.value[String(url || "")] || null;
}

const relaysToReplace = computed(() =>
  Object.values(relayTrafficByUrl.value).filter((entry) => entry.tier === "replace"),
);

const relaysDegraded = computed(() =>
  Object.values(relayTrafficByUrl.value).filter((entry) => entry.tier === "degraded"),
);

const relaysHealthy = computed(() =>
  Object.values(relayTrafficByUrl.value).filter((entry) => entry.tier === "good"),
);

const mergedRelayRows = computed(() => {
  const trafficRank = { replace: 0, degraded: 1, unknown: 2, good: 3 };
  const probeRank = { offline: 0, slow: 1, ok: 2, fast: 3, checking: 4 };

  return relayResults.value
    .map((probe) => {
      const traffic = trafficFor(probe.url);
      return {
        url: probe.url,
        label: probe.url.replace(/^wss:\/\//i, ""),
        probe,
        traffic,
      };
    })
    .sort((left, right) => {
      const leftTrafficRank = trafficRank[left.traffic?.tier] ?? 2;
      const rightTrafficRank = trafficRank[right.traffic?.tier] ?? 2;
      if (leftTrafficRank !== rightTrafficRank) return leftTrafficRank - rightTrafficRank;

      const leftProbeRank = probeRank[left.probe.tier] ?? 4;
      const rightProbeRank = probeRank[right.probe.tier] ?? 4;
      if (leftProbeRank !== rightProbeRank) return leftProbeRank - rightProbeRank;

      return left.label.localeCompare(right.label);
    });
});

async function checkRelays() {
  if (relayChecking.value) return;
  relayChecking.value = true;
  const relays = relayList();
  relayResults.value = relays.map((url) => ({ url, ms: null, tier: "checking" }));
  await Promise.allSettled(
    relays.map((url, i) =>
      probeRelay(url)
        .then((result) => {
          relayResults.value[i] = result;
        })
        .catch(() => {
          relayResults.value[i] = { url, ms: null, tier: "offline" };
        }),
    ),
  );
  relayCheckedAt.value = new Date();
  relayChecking.value = false;
  await loadRelayTrafficStats();
}

const checkedAtLabel = computed(() => {
  if (!relayCheckedAt.value) return null;
  return relayCheckedAt.value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
});

onMounted(() => {
  void loadRelayTrafficStats();
  void checkRelays();
});
</script>

<template>
  <div class="ui-panel rounded-2xl p-4 space-y-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-sm font-semibold">Relay Health</p>
        <p class="text-[11px] text-zinc-500 mt-0.5">
          Live probe + 90-day traffic stats · worst relays first
        </p>
        <p v-if="checkedAtLabel" class="text-[11px] text-zinc-600 mt-0.5">
          Probed at {{ checkedAtLabel }}
        </p>
      </div>
      <button
        id="relay-refresh-btn"
        type="button"
        :disabled="relayChecking"
        class="ui-icon-button inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-50"
        @click="checkRelays"
      >
        <RefreshCw
          :class="relayChecking ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'"
          :stroke-width="1.9"
          aria-hidden="true"
        />
        {{ relayChecking ? "Checking…" : "Refresh" }}
      </button>
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
      <div v-for="row in mergedRelayRows" :key="row.url" class="relay-pill-row">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="shrink-0 h-2 w-2 rounded-full" :class="tierDot(row.probe.tier)" />
          <p class="truncate font-mono text-xs text-(--app-text-soft)" :title="row.url">
            {{ row.label }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1.5 flex-wrap justify-end">
          <span
            class="relay-pill"
            :class="probeBadgeClass(row.probe.tier)"
            :title="
              row.probe.tier === 'checking'
                ? 'Checking…'
                : row.probe.ms !== null
                  ? row.probe.ms + ' ms'
                  : 'No response'
            "
          >
            Ping
            <span v-if="row.probe.ms !== null" class="opacity-70">{{ row.probe.ms }}ms</span>
            <span v-else-if="row.probe.tier === 'checking'" class="opacity-70">…</span>
            <span v-else class="opacity-70">—</span>
          </span>

          <span
            v-if="row.traffic"
            class="relay-pill"
            :class="trafficTierBadgeClass(row.traffic.tier)"
            :title="
              'Publish ' +
              formatTrafficRate(row.traffic.publishSuccessRate) +
              ' · ' +
              row.traffic.publishOk +
              '/' +
              row.traffic.publishTotal
            "
          >
            Pub
            <span class="opacity-70">{{ formatTrafficRate(row.traffic.publishSuccessRate) }}</span>
          </span>
          <span v-else class="relay-pill relay-pill-muted">Pub —</span>

          <span
            v-if="row.traffic?.connectTotal"
            class="relay-pill relay-pill-muted"
            :title="
              'Connect ' +
              formatTrafficRate(row.traffic.connectSuccessRate) +
              ' · ' +
              row.traffic.connectOk +
              '/' +
              row.traffic.connectTotal
            "
          >
            Con
            <span class="opacity-70">{{ formatTrafficRate(row.traffic.connectSuccessRate) }}</span>
          </span>
          <span v-else class="relay-pill relay-pill-muted">Con —</span>
        </div>
      </div>
    </div>

    <div v-else class="py-8 text-center text-sm text-zinc-500">No relays configured.</div>

    <p class="text-[10px] leading-relaxed text-zinc-600">
      <span class="text-zinc-500">Probe:</span> WebSocket open time (fast &lt; 150 ms, OK &lt; 500
      ms). <span class="text-zinc-500">Traffic:</span> real publish/connect/query results from the
      last 90 days. Send messages to populate publish stats.
    </p>
  </div>
</template>

<style scoped>
.relay-pill-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 0.75rem;
  border: 1px solid var(--app-border);
  background: var(--app-surface-soft);
  transition: background 0.15s;
}
.relay-pill-row:hover {
  background: var(--app-surface-hover);
}

.relay-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 9999px;
  padding: 0.125rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.4;
}

.relay-pill-muted {
  background: var(--app-surface-soft);
  color: var(--app-muted);
}
</style>