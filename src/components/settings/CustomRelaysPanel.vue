<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowUpRight,
  ChevronDown,
  LoaderCircle,
  Plus,
  RotateCcw,
  RefreshCw,
  TriangleAlert,
} from "@lucide/vue";
import {
  getCustomRelays,
  addCustomRelay,
  removeCustomRelay,
  normalizeRelay,
  probeRelayConnections,
} from "@/lib/relay";
import { saveConfiguredRelays, DEFAULT_RELAYS } from "@/config/servers";
import { getRelayHealthSummary } from "@/lib/idb";
import { RELAY_RECOMMENDED_MIN } from "@/lib/relayNudge";
import { formatTrafficRate, tierBadgeClass, tierDotClass } from "@/lib/relay";

const customRelays = ref([]);
const newRelayUrl = ref("");
const adding = ref(false);
const probing = ref(false);
const errorKey = ref("");
const relayTrafficByUrl = ref({});
const expandedUrl = ref("");

function load() {
  customRelays.value = getCustomRelays();
  if (expandedUrl.value && !customRelays.value.includes(expandedUrl.value)) {
    expandedUrl.value = "";
  }
}

async function loadStats() {
  try {
    const health = await getRelayHealthSummary();
    const next = {};
    for (const row of health) {
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
      tier: traffic?.tier || "unknown",
      latencyMs: latencyFor(traffic),
    };
  }),
);

const poorRelays = computed(() => rows.value.filter((row) => row.tier === "poor"));
const poorRelayNames = computed(() => poorRelays.value.map((row) => row.label).join(", "));

onMounted(() => {
  load();
  loadStats();
  if (typeof window !== "undefined") {
    window.addEventListener("gupt:relays-changed", handleRelaysChanged);
  }
});

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("gupt:relays-changed", handleRelaysChanged);
  }
});

/** Relay edits can come from here, invites, probes, or the suggestions panel. */
function handleRelaysChanged() {
  load();
  loadStats();
}

function toggleRow(url) {
  expandedUrl.value = expandedUrl.value === url ? "" : url;
}

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
    await probeRelayConnections(customRelays.value, { detailed: true });
    await loadStats();
  } finally {
    probing.value = false;
  }
}
</script>

<template>
  <div class="space-y-1">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600 tabular-nums">
        {{ customRelays.length }} configured
        <template v-if="customRelays.length < RELAY_RECOMMENDED_MIN">
          <span class="text-zinc-700">·</span>
          <span class="text-amber-400/80">{{ RELAY_RECOMMENDED_MIN }} recommended</span>
        </template>
      </p>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 active:scale-[0.98] disabled:opacity-40 sm:min-h-8"
          title="Probe every relay now"
          :disabled="probing || !customRelays.length"
          @click="handleProbe"
        >
          <RefreshCw class="h-3 w-3" :class="probing ? 'animate-spin' : ''" :stroke-width="2" />
          Probe
        </button>
        <button
          type="button"
          class="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 active:scale-[0.98] sm:min-h-8"
          title="Reset to default relays"
          @click="handleResetDefaults"
        >
          <RotateCcw class="h-3 w-3" :stroke-width="2" />
          Reset
        </button>
      </div>
    </div>

    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="poorRelays.length"
        class="rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5"
        role="status"
      >
        <div class="flex items-start gap-2.5">
          <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" :stroke-width="2" />
          <div class="min-w-0 flex-1 space-y-1">
            <p class="text-[11px] font-medium text-amber-300">
              {{ poorRelays.length }} configured
              {{ poorRelays.length === 1 ? "relay is" : "relays are" }} failing
            </p>
            <p class="break-all font-mono text-[10px] leading-relaxed text-amber-200/60">
              {{ poorRelayNames }}
            </p>
            <p class="text-[10px] leading-relaxed text-zinc-500">
              Sends still go to every relay, so messages may not sync. Probe again or replace these
              nodes.
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 cursor-pointer rounded-md border border-amber-500/25 px-2 py-1 font-mono text-[10px] text-amber-300 transition-colors hover:border-amber-400/50 hover:text-amber-200 active:scale-[0.98] disabled:opacity-40"
            :disabled="probing"
            @click="handleProbe"
          >
            Probe
          </button>
        </div>
      </div>
    </Transition>

    <div v-if="rows.length" class="mt-1">
      <div v-for="row in rows" :key="row.url" class="border-t border-zinc-800/60 first:border-t-0">
        <button
          type="button"
          class="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-1 py-3 text-left transition-colors duration-200 hover:bg-white/[0.03] active:bg-white/[0.05]"
          :aria-expanded="expandedUrl === row.url"
          :aria-controls="`relay-detail-${row.url}`"
          @click="toggleRow(row.url)"
        >
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            :class="tierDotClass(row.tier)"
            :title="`Relay health: ${tierLabel(row.tier)}`"
          />

          <span class="min-w-0 flex-1">
            <span class="block truncate font-mono text-xs text-zinc-200" :title="row.url">
              {{ row.label }}
            </span>
            <span
              class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tabular-nums"
            >
              <span class="shrink-0 rounded px-1.5 py-0.5" :class="tierBadgeClass(row.tier)">
                {{ tierLabel(row.tier) }}
              </span>
              <span
                v-if="row.traffic?.batteryMode === 'read_only'"
                class="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-red-400"
                title="This relay is out of battery: reads work, writes are refused"
              >
                read-only
              </span>
              <span
                v-else-if="row.traffic?.batteryMode === 'sync_disabled'"
                class="shrink-0 rounded bg-yellow-500/10 px-1.5 py-0.5 text-yellow-400"
                title="This relay paused peer sync until its battery regenerates"
              >
                sync-off
              </span>
              <span
                v-if="row.latencyMs !== null"
                class="text-zinc-500"
                :title="latencyTitle(row.traffic)"
              >
                {{ row.latencyMs }}ms
              </span>
            </span>
          </span>

          <ChevronDown
            class="h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform duration-200"
            :class="expandedUrl === row.url ? 'rotate-180' : ''"
            :stroke-width="2"
            aria-hidden="true"
          />
        </button>

        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div
            v-if="expandedUrl === row.url"
            :id="`relay-detail-${row.url}`"
            class="pb-3 pl-4 pr-1"
          >
            <div
              class="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-600 tabular-nums"
            >
              <span>
                pub
                <span :class="rateTextClass(row.traffic?.publishSuccessRate)">
                  {{ formatTrafficRate(row.traffic?.publishSuccessRate) }}
                </span>
              </span>
              <span>
                qry
                <span :class="rateTextClass(row.traffic?.querySuccessRate)">
                  {{ formatTrafficRate(row.traffic?.querySuccessRate) }}
                </span>
              </span>
              <span>
                con
                <span :class="rateTextClass(row.traffic?.connectSuccessRate)">
                  {{ formatTrafficRate(row.traffic?.connectSuccessRate) }}
                </span>
              </span>
              <span v-if="row.traffic?.syncPeers > 0" title="This relay mirrors its store">
                mirrors <span class="text-zinc-400">{{ row.traffic.syncPeers }}</span>
              </span>
              <span v-else class="text-zinc-700">no mirror peers</span>
            </div>

            <p
              v-if="row.traffic?.lastError"
              class="mt-1.5 truncate font-mono text-[10px] text-zinc-600"
              :title="row.traffic.lastError"
            >
              Last error: {{ row.traffic.lastError }}
            </p>

            <div class="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-red-500/25 px-2.5 font-mono text-[10px] text-red-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 active:scale-[0.98] sm:min-h-8"
                @click="handleRemove(row.url)"
              >
                Remove relay
              </button>
              <span class="font-mono text-[10px] text-zinc-700">
                Removing stops all reads and writes to this node.
              </span>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <div v-else class="px-1 py-5 text-center font-mono text-[11px] text-zinc-600">
      No relays configured.
    </div>

    <div class="flex items-center gap-2 pt-2">
      <input
        v-model="newRelayUrl"
        type="url"
        placeholder="https://relay.example.com"
        aria-label="Relay URL"
        spellcheck="false"
        class="block h-11 min-w-0 flex-1 rounded-lg border border-dashed border-zinc-800 bg-transparent px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none sm:h-9"
        @keydown.enter="handleAdd"
      />
      <button
        type="button"
        :disabled="!newRelayUrl.trim() || adding"
        class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-[0.98] disabled:opacity-40 sm:h-9"
        @click="handleAdd"
      >
        <LoaderCircle v-if="adding" class="h-3.5 w-3.5 animate-spin" :stroke-width="2" />
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
      class="mt-1 inline-flex min-h-11 items-center gap-1 font-mono text-[10px] text-zinc-500 transition-colors hover:text-zinc-300 sm:min-h-8"
    >
      Detailed relay analytics
      <ArrowUpRight class="h-3 w-3" :stroke-width="2" />
    </RouterLink>
  </div>
</template>
