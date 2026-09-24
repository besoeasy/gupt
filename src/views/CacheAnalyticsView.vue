<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import { RETENTION_MAX_BYTES } from "@/config/retention";
import { cleanupLocalDataKeepingAccount } from "@/lib/appReset";
import { getCacheSummary, getRawEventsBreakdown, purgeExpiredCache } from "@/lib/idb";
import { useReplicationStore } from "@/stores/replication";
import { Database, RefreshCw, Trash2 } from "@lucide/vue";

const summary = ref(null);
const rawBreakdown = ref(null);
const loading = ref(true);
const actionLoading = ref(false);
const message = ref("");
const error = ref("");
const showClearConfirm = ref(false);

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
  encMedia: "Encrypted media",
  decMedia: "Decrypted media",
  stagedUploads: "Staged uploads",
  roomMeta: "Conversations",
  groups: "Groups",
  rawEvents: "Events",
  dmMessages: "Messages",
};

const ORIGIN_LABELS = {
  dm: "Direct messages",
  group: "Group messages",
  bookmarks: "Bookmarks",
  passwords: "Passwords",
  notes: "Notes",
  share: "Secure share",
  invite: "Invites",
  unknown: "Other",
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
    .sort(
      (a, b) =>
        (b.estimatedBytes || 0) - (a.estimatedBytes || 0) || (b.entries || 0) - (a.entries || 0),
    )
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
const replicationStore = useReplicationStore();

const replicationStatusLabel = computed(() => {
  if (!replicationStore.active) return "Idle";
  if (typeof document !== "undefined" && document.hidden) return "Paused";
  return "Active";
});

const replicationLastAgo = computed(() => {
  const ts = replicationStore.lastTickAt;
  if (!ts) return "—";
  const diff = Math.max(0, Math.floor((now.value - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
});

const replicationDots = computed(() => {
  const history = replicationStore.history || [];
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
    const [cacheSummary, eventsBreakdown] = await Promise.all([
      getCacheSummary(),
      getRawEventsBreakdown(),
    ]);
    summary.value = cacheSummary;
    rawBreakdown.value = eventsBreakdown;
  } catch (e) {
    error.value = e.message || "Failed to load cache.";
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
    message.value = "Expired records removed.";
  } catch (e) {
    error.value = e.message || "Failed to purge expired entries.";
  } finally {
    actionLoading.value = false;
  }
}

async function handleClearLocalData() {
  showClearConfirm.value = false;
  actionLoading.value = true;
  message.value = "";
  error.value = "";
  try {
    await cleanupLocalDataKeepingAccount();
    await loadAnalytics();
    message.value = "Local cache cleared. Your keys were kept.";
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
    await replicationStore.triggerReplicationTick();
    await loadAnalytics();
    message.value = "Relay sync finished.";
  } catch (e) {
    error.value = e.message || "Sync failed.";
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
  <div class="h-full w-full min-w-0 overflow-y-auto bg-black text-zinc-100 pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto w-full max-w-2xl space-y-5">
        <!-- Header Section -->
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400"
            >
              <Database class="h-5 w-5" />
            </div>
            <div class="min-w-0">
              <h1 class="truncate text-xl font-semibold tracking-tight text-white">Cache</h1>
              <p class="mt-0.5 truncate text-xs text-zinc-500 leading-relaxed">
                Local storage on this device.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              :disabled="actionLoading || replicationStore.active"
              class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Sync now"
              @click="handleManualSync"
            >
              <RefreshCw
                class="h-3.5 w-3.5"
                :stroke-width="2.2"
                :class="{ 'animate-spin': actionLoading || replicationStore.active }"
              />
              <span>Sync Now</span>
            </button>
            <button
              type="button"
              :disabled="loading"
              class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50 cursor-pointer"
              title="Refresh"
              @click="loadAnalytics"
            >
              <RefreshCw class="h-3.5 w-3.5" :stroke-width="2" :class="{ 'animate-spin': loading }" />
            </button>
          </div>
        </div>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <!-- Shimmer Skeleton Loading State -->
        <div v-if="loading" class="space-y-2">
          <div
            v-for="n in 3"
            :key="n"
            class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:p-5"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="h-3.5 w-28 rounded bg-zinc-900 animate-pulse" />
              <div class="h-3 w-20 rounded bg-zinc-900/60 animate-pulse shrink-0" />
            </div>
            <div class="mx-auto mt-4 h-40 w-40 rounded-full bg-zinc-900 animate-pulse" />
            <div class="mt-4 space-y-2">
              <div class="h-3 w-full rounded bg-zinc-900/40 animate-pulse" />
              <div class="h-3 w-3/4 rounded bg-zinc-900/40 animate-pulse" />
            </div>
          </div>
        </div>

        <template v-else-if="summary">
          <!-- Storage Card -->
          <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5 space-y-4 shadow-xs">
            <div class="flex items-end justify-between gap-3">
              <div class="space-y-1">
                <h2 class="text-sm font-semibold tracking-tight text-white">Storage</h2>
                <p class="text-xs text-zinc-500 leading-relaxed">
                  Kept for {{ summary.maxAgeDays }} days, then removed automatically.
                </p>
              </div>
              <p class="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                {{ formatBytes(summary.totalEstimatedBytes) }} /
                {{ formatBytes(RETENTION_MAX_BYTES) }}
              </p>
            </div>

            <div class="flex justify-center py-1">
              <div class="relative h-52 w-52">
                <svg class="h-full w-full -rotate-90 transform" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r="45"
                    fill="transparent"
                    stroke="#18181b"
                    stroke-width="14"
                  />
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
                      hoveredStore && hoveredStore !== store.key ? 'opacity-30' : 'opacity-100',
                    ]"
                    @mouseenter="hoveredStore = store.key"
                    @mouseleave="hoveredStore = null"
                  />
                </svg>
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-6"
                >
                  <template v-if="activeStore">
                    <span
                      class="text-[11px] font-semibold truncate max-w-full"
                      :class="activeStore.textColor"
                    >
                      {{ activeStore.displayName }}
                    </span>
                    <span class="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-white">
                      {{ formatBytes(activeStore.estimatedBytes) }}
                    </span>
                    <span class="font-mono text-[11px] tabular-nums text-zinc-500">
                      {{ activeStore.percentage }}%
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-[11px] font-semibold text-zinc-500">Used</span>
                    <span class="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-white">
                      {{ formatBytes(summary.totalEstimatedBytes) }}
                    </span>
                    <span class="font-mono text-[11px] tabular-nums text-zinc-500">
                      {{ storageUsedPct.toFixed(1) }}% of max
                    </span>
                  </template>
                </div>
              </div>
            </div>

            <div class="space-y-0.5">
              <div
                v-for="store in sortedStores"
                :key="store.key"
                class="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-zinc-900/40 cursor-pointer"
                @mouseenter="hoveredStore = store.key"
                @mouseleave="hoveredStore = null"
              >
                <span class="h-2 w-2 shrink-0 rounded-full" :class="store.color" />
                <p class="flex-1 min-w-0 text-xs sm:text-sm truncate font-medium text-zinc-200">
                  {{ store.displayName }}
                </p>
                <p class="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                  {{ store.entries.toLocaleString() }} · {{ formatBytes(store.estimatedBytes) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Relay Sync Card -->
          <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5 space-y-3 shadow-xs">
            <div class="flex items-center justify-between gap-3">
              <div class="space-y-1">
                <h2 class="text-sm font-semibold tracking-tight text-white">Relay sync</h2>
                <p class="text-xs text-zinc-500 tabular-nums">
                  {{ replicationStatusLabel }} · last {{ replicationLastAgo }}
                </p>
              </div>
              <button
                type="button"
                :disabled="actionLoading || replicationStore.active"
                class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50 cursor-pointer"
                @click="handleManualSync"
              >
                <RefreshCw
                  class="h-3.5 w-3.5"
                  :stroke-width="2"
                  :class="{ 'animate-spin': actionLoading || replicationStore.active }"
                />
                Sync
              </button>
            </div>
            <div class="flex items-center gap-1.5">
              <span
                v-for="(dot, i) in replicationDots"
                :key="i"
                class="h-1.5 w-1.5 rounded-full"
                :class="{
                  'bg-emerald-400': dot === 'ok',
                  'bg-red-400': dot === 'err',
                  'bg-zinc-800': dot === 'empty',
                }"
              />
            </div>
          </div>

          <!-- Cached Items Card -->
          <div
            v-if="rawBreakdown"
            class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5 space-y-2 shadow-xs"
          >
            <div class="flex items-end justify-between gap-3 pb-1">
              <div class="space-y-1">
                <h2 class="text-sm font-semibold tracking-tight text-white">Cached items</h2>
              </div>
              <p class="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                {{ rawBreakdown.live.toLocaleString() }} live
                <span v-if="rawBreakdown.expired">
                  · {{ rawBreakdown.expired.toLocaleString() }} expired
                </span>
              </p>
            </div>

            <div v-if="!rawBreakdown.byOrigin.length" class="py-8 text-center">
              <p class="text-sm font-semibold text-white">Nothing cached yet</p>
              <p class="mt-1 text-xs text-zinc-500">Items will appear here after sync.</p>
            </div>
            <div
              v-for="row in rawBreakdown.byOrigin"
              :key="row.origin"
              class="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-zinc-900/40"
            >
              <p class="flex-1 min-w-0 text-xs sm:text-sm truncate font-medium text-zinc-200">
                {{ ORIGIN_LABELS[row.origin] || row.origin }}
              </p>
              <p class="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                {{ row.count.toLocaleString() }} · {{ formatBytes(row.estimatedBytes) }}
              </p>
            </div>
          </div>

          <!-- Maintenance Card -->
          <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5 space-y-3 shadow-xs">
            <div class="space-y-1">
              <h2 class="text-sm font-semibold tracking-tight text-white">Maintenance</h2>
              <p class="text-xs text-zinc-500 leading-relaxed">
                Purge stale records, or wipe local data. Your keys stay on this device.
              </p>
            </div>
            <div class="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                :disabled="actionLoading"
                class="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50 cursor-pointer"
                @click="handlePurgeExpired"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': actionLoading }" />
                Purge expired
              </button>
              <button
                type="button"
                :disabled="actionLoading"
                class="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 text-xs font-medium text-red-300 shadow-xs transition-all hover:border-red-800 hover:bg-red-900/40 hover:text-red-200 disabled:opacity-50 cursor-pointer"
                @click="showClearConfirm = true"
              >
                <Trash2 class="h-3.5 w-3.5" />
                Clear cache
              </button>
            </div>
          </div>
        </template>
      </div>
    </main>

    <AppConfirmDialog
      :open="showClearConfirm"
      title="Clear local cache?"
      message="This deletes cached events and media on this device. Your identity and keys stay."
      confirm-label="Clear cache"
      @confirm="handleClearLocalData"
      @cancel="showClearConfirm = false"
    />
  </div>
</template>
