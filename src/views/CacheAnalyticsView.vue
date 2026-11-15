<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  Activity,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Users,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import { RETENTION_MAX_BYTES } from "@/config/retention";
import { cleanupLocalDataKeepingAccount } from "@/lib/appReset";
import { outboxStatus, refreshOutboxStatus } from "@/lib/engine/outboxStatus";
import { getCacheSummary, getRawEventsBreakdown, purgeExpiredCache } from "@/lib/idb";
import { useIdentityStore } from "@/stores/identity";

const summary = ref(null);
const rawBreakdown = ref(null);
const loading = ref(true);
const actionLoading = ref(false);
const message = ref("");
const error = ref("");
const showClearConfirm = ref(false);

const STORE_METADATA = {
  encMedia: {
    displayName: "Encrypted Media",
    description: "Sealed ciphertext blobs in local storage",
    color: "#38bdf8",
    badgeBg: "bg-sky-500/10",
    badgeText: "text-sky-400",
    border: "border-sky-500/20",
    icon: Lock,
  },
  decMedia: {
    displayName: "Decrypted Media",
    description: "Decrypted files & cached media for instant view",
    color: "#818cf8",
    badgeBg: "bg-indigo-500/10",
    badgeText: "text-indigo-400",
    border: "border-indigo-500/20",
    icon: HardDrive,
  },
  stagedUploads: {
    displayName: "Staged Uploads",
    description: "Local media chunks pending relay upload",
    color: "#fbbf24",
    badgeBg: "bg-amber-500/10",
    badgeText: "text-amber-400",
    border: "border-amber-500/20",
    icon: UploadCloud,
  },
  dmMessages: {
    displayName: "Direct Messages",
    description: "Decrypted direct conversations & message records",
    color: "#34d399",
    badgeBg: "bg-emerald-500/10",
    badgeText: "text-emerald-400",
    border: "border-emerald-500/20",
    icon: MessageCircle,
  },
  roomMeta: {
    displayName: "Conversations",
    description: "Room sync state, participant keys & watermarks",
    color: "#a78bfa",
    badgeBg: "bg-purple-500/10",
    badgeText: "text-purple-400",
    border: "border-purple-500/20",
    icon: MessageCircle,
  },
  groups: {
    displayName: "Groups",
    description: "Multi-party group metadata & session rosters",
    color: "#fb7185",
    badgeBg: "bg-rose-500/10",
    badgeText: "text-rose-400",
    border: "border-rose-500/20",
    icon: Users,
  },
  rawEvents: {
    displayName: "Relay Events",
    description: "Synchronized Nostr/Rabta event envelopes",
    color: "#22d3ee",
    badgeBg: "bg-cyan-500/10",
    badgeText: "text-cyan-400",
    border: "border-cyan-500/20",
    icon: Layers,
  },
};

const DEFAULT_META = {
  displayName: "Unknown Store",
  description: "Internal storage table",
  color: "#71717a",
  badgeBg: "bg-zinc-500/10",
  badgeText: "text-zinc-400",
  border: "border-zinc-500/20",
  icon: Database,
};

const ORIGIN_CONFIG = {
  dm: {
    label: "Direct Messages",
    icon: MessageCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  group: {
    label: "Group Messages",
    icon: Users,
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
  },
  bookmarks: {
    label: "Bookmarks",
    icon: Bookmark,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
  },
  passwords: {
    label: "Passwords",
    icon: KeyRound,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  notes: {
    label: "Notes",
    icon: FileText,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  unknown: {
    label: "Other / System",
    icon: Layers,
    color: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/20",
  },
};

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
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
      const meta = STORE_METADATA[storeKey] || DEFAULT_META;
      const storePct = totalBytes > 0 ? Math.round((store.estimatedBytes / totalBytes) * 100) : 0;
      return {
        ...store,
        key: storeKey,
        displayName: meta.displayName,
        description: meta.description,
        color: meta.color,
        badgeBg: meta.badgeBg,
        badgeText: meta.badgeText,
        border: meta.border,
        icon: meta.icon,
        percentage: storePct,
      };
    });
});

const activeStore = computed(() => {
  if (!hoveredStore.value) return null;
  return sortedStores.value.find((s) => s.key === hoveredStore.value) || null;
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
const identityStore = useIdentityStore();

const outboxOldestAgo = computed(() => {
  const ts = outboxStatus.oldestCreatedAt;
  if (!ts) return "";
  const diff = Math.max(0, Math.floor((now.value - ts) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
});

async function loadAnalytics() {
  loading.value = true;
  error.value = "";
  try {
    const [cacheSummary, eventsBreakdown] = await Promise.all([
      getCacheSummary(),
      getRawEventsBreakdown(),
      refreshOutboxStatus(identityStore.pubkeyHex),
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
    message.value = "Expired records and tombstones successfully purged.";
  } catch (e) {
    error.value = e.message || "Failed to purge expired records.";
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
    message.value = "Local cache cleared. Private keys and account settings were preserved.";
  } catch (e) {
    error.value = e.message || "Failed to clear local cache.";
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
  <div class="min-h-screen w-full min-w-0 overflow-y-auto bg-black text-zinc-100 pb-20">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <!-- Header Section -->
      <header
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-800/80 bg-zinc-950/60 text-(--app-primary) shadow-sm"
          >
            <Database class="h-5 w-5" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h1 class="truncate text-xl font-bold tracking-tight text-white sm:text-2xl">
                Cache
              </h1>
              <span
                class="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                IndexedDB
              </span>
            </div>
            <p class="mt-0.5 truncate text-xs text-zinc-400 sm:text-sm">
              Local storage allocation, relay outbox state, and automatic cache retention.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <RouterLink
            to="/stats"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
          >
            <Activity class="h-3.5 w-3.5 text-zinc-400" />
            <span>Relay Stats</span>
          </RouterLink>
          <button
            type="button"
            :disabled="loading"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50 cursor-pointer"
            title="Refresh cache analytics"
            @click="loadAnalytics"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />

      <!-- Skeleton Loading State -->
      <div v-if="loading" class="space-y-6" role="status">
        <span class="sr-only">Loading cache analytics…</span>

        <!-- Top KPI Skeleton -->
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div
            v-for="n in 4"
            :key="n"
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-2.5"
          >
            <div class="flex items-center justify-between">
              <AppSkeleton class="h-2.5 w-20" />
              <AppSkeleton class="h-3.5 w-3.5 rounded-full" />
            </div>
            <AppSkeleton class="h-7 w-28" />
            <AppSkeleton class="h-2 w-full rounded-full" />
          </div>
        </div>

        <!-- Main Cards Skeleton -->
        <div class="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div
            class="lg:col-span-7 border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-5 space-y-4"
          >
            <div class="flex items-center justify-between">
              <AppSkeleton class="h-4 w-32" />
              <AppSkeleton class="h-3 w-20" />
            </div>
            <div class="flex justify-center py-6">
              <AppSkeleton class="h-48 w-48 rounded-full" />
            </div>
            <div class="space-y-2">
              <AppSkeleton v-for="n in 4" :key="n" class="h-10 w-full rounded-xl" />
            </div>
          </div>
          <div class="lg:col-span-5 space-y-5">
            <div
              v-for="n in 2"
              :key="n"
              class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-5 space-y-3"
            >
              <AppSkeleton class="h-4 w-28" />
              <AppSkeleton class="h-3 w-48" />
              <div class="grid grid-cols-3 gap-2 pt-2">
                <AppSkeleton v-for="c in 3" :key="c" class="h-14 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loaded Content -->
      <template v-else-if="summary">
        <!-- KPI Metrics Row -->
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <!-- Metric 1: Total Cache Size -->
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-2"
          >
            <div class="flex items-center justify-between text-zinc-400">
              <span class="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Total Cache
              </span>
              <HardDrive class="h-3.5 w-3.5 text-sky-400" />
            </div>
            <p class="text-xl font-bold tracking-tight text-white tabular-nums sm:text-2xl">
              {{ formatBytes(summary.totalEstimatedBytes) }}
            </p>
            <div class="space-y-1">
              <div class="h-1.5 w-full rounded-full bg-zinc-800/80 overflow-hidden">
                <div
                  class="h-full rounded-full bg-(--app-primary) transition-all duration-500"
                  :style="{ width: `${Math.max(1, Math.min(100, storageUsedPct))}%` }"
                />
              </div>
              <p class="font-mono text-[10px] text-zinc-500 tabular-nums">
                {{ storageUsedPct.toFixed(2) }}% of {{ formatBytes(RETENTION_MAX_BYTES) }} max
              </p>
            </div>
          </div>

          <!-- Metric 2: Total Records -->
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-2"
          >
            <div class="flex items-center justify-between text-zinc-400">
              <span class="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Indexed Records
              </span>
              <Layers class="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <p class="text-xl font-bold tracking-tight text-white tabular-nums sm:text-2xl">
              {{ summary.totalEntries.toLocaleString() }}
            </p>
            <p class="font-mono text-[10px] text-zinc-500">
              Across {{ summary.stores?.length || 6 }} local IndexedDB stores
            </p>
          </div>

          <!-- Metric 3: Outbox Sync -->
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-2"
          >
            <div class="flex items-center justify-between text-zinc-400">
              <span class="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Relay Outbox
              </span>
              <span
                class="h-2 w-2 rounded-full"
                :class="
                  outboxStatus.failed
                    ? 'bg-red-400 animate-ping'
                    : outboxStatus.total
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-400'
                "
              />
            </div>
            <p
              class="text-xl font-bold tracking-tight tabular-nums sm:text-2xl"
              :class="
                outboxStatus.failed
                  ? 'text-red-400'
                  : outboxStatus.total
                    ? 'text-amber-400'
                    : 'text-emerald-400'
              "
            >
              {{
                outboxStatus.failed
                  ? `${outboxStatus.failed} Failed`
                  : outboxStatus.total
                    ? `${outboxStatus.total} Queued`
                    : "All Synced"
              }}
            </p>
            <p class="font-mono text-[10px] text-zinc-500">
              {{
                outboxStatus.total
                  ? `${outboxStatus.pending} pending · ${outboxStatus.stuck} stuck`
                  : "Local writes acknowledged by relays"
              }}
            </p>
          </div>

          <!-- Metric 4: Retention Policy -->
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-2"
          >
            <div class="flex items-center justify-between text-zinc-400">
              <span class="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Retention TTL
              </span>
              <ShieldCheck class="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <p class="text-xl font-bold tracking-tight text-white tabular-nums sm:text-2xl">
              {{ summary.maxAgeDays }} Days
            </p>
            <p class="font-mono text-[10px] text-zinc-500">
              Rolling automated purge window
            </p>
          </div>
        </div>

        <!-- Main Visual Breakdown Grid -->
        <div class="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <!-- Left Column: Storage Donut & Stores List -->
          <div
            class="lg:col-span-7 border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-5 space-y-5"
          >
            <div class="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
              <div>
                <h2 class="text-base font-semibold tracking-tight text-white">Storage Breakdown</h2>
                <p class="text-xs text-zinc-500">
                  Allocation across encrypted media, messages, and internal databases.
                </p>
              </div>
              <span class="font-mono text-[11px] tabular-nums text-zinc-400">
                {{ formatBytes(summary.totalEstimatedBytes) }}
              </span>
            </div>

            <!-- Donut Chart & Center Stats -->
            <div class="flex flex-col items-center justify-center py-2">
              <div class="relative h-56 w-56 sm:h-64 sm:w-64">
                <svg class="h-full w-full -rotate-90 transform" viewBox="0 0 120 120">
                  <!-- Track -->
                  <circle
                    cx="60"
                    cy="60"
                    r="45"
                    fill="transparent"
                    stroke="rgba(255, 255, 255, 0.06)"
                    stroke-width="12"
                  />
                  <!-- Segments -->
                  <circle
                    v-for="store in donutSegments"
                    :key="store.key"
                    cx="60"
                    cy="60"
                    r="45"
                    fill="transparent"
                    :stroke="store.color"
                    :stroke-width="hoveredStore === store.key ? 16 : 12"
                    :stroke-dasharray="store.strokeDasharray"
                    :stroke-dashoffset="store.strokeDashoffset"
                    :class="[
                      'transition-all duration-300 ease-out cursor-pointer',
                      hoveredStore && hoveredStore !== store.key ? 'opacity-25' : 'opacity-100',
                    ]"
                    @mouseenter="hoveredStore = store.key"
                    @mouseleave="hoveredStore = null"
                  />
                </svg>

                <!-- Center Readout -->
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-6 transition-all duration-200"
                >
                  <template v-if="activeStore">
                    <span
                      class="text-xs font-semibold truncate max-w-full"
                      :style="{ color: activeStore.color }"
                    >
                      {{ activeStore.displayName }}
                    </span>
                    <span class="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-white">
                      {{ formatBytes(activeStore.estimatedBytes) }}
                    </span>
                    <span class="font-mono text-[11px] tabular-nums text-zinc-400">
                      {{ activeStore.percentage }}% of cache · {{ activeStore.entries.toLocaleString() }} items
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      Storage Used
                    </span>
                    <span class="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-white">
                      {{ formatBytes(summary.totalEstimatedBytes) }}
                    </span>
                    <span class="font-mono text-[11px] tabular-nums text-zinc-400">
                      {{ storageUsedPct.toFixed(1) }}% of quota
                    </span>
                  </template>
                </div>
              </div>

              <!-- Multi-segment Quota Bar -->
              <div class="mt-3 w-full max-w-md space-y-1.5">
                <div class="h-2 w-full rounded-full bg-zinc-900 border border-zinc-800/80 overflow-hidden flex">
                  <div
                    v-for="store in sortedStores"
                    :key="store.key"
                    class="h-full transition-all duration-300"
                    :style="{
                      width: `${Math.max(1, store.percentage)}%`,
                      backgroundColor: store.color,
                      opacity: hoveredStore && hoveredStore !== store.key ? 0.3 : 1,
                    }"
                    :title="`${store.displayName}: ${formatBytes(store.estimatedBytes)}`"
                  />
                </div>
              </div>
            </div>

            <!-- Stores Detailed List -->
            <div class="space-y-1.5 pt-1">
              <div
                v-for="store in sortedStores"
                :key="store.key"
                class="flex items-center gap-3 rounded-xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface-raised)_60%,transparent)] px-3 py-2.5 transition-all hover:bg-[color-mix(in_srgb,var(--app-surface-hover)_50%,transparent)] cursor-pointer"
                :class="{ 'ring-1 ring-zinc-700 bg-[color-mix(in_srgb,var(--app-surface-hover)_70%,transparent)]': hoveredStore === store.key }"
                @mouseenter="hoveredStore = store.key"
                @mouseleave="hoveredStore = null"
              >
                <!-- Store Icon -->
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                  :class="[store.badgeBg, store.border]"
                >
                  <component :is="store.icon" class="h-4 w-4" :style="{ color: store.color }" />
                </div>

                <!-- Title & Description -->
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="truncate text-sm font-semibold tracking-tight text-zinc-200">
                      {{ store.displayName }}
                    </p>
                    <span
                      class="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums"
                      :class="[store.badgeBg, store.badgeText]"
                    >
                      {{ store.percentage }}%
                    </span>
                  </div>
                  <p class="truncate text-xs text-zinc-500">
                    {{ store.description }}
                  </p>
                </div>

                <!-- Counts & Bytes -->
                <div class="shrink-0 text-right">
                  <p class="font-mono text-xs font-semibold tabular-nums text-white">
                    {{ formatBytes(store.estimatedBytes) }}
                  </p>
                  <p class="font-mono text-[11px] tabular-nums text-zinc-500">
                    {{ store.entries.toLocaleString() }} items
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Outbox, Origins & Maintenance -->
          <div class="lg:col-span-5 space-y-5">
            <!-- Outbox Health Card -->
            <div
              class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-5 space-y-4"
            >
              <div class="flex items-start justify-between gap-3 border-b border-zinc-800/80 pb-3">
                <div>
                  <h2 class="text-base font-semibold tracking-tight text-white">Relay Outbox</h2>
                  <p class="text-xs text-zinc-500">
                    Local writes queued for relay broadcasting.
                  </p>
                </div>
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium"
                  :class="
                    outboxStatus.failed
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : outboxStatus.total
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  "
                >
                  {{
                    outboxStatus.failed
                      ? 'Action needed'
                      : outboxStatus.total
                        ? 'Broadcasting'
                        : 'Clear'
                  }}
                </span>
              </div>

              <!-- 3 Status Tiles -->
              <div class="grid grid-cols-3 gap-2">
                <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 text-center">
                  <p class="text-xl font-bold tabular-nums text-white">
                    {{ outboxStatus.pending }}
                  </p>
                  <p class="mt-0.5 text-[11px] text-zinc-500">Pending</p>
                </div>
                <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 text-center">
                  <p
                    class="text-xl font-bold tabular-nums"
                    :class="outboxStatus.stuck ? 'text-amber-400' : 'text-white'"
                  >
                    {{ outboxStatus.stuck }}
                  </p>
                  <p class="mt-0.5 text-[11px] text-zinc-500">Stuck (>30s)</p>
                </div>
                <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 text-center">
                  <p
                    class="text-xl font-bold tabular-nums"
                    :class="outboxStatus.failed ? 'text-red-400' : 'text-white'"
                  >
                    {{ outboxStatus.failed }}
                  </p>
                  <p class="mt-0.5 text-[11px] text-zinc-500">Failed</p>
                </div>
              </div>

              <!-- Callout or reassurance -->
              <div
                v-if="outboxStatus.failed"
                class="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-300"
              >
                <AlertTriangle class="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <span>
                  {{ outboxStatus.failed }} write{{ outboxStatus.failed === 1 ? '' : 's' }} exceeded {{ outboxStatus.failedAfter }} attempts. They remain saved locally and retry automatically when relay connectivity improves.
                </span>
              </div>
              <div
                v-else-if="outboxStatus.total"
                class="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
              >
                <Clock class="h-3.5 w-3.5 shrink-0" />
                <span>Oldest unconfirmed write is {{ outboxOldestAgo }} old.</span>
              </div>
              <div
                v-else
                class="flex items-center gap-2 text-xs text-emerald-400/90 font-medium"
              >
                <CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-400" />
                <span>All local writes have been confirmed by your relays.</span>
              </div>
            </div>

            <!-- Cached Events by Origin Card -->
            <div
              v-if="rawBreakdown"
              class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-5 space-y-3"
            >
              <div class="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                <div>
                  <h2 class="text-base font-semibold tracking-tight text-white">Events by Origin</h2>
                  <p class="text-xs text-zinc-500">
                    Live Nostr/Rabta collection distribution.
                  </p>
                </div>
                <span class="font-mono text-[11px] tabular-nums text-zinc-400">
                  {{ rawBreakdown.live.toLocaleString() }} live
                  <span v-if="rawBreakdown.expired" class="text-zinc-600">
                    · {{ rawBreakdown.expired.toLocaleString() }} expired
                  </span>
                </span>
              </div>

              <div v-if="!rawBreakdown.byOrigin?.length" class="py-6 text-center">
                <Layers class="h-8 w-8 mx-auto text-zinc-700" />
                <p class="mt-2 text-sm font-semibold text-white">No events cached yet</p>
                <p class="text-xs text-zinc-500">Events will appear here as your client syncs.</p>
              </div>

              <div v-else class="space-y-1.5">
                <div
                  v-for="row in rawBreakdown.byOrigin"
                  :key="row.origin"
                  class="flex items-center gap-3 rounded-xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface-raised)_60%,transparent)] px-3 py-2 transition-all hover:bg-[color-mix(in_srgb,var(--app-surface-hover)_50%,transparent)]"
                >
                  <div
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
                    :class="[
                      (ORIGIN_CONFIG[row.origin] || ORIGIN_CONFIG.unknown).bg,
                      (ORIGIN_CONFIG[row.origin] || ORIGIN_CONFIG.unknown).border,
                    ]"
                  >
                    <component
                      :is="(ORIGIN_CONFIG[row.origin] || ORIGIN_CONFIG.unknown).icon"
                      class="h-3.5 w-3.5"
                      :class="(ORIGIN_CONFIG[row.origin] || ORIGIN_CONFIG.unknown).color"
                    />
                  </div>

                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-semibold text-zinc-200">
                      {{ (ORIGIN_CONFIG[row.origin] || ORIGIN_CONFIG.unknown).label }}
                    </p>
                  </div>

                  <p class="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
                    {{ row.count.toLocaleString() }} · {{ formatBytes(row.estimatedBytes) }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Maintenance & Storage Controls Card -->
            <div
              class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-5 space-y-4"
            >
              <div class="space-y-1 border-b border-zinc-800/80 pb-3">
                <h2 class="text-base font-semibold tracking-tight text-white">Maintenance</h2>
                <p class="text-xs text-zinc-500">
                  Manage local database footprint. Cryptographic keys and account identity are never deleted.
                </p>
              </div>

              <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <!-- Action 1: Purge Expired -->
                <button
                  type="button"
                  :disabled="actionLoading"
                  class="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-semibold text-zinc-200 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50 cursor-pointer"
                  @click="handlePurgeExpired"
                >
                  <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': actionLoading }" />
                  <span>Purge Expired</span>
                </button>

                <!-- Action 2: Clear Local Cache -->
                <button
                  type="button"
                  :disabled="actionLoading"
                  class="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-red-900/50 bg-red-950/30 px-3 text-xs font-semibold text-red-300 shadow-xs transition-all hover:border-red-800 hover:bg-red-900/40 hover:text-red-200 disabled:opacity-50 cursor-pointer"
                  @click="showClearConfirm = true"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  <span>Clear Cache</span>
                </button>
              </div>

              <div class="flex items-center gap-2 pt-1 text-[11px] text-zinc-500">
                <ShieldCheck class="h-3.5 w-3.5 text-emerald-400/80 shrink-0" />
                <span>Zero-knowledge local storage &middot; Keys never leave this device</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- Clear Cache Confirmation Modal -->
    <AppConfirmDialog
      :open="showClearConfirm"
      title="Clear local cache?"
      message="This deletes locally cached events and decrypted media on this device. Your identity keypair, PIN, and account settings are strictly kept."
      confirm-label="Clear cache"
      @confirm="handleClearLocalData"
      @cancel="showClearConfirm = false"
    />
  </div>
</template>
