<script setup>
import { computed, onMounted, ref } from "vue";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { RETENTION_DAYS, RETENTION_MAX_BYTES } from "@/config/retention";
import { getCacheSummary } from "@/lib/idb";

const summary = ref(null);
const loading = ref(true);
const error = ref("");

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

function timeago(ms) {
  const s = Math.floor(Math.abs(ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

function relativeDate(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const label = timeago(diff);
  if (label === "just now") return "just now";
  return diff > 0 ? `${label} ago` : `in ${label}`;
}

const storageUsedPct = computed(() =>
  pct(summary.value?.totalEstimatedBytes || 0, RETENTION_MAX_BYTES),
);

const sortedStores = computed(() =>
  [...(summary.value?.stores || [])].sort((a, b) => b.estimatedBytes - a.estimatedBytes),
);

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    summary.value = await getCacheSummary();
  } catch (e) {
    error.value = e.message || "Unable to load cache summary.";
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <div class="min-h-screen bg-black text-white">
    <main class="app-page-shell mx-auto px-4 py-6 lg:px-8">
      <div class="max-w-2xl mx-auto space-y-5">
        <!-- Header -->
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Cache Analytics</h1>
          <p class="mt-1 text-sm text-zinc-500">
            {{ RETENTION_DAYS }}-day retention · {{ formatBytes(RETENTION_MAX_BYTES) }} max
          </p>
        </div>

        <AppAlertBanner v-if="error" :message="error" />

        <div v-if="loading" class="py-16 text-center text-zinc-500 text-sm">Loading…</div>

        <template v-else-if="summary">
          <!-- Summary cards -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="rounded-2xl bg-white/[0.04] p-4">
              <p class="text-2xl font-bold">{{ summary.totalEntries.toLocaleString() }}</p>
              <p class="mt-1 text-xs text-zinc-500">Cached entries</p>
            </div>
            <div class="rounded-2xl bg-white/[0.04] p-4">
              <p class="text-2xl font-bold">{{ formatBytes(summary.totalEstimatedBytes) }}</p>
              <p class="mt-1 text-xs text-zinc-500">Estimated size</p>
            </div>
          </div>

          <!-- Storage bar -->
          <div class="rounded-2xl bg-white/[0.04] p-4 space-y-3">
            <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <p class="text-sm font-semibold">Storage usage</p>
              <p class="text-xs text-zinc-500">
                {{ formatBytes(summary.totalEstimatedBytes) }} /
                {{ formatBytes(RETENTION_MAX_BYTES) }}
              </p>
            </div>
            <div class="h-2 w-full rounded-full bg-white/8 overflow-hidden">
              <div
                class="h-full rounded-full bg-emerald-500 transition-all duration-500"
                :style="{ width: storageUsedPct + '%' }"
              />
            </div>
            <p class="text-[11px] text-zinc-500">{{ storageUsedPct.toFixed(1) }}% used</p>
          </div>

          <!-- Per-store -->
          <div class="rounded-2xl bg-white/[0.04] p-4 space-y-2">
            <div class="flex items-center justify-between pb-2">
              <p class="text-sm font-semibold">Stores</p>
              <p class="text-[11px] text-zinc-500">{{ summary.dbName }}</p>
            </div>
            <div
              v-for="store in sortedStores"
              :key="store.table"
              class="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
            >
              <span
                class="inline-block h-2 w-2 shrink-0 rounded-full"
                :style="{ backgroundColor: storeColor(store.table) }"
              />
              <p class="flex-1 text-sm truncate">{{ store.label }}</p>
              <p class="shrink-0 text-xs text-zinc-500 tabular-nums">
                {{ store.entries.toLocaleString() }} · {{ formatBytes(store.estimatedBytes) }}
              </p>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>
