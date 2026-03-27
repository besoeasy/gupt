<script setup>
import { computed, onMounted, ref } from "vue";
import { ArrowLeft } from "lucide-vue-next";
import { useRouter } from "vue-router";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { RETENTION_DAYS, RETENTION_MAX_BYTES } from "@/config/retention";
import { getCacheSummary } from "@/lib/idb";

const router = useRouter();

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
  <div class="min-h-screen bg-black text-white flex flex-col">
    <main class="app-page-shell mx-auto px-4 py-8 space-y-6">
      <!-- Header -->
      <section class="rounded-4xl border border-white/8 bg-zinc-950/80 px-5 py-6 space-y-3">
        <div class="flex items-center gap-2 mb-3">
          <button
            @click="router.push('/settings')"
            class="h-8 w-8 flex items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            title="Back to Settings"
          >
            <ArrowLeft class="w-4 h-4" :stroke-width="1.9" aria-hidden="true" />
          </button>
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Stats</p>
        </div>
        <p class="text-sm text-zinc-500">{{ RETENTION_DAYS }}-day retention · 20 GB max</p>
      </section>

      <AppAlertBanner v-if="error" :message="error" />

      <div v-if="loading" class="py-16 text-center text-zinc-500 text-sm animate-pulse">
        Loading…
      </div>

      <template v-else-if="summary">
        <!-- Summary stat cards -->
        <section class="rounded-3xl border border-white/8 bg-zinc-950/80 overflow-hidden">
          <div class="grid grid-cols-2 divide-x divide-white/7">
            <div class="px-5 py-5">
              <p class="text-3xl font-bold">{{ summary.totalEntries.toLocaleString() }}</p>
              <p class="mt-1 text-xs text-zinc-500">Cached entries</p>
            </div>
            <div class="px-5 py-5">
              <p class="text-3xl font-bold">{{ formatBytes(summary.totalEstimatedBytes) }}</p>
              <p class="mt-1 text-xs text-zinc-500">Estimated size</p>
            </div>
          </div>
        </section>

        <!-- Storage usage bar -->
        <section class="rounded-3xl border border-white/8 bg-zinc-950/80 px-5 py-5 space-y-4">
          <div class="flex items-baseline justify-between gap-4">
            <p class="text-sm font-semibold">Storage usage</p>
            <p class="text-xs text-zinc-400 shrink-0">
              {{ formatBytes(summary.totalEstimatedBytes) }} / 20 GB
            </p>
          </div>

          <!-- Stacked bar: each store as a colored segment -->
          <div
            class="h-4 w-full rounded-full bg-white/6 overflow-hidden flex"
            title="Storage by store"
          >
            <div
              v-for="store in sortedStores"
              :key="store.table"
              :style="{
                width: pct(store.estimatedBytes, summary.totalEstimatedBytes) + '%',
                backgroundColor: storeColor(store.table),
              }"
              class="h-full transition-all duration-500"
              :title="`${store.label}: ${formatBytes(store.estimatedBytes)}`"
            />
          </div>
        </section>

        <!-- Per-store breakdown -->
        <section class="rounded-3xl border border-white/8 bg-zinc-950/80 overflow-hidden">
          <div class="px-5 py-4 border-b border-white/7 flex items-center justify-between">
            <p class="text-sm font-semibold">Stores</p>
            <p class="text-[11px] text-zinc-600">{{ summary.dbName }}</p>
          </div>

          <div class="divide-y divide-white/4">
            <div
              v-for="store in sortedStores"
              :key="store.table"
              class="flex items-center gap-3 px-5 py-2.5"
            >
              <span
                class="inline-block w-2 h-2 rounded-full shrink-0"
                :style="{ backgroundColor: storeColor(store.table) }"
              />
              <p class="flex-1 text-xs text-zinc-300 truncate">{{ store.label }}</p>
              <p class="shrink-0 text-xs text-zinc-500 tabular-nums">
                {{ store.entries.toLocaleString() }}
                <span class="text-zinc-700">·</span>
                {{ formatBytes(store.estimatedBytes) }}
              </p>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
