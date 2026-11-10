<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, X, Loader2, RotateCcw } from "@lucide/vue";
import { getCustomRelays, addCustomRelay, removeCustomRelay, normalizeRelay } from "@/lib/relay";
import { saveConfiguredRelays, DEFAULT_RELAYS } from "@/config/servers";
import { getRelayHealthSummary, getRelayRanking } from "@/lib/idb";
import { EXPLOIT_SLOTS, EXPLORE_SLOTS, formatTrafficRate } from "@/lib/relay";

const customRelays = ref([]);
const newRelayUrl = ref("");
const adding = ref(false);
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

const rows = computed(() =>
  customRelays.value.map((url) => ({
    url,
    label: url.replace(/^https?:\/\//i, ""),
    traffic: trafficFor(url),
    score: relayScoreByUrl.value[url] ?? null,
    isActive: activeRelayUrls.value.has(url),
  })),
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
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between px-1">
      <p class="font-mono text-[11px] text-zinc-500 tabular-nums">
        {{ customRelays.length }} configured
        <span class="text-zinc-700">·</span>
        <span :class="activeCount ? 'text-emerald-400' : ''">{{ activeCount }} active</span>
      </p>
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer tabular-nums"
        title="Reset to default relays"
        @click="handleResetDefaults"
      >
        <RotateCcw class="h-3 w-3" :stroke-width="2" />
        Reset
      </button>
    </div>

    <div v-if="rows.length" class="space-y-2">
      <div
        v-for="row in rows"
        :key="row.url"
        class="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 transition-colors duration-150 hover:border-zinc-700 sm:p-3.5"
      >
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <span
              class="h-1.5 w-1.5 shrink-0 rounded-full"
              :class="row.isActive ? 'bg-emerald-400' : 'bg-zinc-600'"
            />
            <p class="truncate font-mono text-xs text-zinc-200 sm:text-sm" :title="row.url">
              {{ row.label }}
            </p>
            <span
              v-if="row.isActive"
              class="shrink-0 font-mono text-[10px] uppercase tracking-wider text-emerald-400"
            >
              Active
            </span>
          </div>
          <p class="mt-0.5 truncate font-mono text-[11px] text-zinc-500 tabular-nums">
            {{ row.score === null ? "No samples yet" : `${(row.score * 100).toFixed(0)}% score` }}
            <template v-if="row.traffic?.publishTotal">
              <span class="text-zinc-700">·</span>
              Pub {{ formatTrafficRate(row.traffic.publishSuccessRate) }}
            </template>
          </p>
        </div>

        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-red-400 cursor-pointer"
          title="Remove relay"
          @click="handleRemove(row.url)"
        >
          <X class="h-3.5 w-3.5" :stroke-width="2" />
        </button>
      </div>
    </div>

    <div
      v-else
      class="rounded-xl border border-dashed border-zinc-800/80 bg-zinc-950/40 px-4 py-6 text-center text-xs text-zinc-500"
    >
      No relays configured.
    </div>

    <div
      class="flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-3.5"
    >
      <input
        v-model="newRelayUrl"
        type="url"
        placeholder="https://relay.example.com"
        aria-label="Relay URL"
        spellcheck="false"
        class="block h-9 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600/40"
        @keydown.enter="handleAdd"
      />
      <button
        type="button"
        :disabled="!newRelayUrl.trim() || adding"
        class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer"
        @click="handleAdd"
      >
        <Loader2 v-if="adding" class="h-3.5 w-3.5 animate-spin" :stroke-width="2" />
        <Plus v-else class="h-3.5 w-3.5" :stroke-width="2" />
        Add
      </button>
    </div>

    <p v-if="errorKey === 'invalid'" class="px-1 text-[11px] text-red-400">
      Enter a valid Rabta node URL (https://...)
    </p>
    <p v-else-if="errorKey === 'duplicate'" class="px-1 text-[11px] text-red-400">
      This relay is already in the list.
    </p>
  </div>
</template>
