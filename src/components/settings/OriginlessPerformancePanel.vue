<script setup>
import { ref, computed, onMounted } from "vue";
import { RefreshCw, Activity } from "@lucide/vue";
import { buildOriginlessUploadUrl, readConfiguredOriginlessServers } from "@/config/servers";
import { testUploadServers } from "@/lib/upload";

const results = ref([]);
const loading = ref(false);

const allServers = computed(() => readConfiguredOriginlessServers());

const serverEntries = computed(() =>
  allServers.value.map((server) => ({
    id: `originless:${server}`,
    server,
    uploadUrl: buildOriginlessUploadUrl(server),
    type: "originless",
  })),
);

const rows = computed(() => {
  const byServer = new Map(results.value.map((r) => [r.server, r]));
  return allServers.value.map((server) => {
    const result = byServer.get(server);
    return {
      id: `originless:${server}`,
      server,
      ok: Boolean(result?.ok),
      status: result?.status,
      tested: Boolean(result),
    };
  });
});

const okCount = computed(() => rows.value.filter((r) => r.ok).length);
const totalCount = computed(() => rows.value.length);

function serverHost(url) {
  return String(url || "").replace(/^https?:\/\//i, "");
}

async function runTests() {
  if (loading.value || !serverEntries.value.length) return;
  loading.value = true;
  try {
    results.value = await testUploadServers(serverEntries.value);
  } finally {
    loading.value = false;
  }
}

onMounted(runTests);
</script>

<template>
  <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden shadow-xs">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/80">
      <div class="flex items-center gap-1.5 min-w-0">
        <Activity class="h-3.5 w-3.5 text-emerald-400 shrink-0" :stroke-width="2" />
        <p class="text-xs font-semibold tracking-tight text-zinc-200">Active Servers</p>
        <span
          class="ml-0.5 rounded-full bg-emerald-400/15 px-1.5 py-px text-[10px] font-bold tabular-nums text-emerald-400"
          >{{ okCount }}/{{ totalCount }}</span
        >
      </div>
      <button
        type="button"
        :disabled="loading"
        class="inline-flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
        :class="{ 'animate-spin': loading }"
        title="Refresh"
        @click="runTests"
      >
        <RefreshCw class="h-3 w-3" :stroke-width="2" />
      </button>
    </div>

    <div v-if="rows.length" class="px-3 py-3 space-y-1">
      <div
        v-for="entry in rows"
        :key="entry.id"
        class="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-1.5 text-[11px]"
        :class="{ 'border-emerald-500/30 bg-emerald-500/5': entry.ok }"
      >
        <span class="font-mono truncate text-zinc-300 tracking-tight" :title="entry.server">
          {{ serverHost(entry.server) }}
        </span>
        <span
          v-if="entry.ok"
          class="ml-1 shrink-0 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-bold text-emerald-400 uppercase tracking-wider"
        >
          Active
        </span>
        <span
          class="ml-auto shrink-0 tabular-nums whitespace-nowrap font-semibold font-mono"
          :class="entry.ok ? 'text-emerald-400' : entry.tested ? 'text-red-400' : 'text-zinc-500'"
        >
          <template v-if="entry.ok">HTTP {{ entry.status }}</template>
          <template v-else-if="entry.tested">Fail</template>
          <template v-else>untested</template>
        </span>
      </div>
    </div>

    <div v-else class="flex items-center gap-2 px-4 py-3">
      <p class="text-xs text-zinc-500">No originless servers configured.</p>
    </div>
  </div>
</template>
