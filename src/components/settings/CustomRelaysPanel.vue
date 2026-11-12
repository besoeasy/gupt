<script setup>
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { ArrowUpRight, Plus, X, Loader2, RotateCcw, RefreshCw } from "@lucide/vue";
import {
  getCustomRelays,
  addCustomRelay,
  removeCustomRelay,
  normalizeRelay,
  probeRelayConnections,
} from "@/lib/relay";
import { saveConfiguredRelays, DEFAULT_RELAYS } from "@/config/servers";
import { getRelayHealthSummary, getRelayRanking } from "@/lib/idb";
import { EXPLOIT_SLOTS, EXPLORE_SLOTS, formatTrafficRate, tierBadgeClass } from "@/lib/relay";

const customRelays = ref([]);
const newRelayUrl = ref("");
const adding = ref(false);
const probing = ref(false);
const errorKey = ref("");
const relayTrafficByUrl = ref({});
const relayScoreByUrl = ref({});
const activeRelayUrls = ref(new Set());

function load() {
  customRelays.value = getCustomRelays();
}

async function loadStats() {
  try {
    const [health, ranking] = await Promise.all([getRelayHealthSummary(), getRelayRanking()]);
    const next = {};
    for (const row of health) {
      if (row?.relay) next[row.relay] = row;
    }
    relayTrafficByUrl.value = next;

    const rankedSet = new Set(ranking.map((row) => row.relay));
    const scores = {};
    for (const row of ranking) scores[row.relay] = row.score;
    relayScoreByUrl.value = scores;

    const active = new Set();
    if (ranking.length) {
      for (const row of ranking.slice(0, EXPLOIT_SLOTS)) active.add(row.relay);
      const untested = customRelays.value.filter((url) => !rankedSet.has(url));
      for (const url of untested.slice(0, EXPLORE_SLOTS)) active.add(url);
    } else {
      for (const url of customRelays.value) active.add(url);
    }
    activeRelayUrls.value = active;
  } catch {
    // stale data is fine
  }
}

function trafficFor(url) {
  return relayTrafficByUrl.value[String(url || "")] || null;
}

function scoreColor(score) {
  if (score === null) return "var(--app-muted-2)";
  if (score >= 0.7) return "var(--app-success)";
  if (score >= 0.4) return "var(--app-warning)";
  return "var(--app-danger)";
}

function rateTextClass(rate) {
  if (rate === null || rate === undefined) return "text-zinc-600";
  if (rate >= 80) return "text-emerald-400";
  if (rate >= 50) return "text-yellow-400";
  return "text-red-400";
}

function tierLabel(tier) {
  if (tier === "good") return "Good";
  if (tier === "degraded") return "Degraded";
  if (tier === "poor") return "Poor";
  return "New";
}

function latencyFor(traffic) {
  if (!traffic) return null;
  const values = [traffic.avgPublishMs, traffic.avgQueryMs, traffic.avgConnectMs].filter(
    (value) => Number(value) > 0,
  );
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + Number(value), 0) / values.length);
}

function latencyTitle(traffic) {
  if (!traffic) return "";
  const parts = [];
  if (traffic.avgPublishMs) parts.push(`publish ${traffic.avgPublishMs} ms`);
  if (traffic.avgQueryMs) parts.push(`query ${traffic.avgQueryMs} ms`);
  if (traffic.avgConnectMs) parts.push(`connect ${traffic.avgConnectMs} ms`);
  return parts.join(" · ");
}

const rows = computed(() =>
  customRelays.value.map((url) => {
    const traffic = trafficFor(url);
    return {
      url,
      label: url.replace(/^https?:\/\//i, ""),
      traffic,
      score: relayScoreByUrl.value[url] ?? null,
      tier: traffic?.tier || "unknown",
      latencyMs: latencyFor(traffic),
      isActive: activeRelayUrls.value.has(url),
    };
  }),
);

const activeCount = computed(() => rows.value.filter((row) => row.isActive).length);

onMounted(() => {
  load();
  loadStats();
});

function handleAdd() {
  const raw = newRelayUrl.value.trim();
  errorKey.value = "";
  if (!raw) return;

  const normalized = normalizeRelay(raw);
  if (!normalized) {
    errorKey.value = "invalid";
    return;
  }
  if (customRelays.value.includes(normalized)) {
    errorKey.value = "duplicate";
    return;
  }

  adding.value = true;
  errorKey.value = "";
  try {
    addCustomRelay(raw);
    newRelayUrl.value = "";
    load();
    loadStats();
  } finally {
    adding.value = false;
  }
}

function handleRemove(url) {
  removeCustomRelay(url);
  load();
  loadStats();
}

function handleResetDefaults() {
  saveConfiguredRelays(DEFAULT_RELAYS);
  load();
  loadStats();
}

async function handleProbe() {
  if (probing.value || !customRelays.value.length) return;
  probing.value = true;
  try {
    await probeRelayConnections(customRelays.value);
    await loadStats();
  } finally {
    probing.value = false;
  }
}
</script>

<template>
  <div class="space-y-1">
    <div class="flex flex-wrap items-center justify-between gap-2 px-1">
      <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600 tabular-nums">
        {{ customRelays.length }} configured
        <span class="text-zinc-700">·</span>
        <span :class="activeCount ? 'text-emerald-400' : ''">{{ activeCount }} active</span>
      </p>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1 font-mono text-[10px] text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-40"
          title="Probe every relay now"
          :disabled="probing || !customRelays.length"
          @click="handleProbe"
        >
          <RefreshCw class="h-3 w-3" :class="probing ? 'animate-spin' : ''" :stroke-width="2" />
          Probe
        </button>
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1 font-mono text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
          title="Reset to default relays"
          @click="handleResetDefaults"
        >
          <RotateCcw class="h-3 w-3" :stroke-width="2" />
          Reset
        </button>
      </div>
    </div>

    <div v-if="rows.length" class="divide-y divide-zinc-800/70">
      <div v-for="row in rows" :key="row.url" class="group py-3">
        <div class="flex items-center gap-2.5">
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            :class="row.isActive ? 'bg-emerald-400' : 'bg-zinc-600'"
          />

          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center gap-1.5">
              <p class="truncate font-mono text-xs text-zinc-200" :title="row.url">
                {{ row.label }}
              </p>
              <span
                v-if="row.isActive"
                class="shrink-0 font-mono text-[9px] uppercase tracking-wider text-emerald-400"
              >
                active
              </span>
            </div>

            <div
              class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tabular-nums"
            >
              <span class="shrink-0 rounded px-1.5 py-0.5" :class="tierBadgeClass(row.tier)">
                {{ tierLabel(row.tier) }}
              </span>
              <span class="text-zinc-600">
                pub
                <span :class="rateTextClass(row.traffic?.publishSuccessRate)">
                  {{ formatTrafficRate(row.traffic?.publishSuccessRate) }}
                </span>
              </span>
              <span class="text-zinc-600">
                qry
                <span :class="rateTextClass(row.traffic?.querySuccessRate)">
                  {{ formatTrafficRate(row.traffic?.querySuccessRate) }}
                </span>
              </span>
              <span class="text-zinc-600">
                con
                <span :class="rateTextClass(row.traffic?.connectSuccessRate)">
                  {{ formatTrafficRate(row.traffic?.connectSuccessRate) }}
                </span>
              </span>
              <span
                v-if="row.latencyMs !== null"
                class="text-zinc-500"
                :title="latencyTitle(row.traffic)"
              >
                {{ row.latencyMs }}ms
              </span>
            </div>
          </div>

          <span class="flex shrink-0 items-center gap-1.5">
            <span class="hidden h-1 w-10 overflow-hidden rounded-full bg-zinc-800 sm:block">
              <span
                class="block h-full rounded-full"
                :style="{
                  width: `${Math.round((row.score ?? 0) * 100)}%`,
                  background: scoreColor(row.score),
                }"
              />
            </span>
            <span
              class="w-8 text-right font-mono text-[10px] tabular-nums"
              :style="{ color: scoreColor(row.score) }"
              title="Combined relay score"
            >
              {{ row.score === null ? "—" : `${Math.round(row.score * 100)}%` }}
            </span>
          </span>

          <button
            type="button"
            class="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent text-zinc-500 transition-colors hover:border-zinc-800 hover:text-red-400"
            title="Remove relay"
            @click="handleRemove(row.url)"
          >
            <X class="h-3 w-3" :stroke-width="2" />
          </button>
        </div>

        <p
          v-if="row.traffic?.lastError"
          class="mt-1.5 truncate pl-4 font-mono text-[10px] text-zinc-600"
          :title="row.traffic.lastError"
        >
          Last error: {{ row.traffic.lastError }}
        </p>
      </div>
    </div>

    <div v-else class="px-1 py-5 text-center font-mono text-[11px] text-zinc-600">
      No relays configured.
    </div>

    <div class="flex items-center gap-2 px-1 pt-2">
      <input
        v-model="newRelayUrl"
        type="url"
        placeholder="https://relay.example.com"
        aria-label="Relay URL"
        spellcheck="false"
        class="block h-9 min-w-0 flex-1 rounded-lg border border-dashed border-zinc-800 bg-transparent px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none"
        @keydown.enter="handleAdd"
      />
      <button
        type="button"
        :disabled="!newRelayUrl.trim() || adding"
        class="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40"
        @click="handleAdd"
      >
        <Loader2 v-if="adding" class="h-3.5 w-3.5 animate-spin" :stroke-width="2" />
        <Plus v-else class="h-3.5 w-3.5" :stroke-width="2" />
        Add
      </button>
    </div>

    <p v-if="errorKey === 'invalid'" class="px-1 pt-1 text-[11px] text-red-400">
      Enter a valid Rabta node URL (https://...)
    </p>
    <p v-else-if="errorKey === 'duplicate'" class="px-1 pt-1 text-[11px] text-red-400">
      This relay is already in the list.
    </p>

    <RouterLink
      to="/stats"
      class="mt-1 inline-flex items-center gap-1 px-1 font-mono text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
    >
      Detailed relay analytics
      <ArrowUpRight class="h-3 w-3" :stroke-width="2" />
    </RouterLink>
  </div>
</template>
