<script setup>
import { computed, onMounted, ref } from "vue";
import { ArrowLeft } from "lucide-vue-next";
import { useRouter } from "vue-router";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { RETENTION_DAYS, RETENTION_MAX_BYTES } from "@/config/retention";
import { getCacheSummary } from "@/lib/idb";

// Shadcn UI
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

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
  return STORE_COLORS[table] || "hsl(var(--muted-foreground))";
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
  <div class="flex-1 flex flex-col">
    <main class="w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div class="space-y-2">
        <h1 class="text-2xl font-bold tracking-tight">Cache Stats</h1>
        <p class="text-sm text-muted-foreground">
          View local storage usage and retention policies.
        </p>
      </div>

      <div class="space-y-4" v-if="error || loading">
        <AppAlertBanner v-if="error" :message="error" />
        <div v-if="loading" class="py-16 text-center text-muted-foreground text-sm animate-pulse">
          Loading…
        </div>
      </div>

      <template v-else-if="summary">
        <div class="grid gap-6 md:grid-cols-3">
          <Card class="md:col-span-2">
            <CardHeader>
              <CardTitle>Storage Usage</CardTitle>
              <CardDescription
                >{{ formatBytes(summary.totalEstimatedBytes) }} / 20 GB used</CardDescription
              >
            </CardHeader>
            <CardContent class="space-y-4">
              <!-- Stacked bar -->
              <div
                class="h-4 w-full rounded-full bg-muted overflow-hidden flex ring-1 ring-inset ring-border"
                title="Storage by store"
              >
                <div
                  v-for="store in sortedStores"
                  :key="store.table"
                  :style="{
                    width: pct(store.estimatedBytes, summary.totalEstimatedBytes) + '%',
                    backgroundColor: storeColor(store.table),
                  }"
                  class="h-full transition-all duration-500 hover:brightness-110"
                  :title="`${store.label}: ${formatBytes(store.estimatedBytes)}`"
                />
              </div>
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <div class="h-px flex-1 bg-border" />
                <span>{{ storageUsedPct.toFixed(storageUsedPct < 1 ? 3 : 1) }}% of 20 GB cap</span>
              </div>
            </CardContent>
          </Card>

          <Card class="flex flex-col justify-center">
            <CardContent class="p-6 grid grid-cols-2 gap-4 text-center divide-x">
              <div>
                <p class="text-3xl font-bold tracking-tighter">
                  {{ summary.totalEntries.toLocaleString() }}
                </p>
                <p class="text-xs text-muted-foreground mt-1">Cached entries</p>
              </div>
              <div>
                <p class="text-3xl font-bold tracking-tighter">
                  {{ formatBytes(summary.totalEstimatedBytes) }}
                </p>
                <p class="text-xs text-muted-foreground mt-1">Estimated size</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Retention Policy</CardTitle>
            <CardDescription
              >Cached data expires when either limit is reached, whichever comes
              first.</CardDescription
            >
          </CardHeader>
          <CardContent>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-xl border bg-muted/50 p-4">
                <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Time limit
                </p>
                <p class="mt-2 text-xl font-bold">{{ RETENTION_DAYS }}-day retention</p>
              </div>
              <div class="rounded-xl border bg-muted/50 p-4">
                <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Storage cap
                </p>
                <p class="mt-2 text-xl font-bold">20 GB max</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stores Breakdown</CardTitle>
            <CardDescription>{{ summary.dbName }}</CardDescription>
          </CardHeader>
          <CardContent class="p-0">
            <div class="divide-y border-t">
              <div
                v-for="store in sortedStores"
                :key="store.table"
                class="p-4 sm:px-6 space-y-3 hover:bg-muted/50 transition-colors"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <span
                      class="inline-block w-3 h-3 rounded-full shrink-0 ring-1 ring-border shadow-sm"
                      :style="{ backgroundColor: storeColor(store.table) }"
                    />
                    <p class="text-sm font-medium truncate">{{ store.label }}</p>
                  </div>
                  <div class="shrink-0 text-right text-sm">
                    <span class="text-muted-foreground mr-2"
                      >{{ store.entries.toLocaleString() }} entries</span
                    >
                    <span class="font-medium">{{ formatBytes(store.estimatedBytes) }}</span>
                  </div>
                </div>

                <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    :style="{
                      width: pct(store.estimatedBytes, summary.totalEstimatedBytes) + '%',
                      backgroundColor: storeColor(store.table),
                    }"
                    class="h-full rounded-full transition-all duration-500 opacity-90"
                  />
                </div>

                <div class="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                  <span>newest {{ relativeDate(store.newestCreatedAt) }}</span>
                  <span>·</span>
                  <span>expires {{ relativeDate(store.newestExpiresAt) }}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </template>
    </main>
  </div>
</template>
