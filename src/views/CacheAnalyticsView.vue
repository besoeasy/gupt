<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import { RETENTION_MAX_BYTES } from "@/config/retention";
import { cleanupLocalDataKeepingAccount } from "@/lib/appReset";
import { getCacheSummary, getRawEventsBreakdown, purgeExpiredCache } from "@/lib/idb";
import { replicationState, triggerReplicationTick } from "@/composables/useReplicationWorker";
import { RefreshCw, Trash2 } from "@lucide/vue";

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
    await triggerReplicationTick();
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
  <div class="min-h-screen">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">Cache</h1>
            <p class="mt-1 text-sm text-(--app-muted)">Local storage on this device.</p>
          </div>
          <button
            type="button"
            :disabled="loading"
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-50"
            title="Refresh"
            @click="loadAnalytics"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
          </button>
        </div>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <div v-if="loading" class="py-16 text-center text-sm text-(--app-muted)">Loading…</div>

        <template v-else-if="summary">
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-5"
          >
            <div class="flex items-end justify-between gap-3">
              <p class="text-sm font-semibold text-(--app-text)">Storage</p>
              <p class="text-xs text-(--app-muted) tabular-nums">
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
                    <span class="mt-0.5 text-xl font-bold tabular-nums text-(--app-text)">
                      {{ formatBytes(activeStore.estimatedBytes) }}
                    </span>
                    <span class="text-[11px] text-(--app-muted) tabular-nums">
                      {{ activeStore.percentage }}%
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-[11px] font-semibold text-(--app-muted)">Used</span>
                    <span class="mt-0.5 text-xl font-bold tabular-nums text-(--app-text)">
                      {{ formatBytes(summary.totalEstimatedBytes) }}
                    </span>
                    <span class="text-[11px] text-(--app-muted) tabular-nums">
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
                class="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/4 cursor-pointer"
                @mouseenter="hoveredStore = store.key"
                @mouseleave="hoveredStore = null"
              >
                <span class="h-2 w-2 shrink-0 rounded-full" :class="store.color" />
                <p class="flex-1 min-w-0 text-sm truncate text-(--app-text)">
                  {{ store.displayName }}
                </p>
                <p class="shrink-0 text-xs text-(--app-muted) tabular-nums">
                  {{ store.entries.toLocaleString() }} · {{ formatBytes(store.estimatedBytes) }}
                </p>
              </div>
            </div>

            <p class="text-[11px] text-(--app-muted)">
              Kept for {{ summary.maxAgeDays }} days, then removed automatically.
            </p>
          </div>

          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-(--app-text)">Relay sync</p>
                <p class="mt-0.5 text-xs text-(--app-muted)">
                  {{ replicationStatusLabel }} · last {{ replicationLastAgo }}
                </p>
              </div>
              <button
                type="button"
                :disabled="actionLoading || replication.active"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-text-soft) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-50"
                @click="handleManualSync"
              >
                <RefreshCw
                  class="h-3.5 w-3.5"
                  :class="{ 'animate-spin': actionLoading || replication.active }"
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
                  'bg-(--app-surface-soft)': dot === 'empty',
                }"
              />
            </div>
          </div>

          <div
            v-if="rawBreakdown"
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-2"
          >
            <div class="flex items-end justify-between gap-3 pb-1">
              <p class="text-sm font-semibold text-(--app-text)">Cached items</p>
              <p class="text-[11px] text-(--app-muted) tabular-nums">
                {{ rawBreakdown.live.toLocaleString() }} live
                <span v-if="rawBreakdown.expired">
                  · {{ rawBreakdown.expired.toLocaleString() }} expired
                </span>
              </p>
            </div>

            <div
              v-if="!rawBreakdown.byOrigin.length"
              class="py-8 text-center text-sm text-(--app-muted)"
            >
              Nothing cached yet.
            </div>
            <div
              v-for="row in rawBreakdown.byOrigin"
              :key="row.origin"
              class="flex items-center gap-3 rounded-xl px-2 py-2"
            >
              <p class="flex-1 min-w-0 text-sm truncate text-(--app-text)">
                {{ ORIGIN_LABELS[row.origin] || row.origin }}
              </p>
              <p class="shrink-0 text-xs text-(--app-muted) tabular-nums">
                {{ row.count.toLocaleString() }} · {{ formatBytes(row.estimatedBytes) }}
              </p>
            </div>
          </div>

          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
          >
            <p class="text-sm font-semibold text-(--app-text)">Maintenance</p>
            <p class="text-xs text-(--app-muted)">
              Purge stale records, or wipe local data. Your keys stay on this device.
            </p>
            <div class="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                :disabled="actionLoading"
                class="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-4 text-xs font-semibold text-(--app-text) transition-colors hover:bg-(--app-surface-hover) disabled:opacity-50"
                @click="handlePurgeExpired"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': actionLoading }" />
                Purge expired
              </button>
              <button
                type="button"
                :disabled="actionLoading"
                class="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/15 px-4 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-50"
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
