<script setup>
import { onMounted, ref } from "vue";
import { Clock3, Database, HardDrive, RefreshCw, Trash2 } from "lucide-vue-next";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { getCacheSummary, purgeExpiredCache } from "@/lib/idb";

const summary = ref(null);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const message = ref("");

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

function timeago(diff) {
  const s = Math.floor(Math.abs(diff) / 1000);
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

function formatDate(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const label = timeago(diff);
  if (label === "just now") return "just now";
  return diff > 0 ? `${label} ago` : `in ${label}`;
}

function formatFullDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function refreshSummary() {
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

async function purgeNow() {
  busy.value = true;
  message.value = "";
  error.value = "";
  try {
    await purgeExpiredCache();
    await refreshSummary();
    message.value = "Expired cache entries removed.";
  } catch (e) {
    error.value = e.message || "Unable to purge cache.";
  } finally {
    busy.value = false;
  }
}

onMounted(refreshSummary);
</script>

<template>
  <div class="min-h-screen bg-black text-white">
    <main class="app-page-shell mx-auto px-4 py-6 lg:px-8">
      <div class="max-w-2xl mx-auto space-y-5">
      <h1 class="text-2xl font-bold tracking-tight">Cache</h1>

      <div v-if="loading" class="py-10 text-center text-zinc-500 text-sm">Loading…</div>

      <template v-else-if="summary">
        <!-- Stats -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="rounded-2xl bg-white/[0.04] p-4">
            <p class="text-2xl font-bold">{{ summary.totalEntries }}</p>
            <p class="text-xs text-zinc-500 mt-1 inline-flex items-center gap-1.5">
              <Database class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />Entries
            </p>
          </div>
          <div class="rounded-2xl bg-white/[0.04] p-4">
            <p class="text-2xl font-bold">{{ formatBytes(summary.totalEstimatedBytes) }}</p>
            <p class="text-xs text-zinc-500 mt-1 inline-flex items-center gap-1.5">
              <HardDrive class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />Size
            </p>
          </div>
          <div class="rounded-2xl bg-white/[0.04] p-4">
            <p class="text-sm font-semibold">{{ formatDate(summary.newestCreatedAt) }}</p>
            <p class="text-[11px] text-zinc-500 mt-0.5">
              {{ formatFullDate(summary.newestCreatedAt) }}
            </p>
            <p class="text-xs text-zinc-500 mt-1 inline-flex items-center gap-1.5">
              <Clock3 class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />Newest
            </p>
          </div>
          <div class="rounded-2xl bg-white/[0.04] p-4">
            <p class="text-sm font-semibold">{{ formatDate(summary.newestExpiresAt) }}</p>
            <p class="text-[11px] text-zinc-500 mt-0.5">
              {{ formatFullDate(summary.newestExpiresAt) }}
            </p>
            <p class="text-xs text-zinc-500 mt-1 inline-flex items-center gap-1.5">
              <RefreshCw class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />Expiry
            </p>
          </div>
        </div>

        <!-- Purge -->
        <div class="rounded-2xl bg-white/[0.04] p-4 space-y-3">
          <p class="text-xs text-zinc-500">
            Entries auto-purge after {{ summary?.maxAgeDays || 30 }} days.
          </p>
          <PrimaryButton @click="purgeNow" :disabled="busy || loading">
            <Trash2 class="w-4 h-4" :stroke-width="1.9" aria-hidden="true" />
            {{ busy ? "Purging…" : "Purge Expired Entries" }}
          </PrimaryButton>
        </div>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <!-- Stores -->
        <div class="rounded-2xl bg-white/[0.04] p-4 space-y-2">
          <div class="flex items-center justify-between pb-2">
            <p class="text-sm font-semibold">Stores</p>
            <p class="text-[11px] text-zinc-500">{{ summary.dbName }}</p>
          </div>
          <div
            v-for="store in summary.stores"
            :key="store.table"
            class="flex items-start justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.04]"
          >
            <div>
              <p class="text-sm font-semibold">{{ store.label }}</p>
              <p class="text-xs text-zinc-500 mt-0.5">
                {{ store.entries }} entries · {{ formatBytes(store.estimatedBytes) }}
              </p>
            </div>
            <div class="text-right text-[11px] text-zinc-500 shrink-0">
              <p>{{ formatDate(store.newestCreatedAt) }}</p>
              <p class="mt-0.5">exp {{ formatDate(store.newestExpiresAt) }}</p>
            </div>
          </div>
        </div>
      </template>
      </div>
    </main>
  </div>
</template>
