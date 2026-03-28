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
  <div class="min-h-screen bg-zinc-950 text-white">
    <main class="app-page-shell mx-auto max-w-6xl px-4 py-8 space-y-6 sm:px-6 lg:px-8">
      <!-- Header -->
      <section class="rounded-3xl bg-zinc-900/70 p-6 backdrop-blur-sm">
        <div class="flex items-center gap-2 mb-3">
          <button
            @click="router.push('/settings')"
            class="h-8 w-8 flex items-center justify-center rounded-full bg-white/5 text-zinc-300 transition-all duration-200 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            title="Back to Settings"
          >
            <ArrowLeft class="w-4 h-4" :stroke-width="1.9" aria-hidden="true" />
          </button>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Stats</p>
        </div>
        <h1 class="text-3xl font-bold tracking-tight text-white md:text-4xl">Cache Analytics</h1>
        <p class="mt-2 text-sm text-zinc-300">
          {{ RETENTION_DAYS }}-day retention · {{ formatBytes(RETENTION_MAX_BYTES) }} max
        </p>
      </section>

      <AppAlertBanner v-if="error" :message="error" />

      <div v-if="loading" class="py-16 text-center text-zinc-400 text-sm animate-pulse">
        Loading…
      </div>

      <template v-else-if="summary">
        <!-- Summary stat cards -->
        <section class="rounded-3xl bg-zinc-900/70 p-4 sm:p-5">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="rounded-2xl bg-zinc-950/60 p-4">
              <p class="text-3xl font-bold text-white">
                {{ summary.totalEntries.toLocaleString() }}
              </p>
              <p class="mt-1 text-xs text-zinc-400">Cached entries</p>
            </div>
            <div class="rounded-2xl bg-zinc-950/60 p-4">
              <p class="text-3xl font-bold text-white">
                {{ formatBytes(summary.totalEstimatedBytes) }}
              </p>
              <p class="mt-1 text-xs text-zinc-400">Estimated size</p>
            </div>
          </div>
        </section>

        <!-- Storage usage bar -->
        <section class="rounded-3xl bg-zinc-900/70 p-5">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="text-sm font-semibold text-white">Storage usage</p>
              <p class="text-xs text-zinc-400">Usage is estimated and may vary slightly.</p>
            </div>
            <p class="text-xs text-zinc-300">
              {{ formatBytes(summary.totalEstimatedBytes) }} /
              {{ formatBytes(RETENTION_MAX_BYTES) }}
            </p>
          </div>

          <div class="h-4 w-full rounded-full bg-white/10 overflow-hidden mt-3">
            <div
              class="h-full transition-all duration-500"
              :style="{
                width: storageUsedPct + '%',
                background:
                  'linear-gradient(90deg, #22c55e 0%, #0ea5e9 ' +
                  storageUsedPct +
                  '%, rgba(255,255,255,0.08) ' +
                  storageUsedPct +
                  '%)',
              }"
              :title="`Total used ${storageUsedPct.toFixed(1)}%`"
            />
          </div>

          <div class="mt-2 flex flex-wrap gap-2">
            <span class="rounded-full bg-white/10 px-2 py-1 text-[11px] text-zinc-300"
              >{{ storageUsedPct.toFixed(1) }}% used</span
            >
            <span class="rounded-full bg-white/10 px-2 py-1 text-[11px] text-zinc-300"
              >{{ summary.totalEntries.toLocaleString() }} entries</span
            >
          </div>
        </section>

        <!-- Per-store breakdown -->
        <section class="rounded-3xl bg-zinc-900/70 p-4 overflow-hidden">
          <div class="flex items-center justify-between border-b border-white/10 pb-3 mb-2">
            <p class="text-sm font-semibold text-white">Stores</p>
            <p class="text-[11px] text-zinc-400">{{ summary.dbName }}</p>
          </div>

          <div class="space-y-2">
            <div
              v-for="store in sortedStores"
              :key="store.table"
              class="flex items-center gap-3 rounded-2xl bg-zinc-950/50 p-3 transition-all duration-200 hover:bg-zinc-950/70"
            >
              <span
                class="inline-block h-2 w-2 rounded-full shrink-0"
                :style="{ backgroundColor: storeColor(store.table) }"
              />
              <p class="flex-1 text-sm text-white truncate">{{ store.label }}</p>
              <p class="shrink-0 text-xs text-zinc-300 tabular-nums">
                {{ store.entries.toLocaleString() }} · {{ formatBytes(store.estimatedBytes) }}
              </p>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
