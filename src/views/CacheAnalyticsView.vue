<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import { RETENTION_MAX_BYTES } from "@/config/retention";
import { cleanupLocalDataKeepingAccount } from "@/lib/appReset";
import { getCacheSummary, getRawEventsBreakdown, purgeExpiredCache } from "@/lib/idb";
import { replicationState, triggerReplicationTick } from "@/composables/useReplicationWorker";
import {
  Database,
  HardDrive,
  RefreshCw,
  Trash2,
  Activity,
  Clock,
  Tag,
  Layers,
  Hash,
} from "@lucide/vue";

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
  encMedia: "Encrypted Media Cache",
  decMedia: "Decrypted Media Cache",
  stagedUploads: "Staged Uploads",
  roomMeta: "Room Metadata",
  groups: "Group Records",
  rawEvents: "Raw Events",
};

const ORIGIN_LABELS = {
  dm: "Direct messages",
  group: "Group messages",
  bookmarks: "Bookmarks",
  passwords: "Passwords",
  notes: "Notes",
  share: "Secure share",
  invite: "Invites",
  unknown: "Unknown",
};

const GUPT_TAG_LABELS = {
  gupt_bookmark: "Bookmarks",
  gupt_password: "Passwords",
  gupt_note: "Notes",
  gupt_share: "Secure share",
  invite: "Invites",
  gupt_invite: "Invites",
  gupt_vault: "Legacy vault",
};

const ORIGIN_COLORS = {
  dm: "bg-emerald-500",
  group: "bg-rose-500",
  bookmarks: "bg-sky-500",
  passwords: "bg-amber-500",
  notes: "bg-violet-500",
  share: "bg-cyan-500",
  invite: "bg-pink-500",
  unknown: "bg-zinc-500",
};

const TAG_COLORS = {
  gupt_bookmark: "bg-sky-500",
  gupt_password: "bg-amber-500",
  gupt_note: "bg-violet-500",
  gupt_share: "bg-cyan-500",
  gupt_invite: "bg-pink-500",
  gupt_vault: "bg-zinc-500",
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
    const [cacheSummary, eventsBreakdown] = await Promise.all([
      getCacheSummary(),
      getRawEventsBreakdown(),
    ]);
    summary.value = cacheSummary;
    rawBreakdown.value = eventsBreakdown;
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
    message.value = "Successfully purged expired cache records.";
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
  <div class="min-h-screen bg-(--app-bg) text-(--app-text) pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <!-- Header Section -->
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-(--app-border) pb-6"
      >
        <div>
          <div class="flex items-center gap-2.5 flex-wrap">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-2xl bg-(--app-primary)/10 text-(--app-primary)"
            >
              <Database class="h-4.5 w-4.5" />
            </div>
            <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">Cache Analytics</h1>
            <span
              v-if="summary"
              class="rounded-full bg-(--app-surface-soft) px-2.5 py-0.5 text-xs font-bold tabular-nums text-(--app-muted)"
            >
              {{ summary.totalEntries.toLocaleString() }} records
            </span>
          </div>
          <p class="mt-1 text-sm text-(--app-muted)">
            IndexedDB storage footprint, TTL retention metrics, and local event database
            diagnostics.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Manual Replication Sync -->
          <button
            type="button"
            :disabled="actionLoading || replication.active"
            class="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-(--app-border) bg-(--app-surface) px-3.5 text-xs font-semibold text-(--app-text-soft) shadow-sm transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-50 cursor-pointer"
            title="Trigger background sync cycle"
            @click="handleManualSync"
          >
            <Activity
              class="h-3.5 w-3.5"
              :class="{ 'animate-spin': actionLoading || replication.active }"
            />
            <span>Sync Relays</span>
          </button>

          <!-- Refresh Analytics -->
          <button
            type="button"
            :disabled="loading"
            class="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-(--app-primary) px-4 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-95 disabled:opacity-50 cursor-pointer"
            @click="loadAnalytics"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />

      <!-- Shimmer Loading State -->
      <div v-if="loading" class="space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div
            v-for="n in 4"
            :key="n"
            class="h-28 rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 animate-pulse"
          />
        </div>
        <div
          class="h-64 rounded-3xl border border-(--app-border) bg-(--app-surface) p-6 animate-pulse"
        />
      </div>

      <template v-else-if="summary">
        <!-- Storage Overview KPI Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Used Storage -->
          <div
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 shadow-xs space-y-3"
          >
            <div
              class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--app-muted)"
            >
              <span>Storage Used</span>
              <HardDrive class="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <div
                class="text-2xl sm:text-3xl font-extrabold text-(--app-text) tabular-nums tracking-tight"
              >
                {{ formatBytes(summary.totalEstimatedBytes) }}
              </div>
              <p class="mt-1 text-xs text-(--app-muted) tabular-nums">
                {{ storageUsedPct.toFixed(1) }}% of {{ formatBytes(RETENTION_MAX_BYTES) }} max
              </p>
            </div>
            <!-- Visual Progress Bar -->
            <div class="h-1.5 w-full rounded-full bg-(--app-surface-soft) overflow-hidden">
              <div
                class="h-full rounded-full bg-linear-to-r from-emerald-500 to-(--app-primary) transition-all duration-500"
                :style="{ width: `${Math.max(2, storageUsedPct)}%` }"
              />
            </div>
          </div>

          <!-- Total Entries -->
          <div
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 shadow-xs space-y-3"
          >
            <div
              class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--app-muted)"
            >
              <span>Indexed Records</span>
              <Database class="h-4 w-4 text-sky-400" />
            </div>
            <div>
              <div
                class="text-2xl sm:text-3xl font-extrabold text-(--app-text) tabular-nums tracking-tight"
              >
                {{ summary.totalEntries.toLocaleString() }}
              </div>
              <p class="mt-1 text-xs text-(--app-muted)">
                Across {{ summary.stores.length }} Dexie tables
              </p>
            </div>
            <div class="flex items-center gap-1.5 text-xs text-(--app-muted)">
              <span class="h-2 w-2 rounded-full bg-sky-400" />
              <span>TTL cache active</span>
            </div>
          </div>

          <!-- Retention Window -->
          <div
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 shadow-xs space-y-3"
          >
            <div
              class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--app-muted)"
            >
              <span>Retention Window</span>
              <Clock class="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <div
                class="text-2xl sm:text-3xl font-extrabold text-(--app-text) tabular-nums tracking-tight"
              >
                {{ summary.maxAgeDays }} Days
              </div>
              <p class="mt-1 text-xs text-(--app-muted)">Auto-purged on 6-hour cycle</p>
            </div>
            <div class="flex items-center gap-1.5 text-xs text-(--app-muted)">
              <span class="h-2 w-2 rounded-full bg-amber-400" />
              <span>Rolling NIP-40 policy</span>
            </div>
          </div>

          <!-- Background Worker -->
          <div
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 shadow-xs space-y-3"
          >
            <div
              class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--app-muted)"
            >
              <span>Replication Worker</span>
              <Activity class="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span
                  class="h-2.5 w-2.5 rounded-full"
                  :class="replication.active ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400/60'"
                />
                <span class="text-2xl sm:text-3xl font-extrabold text-(--app-text) tracking-tight">
                  {{ replicationStatusLabel }}
                </span>
              </div>
              <p class="mt-1 text-xs text-(--app-muted)">Last tick: {{ replicationLastAgo }}</p>
            </div>
            <!-- 5 Ticks Status Dots -->
            <div class="flex items-center gap-1.5 pt-0.5">
              <span
                v-for="(dot, i) in replicationDots"
                :key="i"
                class="h-2 w-2 rounded-full transition-colors"
                :class="{
                  'bg-emerald-400 shadow-xs': dot === 'ok',
                  'bg-rose-400': dot === 'err',
                  'bg-(--app-surface-soft)': dot === 'empty',
                }"
              />
            </div>
          </div>
        </div>

        <!-- Database Store Distribution & Interactive Donut Chart -->
        <section
          class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-6 sm:p-8 shadow-xs space-y-6"
        >
          <div
            class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-(--app-border) pb-4"
          >
            <div>
              <h2 class="text-lg font-bold text-(--app-text)">IndexedDB Store Distribution</h2>
              <p class="text-xs text-(--app-muted) mt-0.5">
                Breakdown of memory and record footprint across local database tables
              </p>
            </div>
            <span class="text-xs font-bold text-(--app-muted) tabular-nums">
              {{ sortedStores.length }} Storage Tables
            </span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <!-- Donut Chart -->
            <div class="lg:col-span-5 flex flex-col items-center justify-center p-2">
              <div class="relative w-60 h-60 sm:w-68 sm:h-68 flex items-center justify-center">
                <svg class="w-full h-full -rotate-90 transform" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r="45"
                    fill="transparent"
                    stroke="var(--app-surface-soft)"
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

                <!-- Center Label -->
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none"
                >
                  <template v-if="activeStore">
                    <span
                      class="text-xs font-bold tracking-wide uppercase truncate max-w-[130px]"
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
                    <span class="text-xs font-bold text-(--app-muted) uppercase tracking-wider">
                      Total Data
                    </span>
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

            <!-- Stores Table List -->
            <div class="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="store in sortedStores"
                :key="store.key"
                class="flex items-center justify-between rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3.5 text-xs transition-all duration-150 cursor-pointer shadow-xs hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)"
                :class="[
                  hoveredStore === store.key
                    ? 'border-(--app-primary) bg-(--app-surface-hover) ring-1 ring-(--app-primary)/30'
                    : '',
                ]"
                @mouseenter="hoveredStore = store.key"
                @mouseleave="hoveredStore = null"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <span class="h-3 w-3 rounded-full shrink-0" :class="store.color" />
                  <div class="min-w-0">
                    <p class="font-bold text-(--app-text) truncate">{{ store.displayName }}</p>
                    <p class="text-[11px] text-(--app-muted) tabular-nums mt-0.5">
                      {{ store.entries.toLocaleString() }} records
                    </p>
                  </div>
                </div>
                <div class="text-right shrink-0 ml-2">
                  <p class="font-bold text-(--app-text) tabular-nums">
                    {{ formatBytes(store.estimatedBytes) }}
                  </p>
                  <p class="text-[11px] text-(--app-muted) tabular-nums font-semibold mt-0.5">
                    {{ store.percentage }}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Cached Raw Events (By Origin, Tag & Kind) -->
        <section
          v-if="rawBreakdown"
          class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-6 sm:p-8 shadow-xs space-y-6"
        >
          <div
            class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-(--app-border) pb-4"
          >
            <div>
              <h2 class="text-lg font-bold text-(--app-text)">Raw Events</h2>
              <p class="mt-0.5 text-xs text-(--app-muted)">
                Local event cache categorized by Dexie origins and encrypted gupt tags
              </p>
            </div>
            <div class="flex flex-wrap gap-3 text-xs tabular-nums text-(--app-muted)">
              <span
                class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-1.5"
              >
                <strong class="text-(--app-text)">{{ rawBreakdown.total.toLocaleString() }}</strong>
                total
              </span>
              <span
                class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-1.5 text-emerald-400"
              >
                <strong>{{ rawBreakdown.live.toLocaleString() }}</strong> live
              </span>
              <span
                class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-1.5 text-amber-400"
              >
                <strong>{{ rawBreakdown.expired.toLocaleString() }}</strong> expired
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <!-- By Origin -->
            <div class="space-y-3">
              <div
                class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--app-text)"
              >
                <Layers class="h-4 w-4 text-(--app-primary)" />
                <h3>Events by Origin</h3>
              </div>

              <div
                v-if="!rawBreakdown.byOrigin.length"
                class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-8 text-center text-xs text-(--app-muted)"
              >
                No raw events cached yet.
              </div>
              <div v-else class="space-y-2.5">
                <div
                  v-for="row in rawBreakdown.byOrigin"
                  :key="row.origin"
                  class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-2"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex min-w-0 items-center gap-2.5">
                      <span
                        class="h-3 w-3 shrink-0 rounded-full"
                        :class="ORIGIN_COLORS[row.origin] || ORIGIN_COLORS.unknown"
                      />
                      <div class="min-w-0">
                        <p class="truncate text-sm font-bold text-(--app-text)">
                          {{ ORIGIN_LABELS[row.origin] || row.origin }}
                        </p>
                        <p class="truncate font-mono text-[11px] text-(--app-muted)">
                          origin={{ row.origin }}
                        </p>
                      </div>
                    </div>
                    <div class="shrink-0 text-right">
                      <p class="text-sm font-bold tabular-nums text-(--app-text)">
                        {{ row.count.toLocaleString() }}
                      </p>
                      <p class="text-[11px] tabular-nums text-(--app-muted)">
                        {{ formatBytes(row.estimatedBytes) }}
                      </p>
                    </div>
                  </div>

                  <div
                    class="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] tabular-nums text-(--app-muted)"
                  >
                    <span>{{ row.live.toLocaleString() }} live</span>
                    <span>•</span>
                    <span>{{ row.expired.toLocaleString() }} expired</span>
                    <span>•</span>
                    <span v-for="(count, kind) in row.kinds" :key="kind" class="font-mono">
                      kind {{ kind }}: {{ count }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- By Gupt Tag & Kind -->
            <div class="space-y-3">
              <div
                class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--app-text)"
              >
                <Tag class="h-4 w-4 text-(--app-primary)" />
                <h3>Events by Stream Tag</h3>
              </div>

              <div
                v-if="!rawBreakdown.byGuptTag.length"
                class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-8 text-center text-xs text-(--app-muted)"
              >
                No gupt_* tagged events in cache.
              </div>
              <div v-else class="space-y-2.5">
                <div
                  v-for="row in rawBreakdown.byGuptTag"
                  :key="row.tag"
                  class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-2"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex min-w-0 items-center gap-2.5">
                      <span
                        class="h-3 w-3 shrink-0 rounded-full"
                        :class="TAG_COLORS[row.tag] || 'bg-zinc-500'"
                      />
                      <div class="min-w-0">
                        <p class="truncate text-sm font-bold text-(--app-text)">
                          {{ GUPT_TAG_LABELS[row.tag] || row.tag }}
                        </p>
                        <p class="truncate font-mono text-[11px] text-(--app-muted)">
                          {{ row.tag }}
                        </p>
                      </div>
                    </div>
                    <div class="shrink-0 text-right">
                      <p class="text-sm font-bold tabular-nums text-(--app-text)">
                        {{ row.count.toLocaleString() }}
                      </p>
                      <p class="text-[11px] tabular-nums text-(--app-muted)">
                        {{ formatBytes(row.estimatedBytes) }}
                      </p>
                    </div>
                  </div>
                  <div
                    class="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] tabular-nums text-(--app-muted)"
                  >
                    <span>{{ row.live.toLocaleString() }} live</span>
                    <span>•</span>
                    <span>{{ row.expired.toLocaleString() }} expired</span>
                    <span>•</span>
                    <span>{{ row.unreplicated.toLocaleString() }} unreplicated</span>
                  </div>
                </div>
              </div>

              <!-- By Kind Chips -->
              <div v-if="rawBreakdown.byKind.length" class="space-y-2 pt-3">
                <div
                  class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--app-text)"
                >
                  <Hash class="h-4 w-4 text-(--app-muted)" />
                  <h3>By Kind</h3>
                </div>
                <div class="flex flex-wrap gap-2">
                  <div
                    v-for="row in rawBreakdown.byKind"
                    :key="row.kind"
                    class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2 text-xs"
                  >
                    <p class="font-mono font-bold text-(--app-text)">kind {{ row.kind }}</p>
                    <p class="mt-0.5 tabular-nums text-(--app-muted) text-[11px]">
                      {{ row.count.toLocaleString() }} records ·
                      {{ formatBytes(row.estimatedBytes) }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Maintenance & Controls Card -->
        <section
          class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-6 sm:p-8 shadow-xs space-y-6"
        >
          <div>
            <h2 class="text-lg font-bold text-(--app-text)">Cache Maintenance & Controls</h2>
            <p class="text-xs text-(--app-muted) mt-0.5">
              Purge stale records or reset local databases while keeping your account credentials
              safe
            </p>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <!-- Purge Expired -->
            <div
              class="flex flex-col justify-between rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-5 space-y-4"
            >
              <div>
                <div class="flex items-center gap-2 text-sm font-bold text-(--app-text)">
                  <Clock class="h-4 w-4 text-emerald-400" />
                  <span>Purge Expired Records</span>
                </div>
                <p class="text-xs text-(--app-muted) mt-1.5 leading-relaxed">
                  Remove stale events and expired decrypted cache records based on NIP-40 TTL
                  timestamps.
                </p>
              </div>
              <button
                type="button"
                :disabled="actionLoading"
                class="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-500/15 px-4 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 cursor-pointer"
                @click="handlePurgeExpired"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': actionLoading }" />
                <span>Run Expired Purge</span>
              </button>
            </div>

            <!-- Clear Local Cache -->
            <div
              class="flex flex-col justify-between rounded-2xl border border-red-500/20 bg-red-500/5 p-5 space-y-4"
            >
              <div>
                <div class="flex items-center gap-2 text-sm font-bold text-red-400">
                  <Trash2 class="h-4 w-4" />
                  <span>Clear Local Cache Stores</span>
                </div>
                <p class="text-xs text-(--app-muted) mt-1.5 leading-relaxed">
                  Clear local event databases and media cache while preserving your account identity
                  and keys.
                </p>
              </div>
              <button
                type="button"
                :disabled="actionLoading"
                class="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-red-500/15 px-4 text-xs font-bold text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50 cursor-pointer"
                @click="showClearConfirm = true"
              >
                <Trash2 class="h-3.5 w-3.5" />
                <span>Clear Cache Stores</span>
              </button>
            </div>
          </div>
        </section>
      </template>
    </main>

    <!-- Clear Cache Confirm Modal -->
    <AppConfirmDialog
      :open="showClearConfirm"
      title="Clear Local Cache?"
      message="This will delete all local IndexedDB cache tables and event records. Your cryptographic identity, keys, and relay accounts will remain completely safe."
      confirm-label="Clear Local Cache"
      @confirm="handleClearLocalData"
      @cancel="showClearConfirm = false"
    />
  </div>
</template>
