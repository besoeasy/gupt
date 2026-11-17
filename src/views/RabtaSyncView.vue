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
import RabtaServerTable from "@/components/rabta/RabtaServerTable.vue";
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
  <div class="min-h-screen bg-black text-zinc-100 pb-16">
    <main class="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <!-- Header section -->
      <header
        class="flex flex-col gap-4 border-b border-zinc-800/80 pb-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-950/40 text-emerald-400"
          >
            <Radio class="h-5 w-5" :stroke-width="2" />
          </div>
          <div class="min-w-0">
            <h1 class="truncate text-lg font-semibold tracking-tight text-white">
              Rabta Server Mesh
            </h1>
            <p class="mt-0.5 truncate text-xs text-zinc-400">
              Independent background worker syncing events and blobs between all Rabta servers.
            </p>
          </div>
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
            class="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95"
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
            class="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/25 active:scale-95 disabled:opacity-50"
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
      </header>

      <!-- Quick Metrics in Single Column -->
      <section class="space-y-3">
        <!-- Our Total Events (Hero Featured Card) -->
        <div
          class="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-zinc-900/60 to-zinc-900/40 p-4 space-y-2 transition-all duration-200 hover:border-emerald-500/50"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="relative flex h-2 w-2">
                <span
                  class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
                />
                <span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span class="font-mono text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                Our Total Events on Mesh
              </span>
            </div>
            <span class="font-mono text-xs text-zinc-400">
              {{ rabtaSync.onlineServers }} / {{ rabtaSync.totalServers }} nodes
            </span>
          </div>

          <div class="flex items-baseline justify-between gap-2">
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-bold font-mono text-zinc-100 sm:text-4xl">
                {{ rabtaSync.ourTotalEvents.toLocaleString() }}
              </span>
              <span class="font-mono text-xs text-zinc-400">
                total distinct events
              </span>
            </div>
            <span
              class="rounded px-2 py-0.5 font-mono text-[10px] font-semibold border"
              :class="consistencyBadgeClass"
            >
              {{ rabtaSync.consistencyPct }}% consistency
            </span>
          </div>

          <div class="flex items-center justify-between border-t border-emerald-500/20 pt-2 text-xs font-mono text-zinc-400">
            <span :title="`${rabtaSync.ourOutboundEvents} sent by us · ${rabtaSync.ourInboundEvents} addressed to us`">
              {{ rabtaSync.ourOutboundEvents }} sent · {{ rabtaSync.ourInboundEvents }} received
            </span>
            <span v-if="localEventsCount != null" class="text-zinc-500" title="Events stored in local IndexedDB on this device">
              device local: {{ localEventsCount }}
            </span>
          </div>
        </div>

        <!-- 4-Stat Secondary Grid (2x2 on mobile, 4-across on desktop) -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <!-- Pool Consistency -->
          <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 space-y-1">
            <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Consistency
            </span>
            <div class="flex items-baseline gap-1.5">
              <span class="text-xl font-bold font-mono text-zinc-100">
                {{ rabtaSync.consistencyPct }}%
              </span>
            </div>
            <p class="font-mono text-[10px] text-zinc-500 truncate">
              {{ rabtaSync.consistencyPct === 100 ? "Fully in sync" : "Reconciling" }}
            </p>
          </div>

          <!-- Cross-Synced -->
          <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 space-y-1">
            <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Events Synced
            </span>
            <div class="flex items-baseline gap-1.5">
              <span class="text-xl font-bold font-mono text-zinc-100">
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
          <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 space-y-1">
            <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Blobs Synced
            </span>
            <div class="flex items-baseline gap-1.5">
              <span class="text-xl font-bold font-mono text-zinc-100">
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
          <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 space-y-1">
            <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Round #{{ rabtaSync.round || 0 }}
            </span>
            <div class="text-xl font-bold font-mono text-zinc-100">
              {{ formatAgo(rabtaSync.lastSyncAt) }}
            </div>
            <p class="font-mono text-[10px] text-zinc-500 truncate" v-if="rabtaSync.durationMs">
              in {{ rabtaSync.durationMs }}ms
            </p>
            <p class="font-mono text-[10px] text-zinc-500 truncate" v-else>
              cadence active
            </p>
          </div>
        </div>
      </section>

      <!-- Adaptive Range Bisection Telemetry Card -->
      <section class="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5 space-y-2.5 font-mono text-xs text-zinc-400">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="flex h-2 w-2 rounded-full bg-emerald-400" />
            <span class="font-semibold text-zinc-200">Adaptive Range Bisection Active</span>
          </div>
          <span class="text-[10px] text-zinc-500">1-probe matching</span>
        </div>

        <div class="grid grid-cols-2 gap-2 border-t border-zinc-800/60 pt-2.5 sm:grid-cols-3 text-[11px] tabular-nums">
          <div :title="`${rabtaSync.bisection?.rangesMatched || 0} ranges verified in 1 query`">
            <span class="text-zinc-500">Verified:</span>
            <span class="ml-1 font-semibold text-emerald-400">{{
              rabtaSync.bisection?.rangesMatched || 0
            }}</span>
          </div>
          <div :title="`${rabtaSync.bisection?.rangesBisected || 0} divergences split recursively`">
            <span class="text-zinc-500">Bisected:</span>
            <span class="ml-1 font-semibold text-amber-400">{{
              rabtaSync.bisection?.rangesBisected || 0
            }}</span>
          </div>
          <div :title="`${rabtaSync.bisection?.leafReconciled || 0} leaf windows reconciled`">
            <span class="text-zinc-500">Leafs Synced:</span>
            <span class="ml-1 font-semibold text-zinc-200">{{
              rabtaSync.bisection?.leafReconciled || 0
            }}</span>
          </div>
          <div :title="`${rabtaSync.bisection?.probesUsed || 0} total count probes executed`">
            <span class="text-zinc-500">Probes:</span>
            <span class="ml-1 font-semibold text-zinc-400">{{
              rabtaSync.bisection?.probesUsed || 0
            }}</span>
          </div>
          <div :title="`${rabtaSync.bisection?.blobsSkippedQuota || 0} blobs quota protected`">
            <span class="text-zinc-500">Quota Safe:</span>
            <span class="ml-1 font-semibold text-emerald-400">{{
              rabtaSync.bisection?.blobsSkippedQuota || 0
            }}</span>
          </div>
          <div :title="`${rabtaSync.bisection?.blobsResumed || 0} blob transfers resumed via HTTP Range`">
            <span class="text-zinc-500">Range Resumed:</span>
            <span class="ml-1 font-semibold text-emerald-400">{{
              rabtaSync.bisection?.blobsResumed || 0
            }}</span>
          </div>
          <div
            v-if="rabtaSync.bisection?.batteryBackoffs > 0"
            class="col-span-2 sm:col-span-3 text-amber-400"
            :title="`${rabtaSync.bisection?.batteryBackoffs} sync queries backed off for constrained battery`"
          >
            <span class="text-zinc-500">Battery Backoff:</span>
            <span class="ml-1 font-semibold">{{ rabtaSync.bisection?.batteryBackoffs }}</span>
          </div>
        </div>
      </section>

      <!-- Configured Rabta Servers in Single Column Stack -->
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

        <!-- Minimal Connected Server Mesh Nodes Table -->
        <RabtaServerTable
          :servers="rabtaSync.servers"
          :default-relays="DEFAULT_RELAYS"
          @remove="handleRemoveServer"
        />

        <!-- Add Server Form -->
        <div class="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-3.5 space-y-2">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              v-model="newServerUrl"
              type="url"
              placeholder="https://my-rabta-node.example.com"
              class="min-h-[44px] min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-700 focus:outline-none"
              @keydown.enter="handleAddServer"
            />
            <button
              type="button"
              :disabled="!newServerUrl.trim() || isAdding"
              class="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-4 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 active:scale-95"
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
