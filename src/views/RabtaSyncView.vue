<script setup>
import { ref, computed, onMounted, watch } from "vue";
import {
  RefreshCw,
  Play,
  Pause,
  Plus,
  Radio,
  CheckCircle2,
  Layers,
  HardDrive,
  Activity,
  ShieldCheck,
  AlertCircle,
  Database,
} from "@lucide/vue";

import { useRabtaSyncStore } from "@/stores/rabtaSync";
import { DEFAULT_RELAYS } from "@/config/servers";
import { countLocalRawEvents } from "@/lib/idb";
import RabtaServerCard from "@/components/rabta/RabtaServerCard.vue";
import RabtaPoolQueryPanel from "@/components/rabta/RabtaPoolQueryPanel.vue";
import RabtaSyncLogs from "@/components/rabta/RabtaSyncLogs.vue";

const rabtaSync = useRabtaSyncStore();

const newServerUrl = ref("");
const addError = ref("");
const isAdding = ref(false);
const localEventsCount = ref(null);

async function refreshLocalCount() {
  try {
    localEventsCount.value = await countLocalRawEvents();
  } catch {
    localEventsCount.value = null;
  }
}

onMounted(() => {
  refreshLocalCount();
});

watch(
  () => rabtaSync.lastSyncAt,
  () => {
    refreshLocalCount();
  },
);

const isDefaultServer = (url) => DEFAULT_RELAYS.includes(url);

const consistencyBadgeClass = computed(() => {
  const pct = rabtaSync.consistencyPct;
  if (pct >= 95) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (pct >= 70) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-red-400 bg-red-500/10 border-red-500/20";
});

function handleAddServer() {
  const url = newServerUrl.value.trim().replace(/\/+$/, "");
  addError.value = "";
  if (!url) return;

  if (!/^https?:\/\//i.test(url)) {
    addError.value = "Server URL must start with https:// or http://";
    return;
  }

  isAdding.value = true;
  try {
    rabtaSync.addServer(url);
    newServerUrl.value = "";
    rabtaSync.triggerSyncNow();
  } catch (err) {
    addError.value = err?.message || "Failed to add server";
  } finally {
    isAdding.value = false;
  }
}

function handleRemoveServer(url) {
  rabtaSync.removeServer(url);
}

function formatAgo(ts) {
  if (!ts) return "never";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
</script>

<template>
  <div class="min-h-screen">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <!-- Header section -->
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            >
              <Radio class="h-4 w-4" :stroke-width="2" />
            </span>
            <h1 class="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
              Rabta Server Mesh Sync
            </h1>
          </div>
          <p class="mt-1 text-xs text-zinc-400 sm:text-sm">
            Independent background worker syncing events and blobs between all Rabta servers.
          </p>
        </div>

        <!-- Controls: Sync Now, Pause/Resume, Cadence -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Dynamic Random Cadence & Batch Policy Indicator -->
          <div
            class="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-mono text-zinc-300"
            :title="`Syncs at most 10 events (+ blobs) per run, then waits a random delay of 10s to 100s`"
          >
            <span class="text-[10px] text-zinc-500 uppercase">Wait</span>
            <span class="font-medium text-amber-300">
              <template v-if="!rabtaSync.isAutoSync">Paused</template>
              <template v-else-if="rabtaSync.isSyncing">Syncing…</template>
              <template v-else-if="rabtaSync.nextWaitSec">~{{ rabtaSync.nextWaitSec }}s</template>
              <template v-else>10s–100s</template>
            </span>
            <span class="text-zinc-600">·</span>
            <span class="text-[11px] text-zinc-400">max 10 ev/run</span>
          </div>

          <!-- Pause / Resume button -->
          <button
            type="button"
            class="inline-flex h-9 min-w-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95"
            @click="rabtaSync.toggleAutoSync"
            :title="rabtaSync.isAutoSync ? 'Pause auto-sync' : 'Resume auto-sync'"
          >
            <component
              :is="rabtaSync.isAutoSync ? Pause : Play"
              class="h-3.5 w-3.5"
              :stroke-width="2"
            />
            <span class="hidden sm:inline">{{ rabtaSync.isAutoSync ? "Pause" : "Resume" }}</span>
          </button>

          <!-- Sync Now button -->
          <button
            type="button"
            :disabled="rabtaSync.isSyncing"
            class="inline-flex h-9 min-w-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/25 active:scale-95 disabled:opacity-50"
            @click="rabtaSync.triggerSyncNow"
          >
            <RefreshCw
              class="h-3.5 w-3.5"
              :class="{ 'animate-spin': rabtaSync.isSyncing }"
              :stroke-width="2"
            />
            <span>{{ rabtaSync.isSyncing ? "Syncing…" : "Sync Now" }}</span>
          </button>
        </div>
      </div>

      <!-- Quick Metrics Grid -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <!-- Our Total Events (Featured First) -->
        <div
          class="col-span-2 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-zinc-900/60 to-zinc-900/40 p-3.5 space-y-1 sm:col-span-1 transition-all duration-200 hover:border-emerald-500/50"
        >
          <div class="flex items-center justify-between">
            <span class="font-mono text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
              Our Total Events
            </span>
            <span class="relative flex h-2 w-2">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
              />
              <span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-xl font-bold font-mono text-zinc-100 sm:text-2xl">
              {{ rabtaSync.ourTotalEvents.toLocaleString() }}
            </span>
            <span class="font-mono text-[10px] text-zinc-400">
              on mesh
            </span>
          </div>
          <div class="flex items-center justify-between text-[10px] font-mono text-zinc-400">
            <span :title="`${rabtaSync.ourOutboundEvents} sent · ${rabtaSync.ourInboundEvents} received`">
              {{ rabtaSync.ourOutboundEvents }} sent · {{ rabtaSync.ourInboundEvents }} rcvd
            </span>
            <span v-if="localEventsCount != null" class="text-zinc-500" :title="`Events stored in local IndexedDB on this device`">
              local: {{ localEventsCount }}
            </span>
          </div>
        </div>

        <!-- Mesh Consistency -->
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-1">
          <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Pool Consistency
          </span>
          <div class="flex items-center gap-2">
            <span class="text-xl font-bold font-mono text-zinc-100 sm:text-2xl">
              {{ rabtaSync.consistencyPct }}%
            </span>
            <span
              class="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold border"
              :class="consistencyBadgeClass"
            >
              {{ rabtaSync.consistencyPct === 100 ? "In Sync" : "Syncing" }}
            </span>
          </div>
          <p class="font-mono text-[10px] text-zinc-500 truncate">
            {{ rabtaSync.onlineServers }} / {{ rabtaSync.totalServers }} nodes consistent
          </p>
        </div>

        <!-- Events Synced -->
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-1">
          <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Cross-Synced
          </span>
          <div class="flex items-baseline gap-1.5">
            <span class="text-xl font-bold font-mono text-zinc-100 sm:text-2xl">
              {{ rabtaSync.totalEventsSynced.toLocaleString() }}
            </span>
            <span v-if="rabtaSync.eventsSynced > 0" class="font-mono text-xs text-emerald-400">
              (+{{ rabtaSync.eventsSynced }})
            </span>
          </div>
          <p class="font-mono text-[10px] text-zinc-500 truncate">
            replicated missing
          </p>
        </div>

        <!-- Blobs Synced -->
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-1">
          <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Blobs Synced
          </span>
          <div class="flex items-baseline gap-1.5">
            <span class="text-xl font-bold font-mono text-zinc-100 sm:text-2xl">
              {{ rabtaSync.totalBlobsSynced.toLocaleString() }}
            </span>
            <span v-if="rabtaSync.blobsSynced > 0" class="font-mono text-xs text-emerald-400">
              (+{{ rabtaSync.blobsSynced }})
            </span>
          </div>
          <p
            v-if="rabtaSync.totalBlobsSkippedQuota > 0"
            class="font-mono text-[10px] text-amber-400/90 truncate"
            :title="`${rabtaSync.totalBlobsSkippedQuota} blobs skipped because target relay storage limit was reached`"
          >
            {{ rabtaSync.totalBlobsSkippedQuota }} quota-safe
          </p>
          <p v-else class="font-mono text-[10px] text-zinc-500 truncate">
            {{ rabtaSync.totalBlobsResumed }} resumed
          </p>
        </div>

        <!-- Last Sync / Round -->
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-1">
          <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Last Round #{{ rabtaSync.round || 0 }}
          </span>
          <div class="text-xl font-bold font-mono text-zinc-100 sm:text-2xl">
            {{ formatAgo(rabtaSync.lastSyncAt) }}
          </div>
          <p class="font-mono text-[10px] text-zinc-500 truncate" v-if="rabtaSync.durationMs">
            finished in {{ rabtaSync.durationMs }}ms
          </p>
        </div>
      </div>

      <!-- Adaptive Range Bisection Telemetry Strip -->
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-2.5 font-mono text-xs text-zinc-400"
      >
        <div class="flex items-center gap-2">
          <span class="flex h-2 w-2 rounded-full bg-emerald-400" />
          <span class="font-semibold text-zinc-200">Adaptive Range Bisection Active</span>
          <span class="hidden text-zinc-600 sm:inline">|</span>
          <span class="hidden text-zinc-500 sm:inline"
            >Divide-and-conquer tree diffing replaces full catalog fetches</span
          >
        </div>

        <div class="flex flex-wrap items-center gap-4 text-[11px] tabular-nums">
          <span :title="`${rabtaSync.bisection?.rangesMatched || 0} ranges verified in 1 query`">
            Verified:
            <span class="font-semibold text-emerald-400">{{
              rabtaSync.bisection?.rangesMatched || 0
            }}</span>
          </span>
          <span
            :title="`${rabtaSync.bisection?.rangesBisected || 0} divergences split recursively`"
          >
            Bisected:
            <span class="font-semibold text-amber-400">{{
              rabtaSync.bisection?.rangesBisected || 0
            }}</span>
          </span>
          <span :title="`${rabtaSync.bisection?.leafReconciled || 0} leaf windows reconciled`">
            Leafs Synced:
            <span class="font-semibold text-zinc-200">{{
              rabtaSync.bisection?.leafReconciled || 0
            }}</span>
          </span>
          <span :title="`${rabtaSync.bisection?.probesUsed || 0} total count probes executed`">
            Probes:
            <span class="font-semibold text-zinc-400">{{
              rabtaSync.bisection?.probesUsed || 0
            }}</span>
          </span>
          <span :title="`${rabtaSync.bisection?.blobsSkippedQuota || 0} blobs quota protected`">
            Quota Safe:
            <span class="font-semibold text-emerald-400">{{
              rabtaSync.bisection?.blobsSkippedQuota || 0
            }}</span>
          </span>
          <span
            :title="`${rabtaSync.bisection?.blobsResumed || 0} blob transfers resumed via HTTP Range requests`"
          >
            Range Resumed:
            <span class="font-semibold text-emerald-400">{{
              rabtaSync.bisection?.blobsResumed || 0
            }}</span>
          </span>
          <span
            v-if="rabtaSync.bisection?.batteryBackoffs > 0"
            :title="`${rabtaSync.bisection?.batteryBackoffs} sync queries backed off to conserve constrained relay battery`"
          >
            Battery Backoff:
            <span class="font-semibold text-amber-400">{{
              rabtaSync.bisection?.batteryBackoffs
            }}</span>
          </span>
        </div>
      </div>

      <!-- Configured Rabta Servers Grid -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold tracking-tight text-zinc-200">
              Connected Server Mesh Nodes
            </h2>
            <span class="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-400">
              {{ rabtaSync.onlineServers }} / {{ rabtaSync.totalServers }} online
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RabtaServerCard
            v-for="server in rabtaSync.servers"
            :key="server.url"
            :server="server"
            :can-remove="!isDefaultServer(server.url)"
            @remove="handleRemoveServer"
          />
        </div>

        <!-- Add Server Form -->
        <div class="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-3.5 space-y-2">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              v-model="newServerUrl"
              type="url"
              placeholder="https://my-rabta-node.example.com"
              class="h-9 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-700 focus:outline-none"
              @keydown.enter="handleAddServer"
            />
            <button
              type="button"
              :disabled="!newServerUrl.trim() || isAdding"
              class="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-4 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 active:scale-95"
              @click="handleAddServer"
            >
              <Plus class="h-3.5 w-3.5" :stroke-width="2" />
              Add Node
            </button>
          </div>
          <p v-if="addError" class="font-mono text-xs text-red-400">
            {{ addError }}
          </p>
        </div>
      </section>

      <!-- Pool Query Panel (Ditching Dexie, querying directly as pool) -->
      <RabtaPoolQueryPanel />

      <!-- Live Sync Logs -->
      <RabtaSyncLogs :logs="rabtaSync.logs" @clear="rabtaSync.clearLogs" />
    </main>
  </div>
</template>
