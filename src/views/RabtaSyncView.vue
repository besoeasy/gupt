<script setup>
import { ref, computed } from "vue";
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
} from "@lucide/vue";

import { useRabtaSyncStore } from "@/stores/rabtaSync";
import { DEFAULT_RELAYS } from "@/config/servers";
import RabtaServerCard from "@/components/rabta/RabtaServerCard.vue";
import RabtaPoolQueryPanel from "@/components/rabta/RabtaPoolQueryPanel.vue";
import RabtaSyncLogs from "@/components/rabta/RabtaSyncLogs.vue";

const rabtaSync = useRabtaSyncStore();

const newServerUrl = ref("");
const addError = ref("");
const isAdding = ref(false);

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
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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

        <!-- Controls: Sync Now, Pause/Resume, Interval -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Interval selector -->
          <div class="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1">
            <span class="font-mono text-[10px] text-zinc-500 uppercase">Cadence</span>
            <select
              :value="rabtaSync.syncIntervalSec"
              @change="rabtaSync.setSyncInterval($event.target.value)"
              class="bg-transparent font-mono text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option :value="15" class="bg-zinc-900">15s</option>
              <option :value="30" class="bg-zinc-900">30s</option>
              <option :value="60" class="bg-zinc-900">60s</option>
              <option :value="120" class="bg-zinc-900">2m</option>
            </select>
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
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        </div>

        <!-- Events Synced -->
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-1">
          <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Cross-Synced Events
          </span>
          <div class="flex items-baseline gap-1.5">
            <span class="text-xl font-bold font-mono text-zinc-100 sm:text-2xl">
              {{ rabtaSync.totalEventsSynced.toLocaleString() }}
            </span>
            <span v-if="rabtaSync.eventsSynced > 0" class="font-mono text-xs text-emerald-400">
              (+{{ rabtaSync.eventsSynced }})
            </span>
          </div>
        </div>

        <!-- Blobs Synced -->
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-1">
          <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Cross-Synced Blobs
          </span>
          <div class="flex items-baseline gap-1.5">
            <span class="text-xl font-bold font-mono text-zinc-100 sm:text-2xl">
              {{ rabtaSync.totalBlobsSynced.toLocaleString() }}
            </span>
            <span v-if="rabtaSync.blobsSynced > 0" class="font-mono text-xs text-emerald-400">
              (+{{ rabtaSync.blobsSynced }})
            </span>
          </div>
        </div>

        <!-- Last Sync / Round -->
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-1">
          <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Last Round #{{ rabtaSync.round || 0 }}
          </span>
          <div class="text-xl font-bold font-mono text-zinc-100 sm:text-2xl">
            {{ formatAgo(rabtaSync.lastSyncAt) }}
          </div>
          <p class="font-mono text-[10px] text-zinc-500" v-if="rabtaSync.durationMs">
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
          <span :title="`${rabtaSync.bisection?.rangesBisected || 0} divergences split recursively`">
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
