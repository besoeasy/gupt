<script setup>
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { RETENTION_DAYS, RETENTION_MAX_BYTES } from "@/config/retention";
import { getCacheSummary, getRelayHealthSummary, getRelayRanking } from "@/lib/idb";
import { EXPLOIT_SLOTS } from "@/lib/relay";

const summary = ref(null);
const relayHealth = ref([]);
const relayRanking = ref([]);
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

const relaysToReplace = computed(() =>
  relayHealth.value.filter((entry) => entry.tier === "replace"),
);

const relaysDegraded = computed(() =>
  relayHealth.value.filter((entry) => entry.tier === "degraded"),
);

function relayLabel(url) {
  return String(url || "").replace(/^wss:\/\//i, "");
}

function tierLabel(tier) {
  if (tier === "good") return "Good";
  if (tier === "degraded") return "Degraded";
  if (tier === "replace") return "Replace";
  return "Collecting data";
}

function tierDot(tier) {
  if (tier === "good") return "bg-emerald-400";
  if (tier === "degraded") return "bg-yellow-400";
  if (tier === "replace") return "bg-red-500";
  return "bg-zinc-500";
}

function tierText(tier) {
  if (tier === "good") return "text-emerald-400";
  if (tier === "degraded") return "text-yellow-400";
  if (tier === "replace") return "text-red-400";
  return "text-zinc-500";
}

function formatRate(rate) {
  return rate === null || rate === undefined ? "—" : `${rate}%`;
}

function scoreColor(score) {
  if (score >= 0.7) return "text-emerald-400";
  if (score >= 0.4) return "text-yellow-400";
  return "text-red-400";
}

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const [cacheSummary, relays, ranking] = await Promise.all([
      getCacheSummary(),
      getRelayHealthSummary(),
      getRelayRanking(),
    ]);
    summary.value = cacheSummary;
    relayHealth.value = relays;
    relayRanking.value = ranking;
  } catch (e) {
    error.value = e.message || "Unable to load stats.";
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <div class="min-h-screen">
    <main class="mx-auto w-full max-w-[80rem] px-4 py-6 lg:px-8">
      <div class="max-w-2xl mx-auto space-y-5">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold tracking-tight">Stats</h1>
            <p class="mt-1 text-sm text-zinc-500">
              Cache usage and relay health from real sends · 90-day rolling window
            </p>
          </div>
          <RouterLink
            to="/network"
            class="rounded-xl border border-(--app-border) bg-(--app-surface) px-3 py-1.5 text-xs font-semibold text-(--app-primary) hover:bg-(--app-surface-hover) transition-colors"
          >
            Network Stats →
          </RouterLink>
        </div>

        <AppAlertBanner v-if="error" :message="error" />

        <div v-if="loading" class="py-16 text-center text-zinc-500 text-sm">Loading…</div>

        <template v-else-if="summary">
          <!-- Relay Ranking (EWMA) -->
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-4"
          >
            <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p class="text-sm font-semibold">Relay Ranking</p>
                <p class="text-[11px] text-zinc-500">
                  EWMA success-rate · best {{ EXPLOIT_SLOTS }} exploit + explore slots
                </p>
              </div>
              <p class="text-[11px] text-zinc-500 tabular-nums">{{ relayRanking.length }} ranked</p>
            </div>

            <div v-if="!relayRanking.length" class="py-8 text-center text-sm text-zinc-500">
              No relay data yet — send a message to start ranking.
            </div>

            <div v-else class="space-y-0.5">
              <div
                v-for="(entry, idx) in relayRanking"
                :key="entry.relay"
                class="rounded-xl px-2 py-2.5 transition-colors hover:bg-white/4"
                :class="idx >= EXPLOIT_SLOTS ? 'opacity-60' : ''"
              >
                <div class="flex items-center gap-3">
                  <span class="shrink-0 w-4 text-[10px] text-zinc-600 tabular-nums text-right">{{
                    idx + 1
                  }}</span>
                  <span
                    class="shrink-0 h-2 w-2 rounded-full"
                    :class="scoreColor(entry.score) + ' bg-current opacity-60'"
                  />
                  <p class="flex-1 min-w-0 text-xs text-zinc-300 truncate font-mono">
                    {{ relayLabel(entry.relay) }}
                  </p>
                  <span
                    class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                    :class="
                      idx < EXPLOIT_SLOTS
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-violet-500/15 text-violet-400'
                    "
                  >
                    {{ idx < EXPLOIT_SLOTS ? "Exploit" : "Explore" }}
                  </span>
                </div>
                <div
                  class="mt-2 ml-7 flex items-center gap-3 text-[10px] tabular-nums text-zinc-500"
                >
                  <span :class="scoreColor(entry.score)">
                    {{ (entry.score * 100).toFixed(0) }}% success
                  </span>
                  <span v-if="entry.latencyMs > 0"> {{ entry.latencyMs.toFixed(0) }}ms </span>
                  <span v-else class="text-zinc-600">new</span>
                  <span class="text-zinc-600">{{ entry.samples }} ops</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Relay health (raw outcomes) -->
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-4"
          >
            <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p class="text-sm font-semibold">Relay health</p>
                <p class="text-[11px] text-zinc-500">
                  Per-relay publish, connect, and query success from actual app traffic
                </p>
              </div>
              <p class="text-[11px] text-zinc-500 tabular-nums">{{ relayHealth.length }} tracked</p>
            </div>

            <div
              v-if="relaysToReplace.length"
              class="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-300"
            >
              Consider replacing {{ relaysToReplace.length }} relay{{
                relaysToReplace.length === 1 ? "" : "s"
              }}
              with consistently low publish success.
            </div>

            <div
              v-else-if="relaysDegraded.length"
              class="rounded-xl border border-yellow-500/20 bg-yellow-500/8 px-3 py-2 text-xs text-yellow-300"
            >
              {{ relaysDegraded.length }} relay{{ relaysDegraded.length === 1 ? " is" : "s are" }}
              degraded — watch before removing.
            </div>

            <div class="space-y-0.5">
              <div
                v-for="entry in relayHealth"
                :key="entry.relay"
                class="rounded-xl px-2 py-2.5 transition-colors hover:bg-white/4"
              >
                <div class="flex items-center gap-3">
                  <span class="shrink-0 h-2 w-2 rounded-full" :class="tierDot(entry.tier)" />
                  <p class="flex-1 min-w-0 text-xs text-zinc-300 truncate font-mono">
                    {{ relayLabel(entry.relay) }}
                  </p>
                  <span
                    class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    :class="{
                      'bg-emerald-500/15 text-emerald-400': entry.tier === 'good',
                      'bg-yellow-500/15 text-yellow-400': entry.tier === 'degraded',
                      'bg-red-500/15 text-red-400': entry.tier === 'replace',
                      'bg-white/8 text-zinc-400': entry.tier === 'unknown',
                    }"
                  >
                    {{ tierLabel(entry.tier) }}
                  </span>
                </div>

                <div class="mt-2 grid grid-cols-3 gap-2 text-[10px] text-zinc-500">
                  <div>
                    <p class="uppercase tracking-wide text-zinc-600">Publish</p>
                    <p class="mt-0.5 tabular-nums" :class="tierText(entry.tier)">
                      {{ formatRate(entry.publishSuccessRate) }}
                      <span class="text-zinc-600">
                        ({{ entry.publishOk }}/{{ entry.publishTotal }})
                      </span>
                    </p>
                    <p v-if="entry.avgPublishMs" class="mt-0.5 tabular-nums">
                      avg {{ entry.avgPublishMs }} ms
                    </p>
                  </div>
                  <div>
                    <p class="uppercase tracking-wide text-zinc-600">Connect</p>
                    <p class="mt-0.5 tabular-nums">
                      {{ formatRate(entry.connectSuccessRate) }}
                      <span class="text-zinc-600">
                        ({{ entry.connectOk }}/{{ entry.connectTotal }})
                      </span>
                    </p>
                    <p v-if="entry.avgConnectMs" class="mt-0.5 tabular-nums">
                      avg {{ entry.avgConnectMs }} ms
                    </p>
                  </div>
                  <div>
                    <p class="uppercase tracking-wide text-zinc-600">Query</p>
                    <p class="mt-0.5 tabular-nums">
                      {{ formatRate(entry.querySuccessRate) }}
                      <span class="text-zinc-600">
                        ({{ entry.queryOk }}/{{ entry.queryTotal }})
                      </span>
                    </p>
                    <p v-if="entry.avgQueryMs" class="mt-0.5 tabular-nums">
                      avg {{ entry.avgQueryMs }} ms
                    </p>
                  </div>
                </div>

                <p v-if="entry.lastError" class="mt-2 text-[10px] text-zinc-600 truncate">
                  Last error: {{ entry.lastError }}
                </p>
              </div>

              <div v-if="!relayHealth.length" class="py-8 text-center text-sm text-zinc-500">
                No relay stats yet. Send a message or refresh Settings relay health to start
                collecting data.
              </div>
            </div>
          </div>

          <!-- Summary cards -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div
              class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4"
            >
              <p class="text-2xl font-bold">{{ summary.totalEntries.toLocaleString() }}</p>
              <p class="mt-1 text-xs text-zinc-500">Cached entries</p>
            </div>
            <div
              class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4"
            >
              <p class="text-2xl font-bold">{{ formatBytes(summary.totalEstimatedBytes) }}</p>
              <p class="mt-1 text-xs text-zinc-500">Estimated size</p>
            </div>
          </div>

          <!-- Storage bar -->
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
          >
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
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-2"
          >
            <div class="flex items-center justify-between pb-2">
              <p class="text-sm font-semibold">Cache stores</p>
              <p class="text-[11px] text-zinc-500">{{ summary.dbName }}</p>
            </div>
            <div
              v-for="store in sortedStores"
              :key="store.table"
              class="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/4"
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
