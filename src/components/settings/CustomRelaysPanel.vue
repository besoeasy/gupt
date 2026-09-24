<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, X, Server, Loader2, RotateCcw } from "@lucide/vue";
import { getCustomRelays, addCustomRelay, removeCustomRelay, normalizeRelay } from "@/lib/relay";
import { saveConfiguredRelays, DEFAULT_RELAYS } from "@/config/servers";
import { getRelayHealthSummary } from "@/lib/idb";
import { tierDotClass, tierBadgeClass, formatTrafficRate } from "@/lib/relay";

const customRelays = ref([]);
const newRelayUrl = ref("");
const adding = ref(false);
const errorKey = ref("");
const relayTrafficByUrl = ref({});

function load() {
  customRelays.value = getCustomRelays();
}

async function loadTraffic() {
  try {
    const rows = await getRelayHealthSummary();
    const next = {};
    for (const row of rows) {
      if (row?.relay) next[row.relay] = row;
    }
    relayTrafficByUrl.value = next;
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
    label: url.replace(/^wss:\/\//i, ""),
    traffic: trafficFor(url),
  })),
);

onMounted(() => {
  load();
  loadTraffic();
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
  } finally {
    adding.value = false;
  }
}

function handleRemove(url) {
  removeCustomRelay(url);
  load();
}

function handleResetDefaults() {
  saveConfiguredRelays(DEFAULT_RELAYS);
  load();
}
</script>

<template>
  <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5 space-y-4 shadow-xs">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 min-w-0">
        <Server class="h-4 w-4 text-zinc-400 shrink-0" :stroke-width="1.9" />
        <p class="text-sm font-semibold tracking-tight text-white truncate">Configured Relays</p>
        <span
          v-if="customRelays.length"
          class="ml-1 rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400 tabular-nums"
          >{{ customRelays.length }}</span
        >
      </div>
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

    <!-- Add form -->
    <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label class="space-y-1.5">
        <span class="text-[11px] text-zinc-500">Relay URL</span>
        <input
          v-model="newRelayUrl"
          type="url"
          placeholder="wss://relay.example.com"
          spellcheck="false"
          class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600/40"
          @keydown.enter="handleAdd"
        />
        <p v-if="errorKey === 'invalid'" class="text-[11px] text-red-400">
          Enter a valid WebSocket URL (wss://...)
        </p>
        <p v-else-if="errorKey === 'duplicate'" class="text-[11px] text-red-400">
          This relay is already in the list.
        </p>
      </label>
      <button
        type="button"
        :disabled="!newRelayUrl.trim() || adding"
        class="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer sm:self-end"
        @click="handleAdd"
      >
        <Loader2 v-if="adding" class="h-3.5 w-3.5 animate-spin" :stroke-width="2" />
        <Plus v-else class="h-3.5 w-3.5" :stroke-width="2" />
        Add
      </button>
    </div>

    <!-- Relay list -->
    <div v-if="rows.length" class="space-y-1.5">
      <div
        v-for="row in rows"
        :key="row.url"
        class="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-zinc-800/80 bg-zinc-950/40 transition-colors duration-150 hover:border-zinc-700 hover:bg-zinc-900/40"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="shrink-0 h-2 w-2 rounded-full" :class="tierDotClass(row.traffic?.tier)" />
          <p class="truncate font-mono text-xs text-zinc-300 tracking-tight" :title="row.url">
            {{ row.label }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1.5 flex-wrap justify-end">
          <span
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap leading-tight tabular-nums"
            :class="row.traffic ? tierBadgeClass(row.traffic.tier) : 'bg-white/8 text-zinc-400'"
          >
            Pub
            <span class="opacity-70">
              {{ row.traffic ? formatTrafficRate(row.traffic.publishSuccessRate) : "—" }}
            </span>
          </span>

          <button
            type="button"
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
            title="Remove relay"
            @click="handleRemove(row.url)"
          >
            <X class="h-3.5 w-3.5" :stroke-width="2" />
          </button>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="py-8 text-center text-sm text-zinc-500">No relays configured.</div>
  </div>
</template>
