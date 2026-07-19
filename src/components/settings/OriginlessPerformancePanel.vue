<script setup>
import { ref, computed, onMounted } from "vue";
import { Search, Loader2, WifiOff, Server } from "@lucide/vue";
import {
  buildOriginlessUploadUrl,
  DEFAULT_ORIGINLESS_SERVERS,
  normalizeOriginlessServerUrl,
  readUserOriginlessServers,
} from "@/config/servers";
import { testUploadServers } from "@/lib/upload";

const results = ref([]);
const loading = ref(false);

function splitCsv(value) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

const envOriginlessServers = splitCsv(import.meta.env.VITE_UPLOAD_URL)
  .map(normalizeOriginlessServerUrl)
  .filter(Boolean);

const allServers = computed(() => {
  const userServers = readUserOriginlessServers();
  return dedupe([...userServers, ...envOriginlessServers, ...DEFAULT_ORIGINLESS_SERVERS]);
});

const serverEntries = computed(() =>
  allServers.value.map((server) => ({
    id: `originless:${server}`,
    server,
    uploadUrl: buildOriginlessUploadUrl(server),
    type: "originless",
  })),
);

const okCount = computed(() => results.value.filter((r) => r.ok).length);

const sortedResults = computed(() => {
  return [...results.value].sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? 1 : -1;
    return a.server.localeCompare(b.server);
  });
});

async function runTests() {
  if (loading.value || !serverEntries.value.length) return;
  loading.value = true;
  results.value = [];
  try {
    results.value = await testUploadServers(serverEntries.value);
  } finally {
    loading.value = false;
  }
}

onMounted(runTests);
</script>

<template>
  <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-(--app-border)">
      <div class="flex items-center gap-1.5">
        <Server class="h-3.5 w-3.5 text-(--app-primary) shrink-0" :stroke-width="2" />
        <p class="text-xs font-semibold text-(--app-text)">Originless Performance</p>
        <span
          v-if="results.length"
          class="ml-0.5 rounded-full bg-(--app-primary)/15 px-1.5 py-px text-[9px] font-bold text-(--app-primary)"
          >{{ okCount }}/{{ results.length }}</span
        >
      </div>
      <button
        @click="runTests"
        :disabled="loading"
        class="inline-flex h-6 w-6 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors disabled:opacity-50"
        title="Test servers"
      >
        <Search
          :class="loading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'"
          :stroke-width="2"
        />
      </button>
    </div>

    <div v-if="!loading && sortedResults.length" class="w-full text-[11px]">
      <div
        class="flex items-center gap-2 px-4 py-1.5 text-(--app-muted) font-medium border-b border-(--app-border)"
      >
        <span class="min-w-0 flex-1">Server</span>
        <span class="w-16 text-center">Status</span>
      </div>
      <div
        v-for="entry in sortedResults"
        :key="entry.id"
        class="flex items-center gap-2 px-4 py-2 border-b border-(--app-border) last:border-b-0 hover:bg-(--app-surface-hover) transition-colors"
      >
        <span class="min-w-0 flex-1 font-mono truncate text-(--app-text-soft)" :title="entry.server">
          {{ entry.server.replace(/^https?:\/\//i, "") }}
        </span>
        <span
          class="w-16 text-center shrink-0 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap leading-tight tabular-nums"
          :class="
            entry.ok
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-red-500/15 text-red-400'
          "
        >
          {{ entry.ok ? `HTTP ${entry.status}` : 'Fail' }}
        </span>
      </div>
    </div>

    <div
      v-else-if="loading"
      class="flex items-center gap-2 px-4 py-3"
    >
      <Loader2 class="h-3.5 w-3.5 text-(--app-primary) shrink-0 animate-spin" :stroke-width="2" />
      <p class="text-xs text-(--app-muted)">Testing servers…</p>
    </div>

    <div v-else class="flex items-center gap-2 px-4 py-3">
      <WifiOff class="h-3.5 w-3.5 text-zinc-500 shrink-0" :stroke-width="2" />
      <p class="text-xs text-(--app-muted)">No test results yet.</p>
    </div>
  </div>
</template>
