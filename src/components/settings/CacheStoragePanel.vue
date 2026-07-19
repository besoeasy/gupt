<script setup>
import { computed, onMounted, ref, onUnmounted } from "vue";
import { Trash2, Activity } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { RETENTION_DAYS, RETENTION_MAX_BYTES } from "@/config/retention";
import { cleanupLocalDataKeepingAccount } from "@/lib/appReset";
import { getCacheSummary } from "@/lib/idb";
import { replicationState } from "@/composables/useReplicationWorker";
import { useIdentityStore } from "@/stores/identity";

const emit = defineEmits(["message", "error"]);

const identity = useIdentityStore();
const summary = ref(null);
const cacheLoading = ref(true);
const cacheError = ref("");
const cleaningUp = ref(false);

const STORE_COLORS = {
  encMedia: "#38bdf8",
  decMedia: "#818cf8",
  stagedUploads: "#fbbf24",
  dmMessages: "#34d399",
  roomMeta: "#a78bfa",
  groups: "#fb7185",
  groupMessages: "#22d3ee",
};

function storeColor(table) {
  return STORE_COLORS[table] || "#71717a";
}

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

const sortedStores = computed(() =>
  [...(summary.value?.stores || [])].sort((a, b) => b.estimatedBytes - a.estimatedBytes),
);

// --- Replication summary -----------------------------------------------
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

async function refreshCache() {
  cacheLoading.value = true;
  cacheError.value = "";
  try {
    summary.value = await getCacheSummary();
  } catch (e) {
    cacheError.value = e.message || "Unable to load cache summary.";
  } finally {
    cacheLoading.value = false;
  }
}

async function runCleanup() {
  if (cleaningUp.value) return;
  if (
    !window.confirm(
      "Purge all local data except your account? Messages and cache will be re-fetched from relays.",
    )
  ) {
    return;
  }

  cleaningUp.value = true;
  emit("message", "");
  emit("error", "");
  cacheError.value = "";

  try {
    await identity.init();
    await cleanupLocalDataKeepingAccount(identity);
    emit("message", "Local data purged. Syncing messages from relays…");
    await refreshCache();
  } catch (cleanupError) {
    emit("error", cleanupError?.message || "Unable to purge local data.");
  } finally {
    cleaningUp.value = false;
  }
}

onMounted(() => {
  void refreshCache();
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer);
});
</script>

<template>
  <div class="space-y-4">
    <AppAlertBanner v-if="cacheError" :message="cacheError" />

    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
    >
      <div class="flex items-center justify-between">
        <p class="text-sm font-semibold">Cache Analytics</p>
        <p class="text-[11px] text-zinc-500">
          {{ RETENTION_DAYS }}-day · {{ formatBytes(RETENTION_MAX_BYTES) }} max
        </p>
      </div>
      <div v-if="cacheLoading" class="py-4 text-center text-zinc-500 text-xs">Loading…</div>
      <template v-else-if="summary">
        <div class="grid grid-cols-2 gap-3">
          <div class="border border-(--app-border) bg-(--app-surface-soft) rounded-xl p-3">
            <p class="text-lg font-bold">{{ summary.totalEntries.toLocaleString() }}</p>
            <p class="mt-0.5 text-[11px] text-zinc-500">Cached entries</p>
          </div>
          <div class="border border-(--app-border) bg-(--app-surface-soft) rounded-xl p-3">
            <p class="text-lg font-bold">{{ formatBytes(summary.totalEstimatedBytes) }}</p>
            <p class="mt-0.5 text-[11px] text-zinc-500">Estimated size</p>
          </div>
        </div>
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Storage</span>
            <span
              >{{ formatBytes(summary.totalEstimatedBytes) }} /
              {{ formatBytes(RETENTION_MAX_BYTES) }}</span
            >
          </div>
          <div class="h-1.5 w-full rounded-full bg-(--app-surface-soft) overflow-hidden">
            <div
              class="h-full rounded-full bg-emerald-500 transition-all duration-500"
              :style="{ width: storageUsedPct + '%' }"
            />
          </div>
        </div>
        <div class="space-y-0.5">
          <div
            v-for="store in sortedStores"
            :key="store.table"
            class="flex items-center gap-3 rounded-xl px-2 py-1.5"
          >
            <span
              class="inline-block h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: storeColor(store.table) }"
            />
            <p class="flex-1 text-xs truncate text-(--app-text-soft)">{{ store.label }}</p>
            <p class="shrink-0 text-[11px] text-zinc-500 tabular-nums">
              {{ store.entries.toLocaleString() }} · {{ formatBytes(store.estimatedBytes) }}
            </p>
          </div>
        </div>
      </template>
    </div>

    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Activity class="h-4 w-4 text-(--app-muted-2)" />
          <p class="text-sm font-semibold">Data backup</p>
        </div>
        <span
          class="inline-flex items-center gap-1.5 text-[11px] font-medium"
          :class="
            replicationStatusLabel === 'Active'
              ? 'text-emerald-400'
              : replicationStatusLabel === 'Paused'
                ? 'text-amber-400'
                : 'text-zinc-500'
          "
        >
          <span
            class="inline-block h-1.5 w-1.5 rounded-full"
            :class="
              replicationStatusLabel === 'Active'
                ? 'bg-emerald-400'
                : replicationStatusLabel === 'Paused'
                  ? 'bg-amber-400'
                  : 'bg-zinc-600'
            "
          />
          {{ replicationStatusLabel }}
        </span>
      </div>

      <p class="text-[13px] leading-relaxed text-zinc-400">
        Your data is continuously re-published to random relays so it survives device loss and relay
        churn.
      </p>

      <div class="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Last attempt {{ replicationLastAgo }}</span>
        <span class="tabular-nums"
          >{{ replication.published }} published · {{ replication.errors }} errors</span
        >
      </div>

      <div class="flex items-center gap-1.5">
        <span
          v-for="(dot, i) in replicationDots"
          :key="i"
          class="inline-block h-2 w-2 rounded-full"
          :class="
            dot === 'ok'
              ? 'bg-emerald-400'
              : dot === 'err'
                ? 'bg-amber-400'
                : 'bg-white/5 ring-1 ring-inset ring-(--app-border)'
          "
        />
      </div>
    </div>

    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl border border-amber-500/20 p-4 space-y-3"
    >
      <p class="text-sm font-semibold">Cleanup</p>
      <p class="text-[13px] leading-relaxed text-zinc-400">
        Having problems seeing messages? Click to purge local data. Your account and keys are kept —
        everything else is cleared and re-synced from relays.
      </p>
      <button
        id="settings-cleanup-btn"
        type="button"
        :disabled="cleaningUp"
        class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-(--app-warning) transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        @click="runCleanup"
      >
        <Trash2
          :class="cleaningUp ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'"
          :stroke-width="1.9"
          aria-hidden="true"
        />
        {{ cleaningUp ? "Purging…" : "Cleanup" }}
      </button>
    </div>
  </div>
</template>
