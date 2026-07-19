<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, X, Server, Loader2 } from "@lucide/vue";
import { getCustomRelays, addCustomRelay, removeCustomRelay, normalizeRelay } from "@/lib/relay";
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
</script>

<template>
  <div
    class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-4"
  >
    <div class="flex items-center gap-2">
      <Server class="h-4 w-4 text-(--app-primary) shrink-0" :stroke-width="1.9" />
      <p class="text-sm font-semibold">Custom Relays</p>
      <span
        v-if="customRelays.length"
        class="ml-1 rounded-full bg-(--app-primary)/15 px-1.5 py-px text-[10px] font-bold text-(--app-primary)"
        >{{ customRelays.length }}</span
      >
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
          class="w-full rounded-2xl px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] transition-colors border border-(--app-border) bg-(--app-surface-soft) text-(--app-text) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))]"
          @keydown.enter="handleAdd"
        />
        <p v-if="errorKey === 'invalid'" class="text-[11px] text-red-400">
          Enter a valid WebSocket URL (wss://host).
        </p>
        <p v-else-if="errorKey === 'duplicate'" class="text-[11px] text-red-400">
          This relay is already in the list.
        </p>
      </label>
      <button
        type="button"
        :disabled="!newRelayUrl.trim() || adding"
        class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold sm:self-end border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-40"
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
          >
            Pub
            <span class="opacity-70">
              {{ row.traffic ? formatTrafficRate(row.traffic.publishSuccessRate) : "—" }}
            </span>
          </span>

          <button
            type="button"
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            title="Remove relay"
            @click="handleRemove(row.url)"
          >
            <X class="h-3.5 w-3.5" :stroke-width="2" />
          </button>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="py-8 text-center text-sm text-zinc-500">
      No custom relays added. These are merged with the default relay set and used for all
      operations.
    </div>
  </div>
</template>
