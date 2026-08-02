<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { RETENTION_MAX_BYTES } from "@/config/retention";
import { cleanupLocalDataKeepingAccount } from "@/lib/appReset";
import { getCacheSummary, purgeExpiredCache } from "@/lib/idb";
import { replicationState, triggerReplicationTick } from "@/composables/useReplicationWorker";
import {
  Database,
  HardDrive,
  RefreshCw,
  Trash2,
  Activity,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "@lucide/vue";

const summary = ref(null);
const loading = ref(true);
const actionLoading = ref(false);
const message = ref("");
const error = ref("");

const STORE_COLOR_MAP = {
  encMedia: { bg: "bg-sky-500", stroke: "#0ea5e9", text: "text-sky-400" },
  decMedia: { bg: "bg-indigo-500", stroke: "#6366f1", text: "text-indigo-400" },
  stagedUploads: { bg: "bg-amber-500", stroke: "#f59e0b", text: "text-amber-400" },
  dmMessages: { bg: "bg-emerald-500", stroke: "#10b981", text: "text-emerald-400" },
  roomMeta: { bg: "bg-purple-500", stroke: "#a855f7", text: "text-purple-400" },
  groups: { bg: "bg-rose-500", stroke: "#f43f5e", text: "text-rose-400" },
  rawEvents: { bg: "bg-cyan-500", stroke: "#06b6d4", text: "text-cyan-400" },
};
const DEFAULT_COLOR = { bg: "bg-zinc-500", stroke: "#71717a", text: "text-zinc-400" };

const STORE_NAMES = {
  encMedia: "Encrypted Media Cache",
  decMedia: "Decrypted Media Cache",
  stagedUploads: "Staged Uploads",
  roomMeta: "Room Metadata",
  groups: "Group Records",
  rawEvents: "Raw Nostr Events",
};

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size >= 10 || idx === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[idx]}`;
}

function pct(value, total) {
  if (!total) return 0;
  return Math.min(100, (value / total) * 100);
}

const storageUsedPct = computed(() =>
  pct(summary.value?.totalEstimatedBytes || 0, RETENTION_MAX_BYTES),
);

const hoveredStore = ref(null);

const activeStore = computed(() => {
  if (!hoveredStore.value) return null;
  return (
    sortedStores.value.find((s) => s.key === hoveredStore.value || s.name === hoveredStore.value) ||
    null
  );
});

const sortedStores = computed(() => {
  if (!summary.value?.stores) return [];
  const totalBytes = summary.value.totalEstimatedBytes || 0;
  return [...summary.value.stores]
    .sort((a, b) => (b.estimatedBytes || b.entries || 0) - (a.estimatedBytes || a.entries || 0))
    .map((store) => {
      const storeKey = store.table || store.name;
      const storePct = totalBytes > 0 ? Math.round((store.estimatedBytes / totalBytes) * 100) : 0;
      const colorInfo = STORE_COLOR_MAP[storeKey] || DEFAULT_COLOR;
      return {
        ...store,
        key: storeKey,
        displayName: STORE_NAMES[storeKey] || store.label || storeKey,
        color: colorInfo.bg,
        strokeColor: colorInfo.stroke,
        textColor: colorInfo.text,
        percentage: storePct,
      };
    });
});

const donutSegments = computed(() => {
  const stores = sortedStores.value;
  if (!stores.length) return [];

  const radius = 45;
  const circumference = 2 * Math.PI * radius;

  const totalBytes = summary.value?.totalEstimatedBytes || 0;
  const totalEntries = summary.value?.totalEntries || 0;
  let accumulatedOffset = 0;

  return stores.map((store) => {
    let fraction = 0;
    if (totalBytes > 0) {
      fraction = store.estimatedBytes / totalBytes;
    } else if (totalEntries > 0) {
      fraction = store.entries / totalEntries;
    } else {
      fraction = 1 / stores.length;
    }

    const segmentLength = fraction * circumference;
    const dashLength = Math.max(0, segmentLength - (stores.length > 1 ? 1.5 : 0));
    const strokeDasharray = `${dashLength} ${circumference - dashLength}`;
    const strokeDashoffset = -accumulatedOffset;
    accumulatedOffset += segmentLength;

    return {
      ...store,
      fraction,
      strokeDasharray,
      strokeDashoffset,
    };
  });
});

const now = ref(Date.now());
let nowTimer = null;
const replication = replicationState;

const replicationStatusLabel = computed(() => {
  if (!replication.value.active) return "Idle";
  if (typeof document !== "undefined" && document.hidden) return "Paused";
  return "Active";
});

const replicationLastAgo = computed(() => {
  const ts = replication.value.lastTickAt;
  if (!ts) return "—";
  const diff = Math.max(0, Math.floor((now.value - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
});

const replicationDots = computed(() => {
  const history = replication.value.history || [];
  const dots = [];
  for (let i = 0; i < 5; i++) {
    const entry = history[i];
    dots.push(entry ? (entry.ok ? "ok" : "err") : "empty");
  }
  return dots;
});

async function loadAnalytics() {
  loading.value = true;
  error.value = "";
  try {
    summary.value = await getCacheSummary();
  } catch (e) {
    error.value = e.message || "Failed to load cache analytics.";
  } finally {
    loading.value = false;
  }
}

async function handlePurgeExpired() {
  actionLoading.value = true;
  message.value = "";
  error.value = "";
  try {
    await purgeExpiredCache();
    await loadAnalytics();
    message.value = "Successfully purged expired cache entries.";
  } catch (e) {
    error.value = e.message || "Failed to purge expired entries.";
  } finally {
    actionLoading.value = false;
  }
}

async function handleClearLocalData() {
  if (!confirm("Clear local cache and event databases? Your account keys will remain safe.")) {
    return;
  }
  actionLoading.value = true;
  message.value = "";
  error.value = "";
  try {
    await cleanupLocalDataKeepingAccount();
    await loadAnalytics();
    message.value = "Local cache and event store cleared successfully.";
  } catch (e) {
    error.value = e.message || "Failed to clear cache.";
  } finally {
    actionLoading.value = false;
  }
}

async function handleManualSync() {
  actionLoading.value = true;
  message.value = "";
  error.value = "";
  try {
    await triggerReplicationTick();
    await loadAnalytics();
    message.value = "Replication worker cycle completed.";
  } catch (e) {
    error.value = e.message || "Manual replication tick failed.";
  } finally {
    actionLoading.value = false;
  }
}

onMounted(() => {
  void loadAnalytics();
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer);
});
</script>

<template>
  <div class="min-h-screen pb-12">
    <main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <!-- Header -->
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">Cache Analytics</h1>
          <p class="mt-1 text-sm text-(--app-muted)">
            IndexedDB storage breakdown, retention metrics, and local cache controls
          </p>
        </div>

        <button
          @click="loadAnalytics"
          :disabled="loading"
          class="flex h-9 items-center gap-2 rounded-xl border border-(--app-border) bg-(--app-surface) px-3 py-1.5 text-xs font-semibold text-(--app-text) transition-colors hover:bg-(--app-surface-hover) cursor-pointer disabled:opacity-50"
        >
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
          <span>Refresh</span>
        </button>
      </div>

      <AppAlertBanner v-if="message" :message="message" variant="success" class="mb-6" />
      <AppAlertBanner v-if="error" :message="error" class="mb-6" />

      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 class="h-8 w-8 animate-spin text-(--app-primary)" />
        <p class="mt-3 text-sm text-(--app-muted)">Analyzing IndexedDB cache tables…</p>
      </div>

      <template v-else-if="summary">
        <!-- Storage Overview KPI Cards -->
        <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <!-- Used Storage -->
          <div class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-4">
            <div class="flex items-center justify-between text-xs font-medium text-(--app-muted)">
              <span>Storage Used</span>
              <HardDrive class="h-4 w-4 text-emerald-400" />
            </div>
            <div class="mt-3 text-2xl font-extrabold text-(--app-text) tabular-nums">
              {{ formatBytes(summary.totalEstimatedBytes) }}
            </div>
            <div class="mt-1 text-xs text-(--app-muted) tabular-nums">
              {{ storageUsedPct.toFixed(1) }}% of {{ formatBytes(RETENTION_MAX_BYTES) }} max
            </div>
          </div>

          <!-- Total Entries -->
          <div class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-4">
            <div class="flex items-center justify-between text-xs font-medium text-(--app-muted)">
              <span>Total Entries</span>
              <Database class="h-4 w-4 text-sky-400" />
            </div>
            <div class="mt-3 text-2xl font-extrabold text-(--app-text) tabular-nums">
              {{ summary.totalEntries.toLocaleString() }}
            </div>
            <div class="mt-1 text-xs text-(--app-muted)">
              Across {{ summary.stores.length }} tables
            </div>
          </div>

          <!-- Retention Window -->
          <div class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-4">
            <div class="flex items-center justify-between text-xs font-medium text-(--app-muted)">
              <span>Retention Window</span>
              <Clock class="h-4 w-4 text-amber-400" />
            </div>
            <div class="mt-3 text-2xl font-extrabold text-(--app-text) tabular-nums">
              {{ summary.maxAgeDays }} Days
            </div>
            <div class="mt-1 text-xs text-(--app-muted)">Rolling auto-purge</div>
          </div>

          <!-- Background Worker -->
          <div class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-4">
            <div class="flex items-center justify-between text-xs font-medium text-(--app-muted)">
              <span>Replication Worker</span>
              <Activity class="h-4 w-4 text-indigo-400" />
            </div>
            <div class="mt-3 text-2xl font-extrabold text-(--app-text)">
              {{ replicationStatusLabel }}
            </div>
            <div class="mt-1 flex items-center justify-between text-xs text-(--app-muted)">
              <span>{{ replicationLastAgo }}</span>
              <div class="flex gap-1">
                <span
                  v-for="(dot, i) in replicationDots"
                  :key="i"
                  class="h-2 w-2 rounded-full"
                  :class="{
                    'bg-emerald-400': dot === 'ok',
                    'bg-red-400': dot === 'err',
                    'bg-zinc-700': dot === 'empty',
                  }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Overall Storage Meter & Donut Chart -->
        <div
          class="mb-6 rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-6 space-y-6"
        >
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-base font-bold text-(--app-text)">IndexedDB Store Distribution</h2>
              <p class="text-xs text-(--app-muted) mt-0.5">
                Visual breakdown of cache footprint across database stores
              </p>
            </div>
            <span class="text-xs font-semibold text-(--app-muted) tabular-nums">
              {{ sortedStores.length }} Cache Stores
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <!-- Donut Chart Canvas -->
            <div class="md:col-span-5 flex flex-col items-center justify-center p-2 relative">
              <div class="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
                <svg class="w-full h-full -rotate-90 transform" viewBox="0 0 120 120">
                  <!-- Background Track Ring -->
                  <circle
                    cx="60"
                    cy="60"
                    r="45"
                    fill="transparent"
                    stroke="currentColor"
                    class="text-zinc-800"
                    stroke-width="14"
                  />
                  <!-- Segment Circles -->
                  <circle
                    v-for="store in donutSegments"
                    :key="store.key"
                    cx="60"
                    cy="60"
                    r="45"
                    fill="transparent"
                    :stroke="store.strokeColor"
                    :stroke-width="hoveredStore === store.key ? 18 : 14"
                    :stroke-dasharray="store.strokeDasharray"
                    :stroke-dashoffset="store.strokeDashoffset"
                    :class="[
                      'transition-all duration-300 ease-out cursor-pointer',
                      hoveredStore && hoveredStore !== store.key ? 'opacity-40' : 'opacity-100',
                    ]"
                    @mouseenter="hoveredStore = store.key"
                    @mouseleave="hoveredStore = null"
                  />
                </svg>

                <!-- Center Content -->
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none"
                >
                  <template v-if="activeStore">
                    <span
                      class="text-xs font-bold tracking-wide uppercase truncate max-w-[140px]"
                      :class="activeStore.textColor"
                    >
                      {{ activeStore.displayName }}
                    </span>
                    <span
                      class="text-xl sm:text-2xl font-extrabold text-(--app-text) tabular-nums tracking-tight mt-1"
                    >
                      {{ formatBytes(activeStore.estimatedBytes) }}
                    </span>
                    <span class="text-xs font-medium text-(--app-muted) mt-0.5 tabular-nums">
                      {{ activeStore.percentage }}% of total
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-xs font-semibold text-(--app-muted) uppercase tracking-wider"
                      >Total Data</span
                    >
                    <span
                      class="text-2xl sm:text-3xl font-extrabold text-(--app-text) tabular-nums tracking-tight mt-1"
                    >
                      {{ formatBytes(summary.totalEstimatedBytes) }}
                    </span>
                    <span class="text-xs font-medium text-(--app-muted) mt-0.5 tabular-nums">
                      {{ summary.totalEntries.toLocaleString() }} records
                    </span>
                  </template>
                </div>
              </div>
            </div>

            <!-- Table Detailed Store Cards -->
            <div class="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div
                v-for="store in sortedStores"
                :key="store.key"
                class="flex items-center justify-between rounded-xl bg-(--app-surface-hover) p-3 text-xs border transition-all cursor-pointer"
                :class="[
                  hoveredStore === store.key
                    ? 'border-(--app-primary)/50 bg-(--app-surface-hover)'
                    : 'border-transparent hover:border-(--app-border)',
                ]"
                @mouseenter="hoveredStore = store.key"
                @mouseleave="hoveredStore = null"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="h-3 w-3 rounded-full shrink-0" :class="store.color" />
                  <div class="min-w-0">
                    <p class="font-semibold text-(--app-text) truncate">{{ store.displayName }}</p>
                    <p class="text-[11px] text-(--app-muted) tabular-nums">
                      {{ store.entries.toLocaleString() }} records
                    </p>
                  </div>
                </div>
                <div class="text-right shrink-0 ml-2">
                  <p class="font-bold text-(--app-text) tabular-nums">
                    {{ formatBytes(store.estimatedBytes) }}
                  </p>
                  <p class="text-[11px] text-(--app-muted) tabular-nums font-semibold">
                    {{ store.percentage }}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Dedicated Replication & Sync Worker Section -->
        <div class="mb-6 rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 space-y-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-bold text-(--app-text)">Background Replication Worker</h2>
                <span
                  class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  :class="
                    replication.active
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-zinc-500/15 text-zinc-400'
                  "
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full"
                    :class="replication.active ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-400'"
                  />
                  {{ replicationStatusLabel }}
                </span>
              </div>
              <p class="text-xs text-(--app-muted) mt-0.5">
                Periodic background worker syncing local database state with Nostr relays &
                cross-tab messaging
              </p>
            </div>

            <button
              @click="handleManualSync"
              :disabled="actionLoading || replication.active"
              class="flex items-center justify-center gap-2 rounded-xl bg-(--app-primary)/15 px-3.5 py-2 text-xs font-semibold text-(--app-primary) hover:bg-(--app-primary)/25 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                class="h-3.5 w-3.5"
                :class="{ 'animate-spin': actionLoading || replication.active }"
              />
              <span>Sync Now</span>
            </button>
          </div>

          <!-- Replication History Log -->
          <div class="space-y-2 pt-1">
            <p class="text-xs font-semibold text-(--app-muted)">Recent Replication Ticks</p>
            <div
              v-if="!replication.history.length"
              class="py-6 text-center text-xs text-(--app-muted)"
            >
              No replication ticks recorded yet.
            </div>
            <div v-else class="space-y-1.5">
              <div
                v-for="(tick, idx) in [...replication.history].reverse()"
                :key="tick.at || idx"
                class="flex items-center justify-between rounded-xl bg-(--app-surface-hover) px-3 py-2 text-xs"
              >
                <div class="flex items-center gap-2">
                  <span
                    class="h-2 w-2 rounded-full shrink-0"
                    :class="tick.ok ? 'bg-emerald-400' : 'bg-red-400'"
                  />
                  <span class="text-(--app-text) font-mono">
                    {{ new Date(tick.at).toLocaleTimeString() }}
                  </span>
                </div>
                <div class="flex items-center gap-3 text-(--app-muted) tabular-nums">
                  <span>Published: {{ tick.published }}</span>
                  <span :class="tick.errors > 0 ? 'text-red-400 font-bold' : ''"
                    >Errors: {{ tick.errors }}</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Management Actions -->
        <div class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 space-y-4">
          <h2 class="text-base font-bold text-(--app-text)">Cache Maintenance & Actions</h2>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <!-- Purge Expired -->
            <div
              class="flex flex-col justify-between rounded-xl border border-(--app-border) p-4 space-y-3"
            >
              <div>
                <p class="text-sm font-semibold text-(--app-text)">Purge Expired Records</p>
                <p class="text-xs text-(--app-muted) mt-1">
                  Remove stale events and expired decrypted cache records based on NIP-40
                  expiration.
                </p>
              </div>
              <button
                @click="handlePurgeExpired"
                :disabled="actionLoading"
                class="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': actionLoading }" />
                <span>Run Expired Purge</span>
              </button>
            </div>

            <!-- Clear Local Cache -->
            <div
              class="flex flex-col justify-between rounded-xl border border-(--app-border) p-4 space-y-3"
            >
              <div>
                <p class="text-sm font-semibold text-(--app-text)">Clear Local Cache</p>
                <p class="text-xs text-(--app-muted) mt-1">
                  Clear local event databases and media cache while preserving your account
                  identity.
                </p>
              </div>
              <button
                @click="handleClearLocalData"
                :disabled="actionLoading"
                class="flex items-center justify-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/25 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 class="h-3.5 w-3.5" />
                <span>Clear Cache Stores</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>
