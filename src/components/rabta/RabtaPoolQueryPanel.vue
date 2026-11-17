<script setup>
import { ref } from "vue";
import { Search, Loader2, Database, Clock, Layers, CheckCircle2 } from "@lucide/vue";
import { queryRabtaPool } from "@/lib/rabta/pool";

const selectedCollection = ref("");
const customCollection = ref("");
const timePreset = ref("24h");
const limit = ref(20);
const isQuerying = ref(false);
const queryResult = ref(null);
const queryError = ref(null);
const expandedEventId = ref(null);

const COLLECTION_OPTIONS = [
  { label: "All Collections", value: "" },
  { label: "Chat DMs (gupt/dm)", value: "gupt/dm" },
  { label: "Group Messages (gupt/group)", value: "gupt/group" },
  { label: "Profiles (gupt/profiles)", value: "gupt/profiles" },
  { label: "Public Feed (gupt/feed)", value: "gupt/feed" },
  { label: "Game Match Lobby (match/lobby)", value: "match/lobby" },
  { label: "Custom…", value: "custom" },
];

function getSinceTimestamp() {
  const nowSec = Math.floor(Date.now() / 1000);
  if (timePreset.value === "1h") return nowSec - 3600;
  if (timePreset.value === "24h") return nowSec - 86400;
  if (timePreset.value === "7d") return nowSec - 7 * 86400;
  if (timePreset.value === "30d") return nowSec - 30 * 86400;
  return null;
}

async function handleQuery() {
  if (isQuerying.value) return;
  isQuerying.value = true;
  queryError.value = null;
  expandedEventId.value = null;

  const collection =
    selectedCollection.value === "custom"
      ? customCollection.value.trim()
      : selectedCollection.value;

  const since = getSinceTimestamp();

  try {
    const res = await queryRabtaPool({
      collection: collection || undefined,
      since: since || undefined,
      limit: Number(limit.value) || 20,
    });
    queryResult.value = res;
  } catch (err) {
    queryError.value = err?.message || "Pool query failed";
  } finally {
    isQuerying.value = false;
  }
}

function toggleExpand(id) {
  expandedEventId.value = expandedEventId.value === id ? null : id;
}

function formatTs(sec) {
  if (!sec) return "—";
  return new Date(Number(sec) * 1000).toLocaleString();
}
</script>

<template>
  <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-4">
    <!-- Header -->
    <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 class="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-100">
          <Layers class="h-4 w-4 text-emerald-400" :stroke-width="2" />
          Query Rabta Server Pool Directly
        </h3>
        <p class="text-xs text-zinc-500">
          Zero-cache query: fetches, merges, and deduplicates events directly across all servers.
        </p>
      </div>
      <span
        class="inline-flex w-fit items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/20"
      >
        <CheckCircle2 class="h-3 w-3" :stroke-width="2" />
        No Dexie Cache Needed
      </span>
    </div>

    <!-- Filter Form -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <!-- Collection selector -->
      <div>
        <label class="block font-mono text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          Collection
        </label>
        <select
          v-model="selectedCollection"
          class="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 font-mono text-xs text-zinc-200 transition-colors focus:border-zinc-700 focus:outline-none"
        >
          <option v-for="opt in COLLECTION_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <!-- Time Window / Preset -->
      <div>
        <label class="block font-mono text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          Time Window (Timestamp)
        </label>
        <select
          v-model="timePreset"
          class="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 font-mono text-xs text-zinc-200 transition-colors focus:border-zinc-700 focus:outline-none"
        >
          <option value="1h">Past 1 hour</option>
          <option value="24h">Past 24 hours</option>
          <option value="7d">Past 7 days</option>
          <option value="30d">Past 30 days</option>
          <option value="all">All time (no filter)</option>
        </select>
      </div>

      <!-- Limit & Query Button -->
      <div class="flex items-end gap-2">
        <div class="w-24 shrink-0">
          <label class="block font-mono text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Limit
          </label>
          <select
            v-model="limit"
            class="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 font-mono text-xs text-zinc-200 transition-colors focus:border-zinc-700 focus:outline-none"
          >
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>

        <button
          type="button"
          :disabled="isQuerying"
          class="flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/25 active:scale-95 disabled:opacity-50"
          @click="handleQuery"
        >
          <Loader2 v-if="isQuerying" class="h-3.5 w-3.5 animate-spin" :stroke-width="2" />
          <Search v-else class="h-3.5 w-3.5" :stroke-width="2" />
          Query Pool
        </button>
      </div>
    </div>

    <!-- Custom Collection Input if selected -->
    <div v-if="selectedCollection === 'custom'" class="pt-1">
      <input
        v-model="customCollection"
        type="text"
        placeholder="Enter custom collection e.g. myapp/events"
        class="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
      />
    </div>

    <!-- Error notice -->
    <div
      v-if="queryError"
      class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 font-mono"
    >
      {{ queryError }}
    </div>

    <!-- Results Section -->
    <div v-if="queryResult" class="space-y-3 pt-2">
      <!-- Outbox & Outcomes badges -->
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 pt-3">
        <p class="font-mono text-xs text-zinc-300">
          <span class="font-semibold text-emerald-400">{{ queryResult.count }}</span> deduplicated
          event{{ queryResult.count === 1 ? "" : "s" }} across
          <span class="font-semibold text-zinc-100"
            >{{ queryResult.onlineServers }}/{{ queryResult.totalServers }}</span
          >
          servers
        </p>

        <!-- Per-server outcome badges -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="outcome in queryResult.relayOutcomes"
            :key="outcome.relay"
            class="inline-flex items-center gap-1 rounded bg-zinc-800/70 px-2 py-0.5 font-mono text-[10px] text-zinc-400"
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="outcome.ok ? 'bg-emerald-400' : 'bg-red-400'"
            />
            {{ outcome.relay.replace(/^https?:\/\//i, "") }}
            <span v-if="outcome.ok" class="text-zinc-500">({{ outcome.latencyMs }}ms)</span>
          </span>
        </div>
      </div>

      <!-- Events List -->
      <div v-if="queryResult.events.length" class="space-y-1.5 max-h-80 overflow-y-auto pr-1">
        <div
          v-for="ev in queryResult.events"
          :key="ev.id"
          class="rounded-lg border border-zinc-800/70 bg-zinc-950/50 p-2.5 transition-colors hover:border-zinc-700/70 cursor-pointer"
          @click="toggleExpand(ev.id)"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1 flex items-center gap-2">
              <span class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                {{ ev.collection || "generic" }}
              </span>
              <p class="truncate font-mono text-xs text-zinc-300" :title="ev.id">
                {{ ev.id.slice(0, 16) }}…
              </p>
            </div>
            <span
              class="flex items-center gap-1 shrink-0 font-mono text-[10px] text-zinc-500 tabular-nums"
            >
              <Clock class="h-3 w-3" :stroke-width="1.8" />
              {{ formatTs(ev.created_at) }}
            </span>
          </div>

          <!-- Expanded detail payload -->
          <div
            v-if="expandedEventId === ev.id"
            class="mt-2.5 rounded bg-zinc-900/90 p-2 font-mono text-[11px] text-zinc-400 overflow-x-auto"
          >
            <div class="mb-1 text-zinc-500">Owner: {{ ev.owner || "anonymous" }}</div>
            <pre class="text-[10px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{{
              JSON.stringify(ev.data || ev, null, 2)
            }}</pre>
          </div>
        </div>
      </div>

      <div
        v-else
        class="py-6 text-center font-mono text-xs text-zinc-500 rounded-lg border border-dashed border-zinc-800"
      >
        No events found in the Rabta server pool matching the query criteria.
      </div>
    </div>
  </div>
</template>
