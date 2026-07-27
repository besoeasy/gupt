<script setup>
import { computed, onMounted, ref, watch } from "vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { addCustomRelay, normalizeRelay, queryMany, readRelays } from "@/lib/relay";
import { getAllPeerRelayHints } from "@/lib/idb";
import {
  Activity,
  Globe,
  Loader2,
  RefreshCw,
  MessageSquare,
  Users,
  Shield,
  Share2,
  Tag,
  Clock,
  Layers,
  Plus,
  Check,
  Server,
} from "@lucide/vue";

const selectedTimeframe = ref("1d"); // "1d", "7d", "30d"
const loading = ref(false);
const error = ref("");
const rawEvents = ref([]);
const queriedRelayCount = ref(0);
const queryDurationMs = ref(0);

const TIMEFRAMES = [{ id: "1d", label: "24 Hours", seconds: 86400 }];

const KNOWN_TAGS = {
  "gupt-dm": {
    label: "Direct Messages",
    icon: MessageSquare,
    color: "bg-emerald-500",
    textColor: "text-emerald-400",
  },
  "gupt-group": {
    label: "Group Messages",
    icon: Users,
    color: "bg-cyan-500",
    textColor: "text-cyan-400",
  },
  gupt_vault: {
    label: "Vault Entries",
    icon: Shield,
    color: "bg-amber-500",
    textColor: "text-amber-400",
  },
  gupt_share: {
    label: "Shared Notes",
    icon: Share2,
    color: "bg-violet-500",
    textColor: "text-violet-400",
  },
};

function getCutoffTimestamp(tfId) {
  const tf = TIMEFRAMES.find((t) => t.id === tfId) || TIMEFRAMES[0];
  return Math.floor(Date.now() / 1000) - tf.seconds;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCacheKey(tfId) {
  return `gupt_net_stats_${tfId}`;
}

function loadCachedStats(tfId) {
  try {
    const raw = sessionStorage.getItem(getCacheKey(tfId));
    if (!raw) return false;
    const cache = JSON.parse(raw);
    if (!cache || !cache.timestamp || Date.now() - cache.timestamp >= CACHE_TTL_MS) {
      sessionStorage.removeItem(getCacheKey(tfId));
      return false;
    }
    rawEvents.value = cache.events || [];
    queriedRelayCount.value = cache.relayCount || 0;
    queryDurationMs.value = cache.durationMs || 0;
    return true;
  } catch {
    return false;
  }
}

function saveCachedStats(tfId, events, relayCount, durationMs) {
  try {
    const cache = {
      timestamp: Date.now(),
      events,
      relayCount,
      durationMs,
    };
    sessionStorage.setItem(getCacheKey(tfId), JSON.stringify(cache));
  } catch (err) {
    console.warn("Failed to save network stats to sessionStorage", err);
  }
}

async function fetchNetworkStats(force = false) {
  if (!force && loadCachedStats(selectedTimeframe.value)) {
    return;
  }

  loading.value = true;
  error.value = "";
  const start = Date.now();

  try {
    const configuredRelays = await readRelays();
    queriedRelayCount.value = configuredRelays.length;

    const since = getCutoffTimestamp(selectedTimeframe.value);
    const targetTags = ["gupt-dm", "gupt-group", "gupt_vault", "gupt_share"];

    // Fetch events containing any of our core GUPT tags
    const events = await queryMany(
      [
        {
          kinds: [1, 4],
          "#t": targetTags,
          since,
          limit: 1000,
        },
      ],
      7000,
    );

    const fetchedEvents = events || [];
    const duration = Date.now() - start;

    rawEvents.value = fetchedEvents;
    queryDurationMs.value = duration;

    saveCachedStats(selectedTimeframe.value, fetchedEvents, configuredRelays.length, duration);
  } catch (e) {
    error.value = e.message || "Failed to fetch network statistics from relays.";
    rawEvents.value = [];
  } finally {
    loading.value = false;
  }
}

watch(selectedTimeframe, () => {
  void fetchNetworkStats(false);
});

onMounted(() => {
  void fetchNetworkStats(false);
  void refreshActiveRelays();
  void fetchDbPeerRelayHints();
});

// Category metrics computation
const tagCounts = computed(() => {
  const counts = {
    "gupt-dm": 0,
    "gupt-group": 0,
    gupt_vault: 0,
    gupt_share: 0,
    other: 0,
  };
  const customTags = {};

  for (const ev of rawEvents.value) {
    const tTags = (ev.tags || []).filter((t) => t[0] === "t" && t[1]).map((t) => t[1]);

    let matchedKnown = false;
    for (const tagVal of tTags) {
      if (counts[tagVal] !== undefined) {
        counts[tagVal]++;
        matchedKnown = true;
      } else {
        customTags[tagVal] = (customTags[tagVal] || 0) + 1;
      }
    }

    if (!matchedKnown && tTags.length === 0) {
      counts.other++;
    }
  }

  return { counts, customTags };
});

const totalEventsCount = computed(() => rawEvents.value.length);

const categoryBreakdown = computed(() => {
  const total = totalEventsCount.value || 1;
  const c = tagCounts.value.counts;
  return Object.keys(KNOWN_TAGS).map((tagKey) => {
    const meta = KNOWN_TAGS[tagKey];
    const count = c[tagKey] || 0;
    const percentage = Math.round((count / total) * 100);
    return {
      key: tagKey,
      label: meta.label,
      icon: meta.icon,
      color: meta.color,
      textColor: meta.textColor,
      count,
      percentage,
    };
  });
});

// Custom user vault tags distribution
const customTagsList = computed(() => {
  const entries = Object.entries(tagCounts.value.customTags);
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, 10).map(([tag, count]) => ({ tag, count }));
});

// Time series distribution buckets
const timelineBuckets = computed(() => {
  if (!rawEvents.value.length) return [];
  const count = 12; // 12 columns/bars
  const tfSec = TIMEFRAMES.find((t) => t.id === selectedTimeframe.value)?.seconds || 86400;
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - tfSec;
  const bucketSize = tfSec / count;

  const buckets = Array.from({ length: count }, (_, i) => ({
    index: i,
    count: 0,
    label: "",
  }));

  for (const ev of rawEvents.value) {
    if (!ev.created_at || ev.created_at < startTime) continue;
    const bucketIndex = Math.min(
      count - 1,
      Math.max(0, Math.floor((ev.created_at - startTime) / bucketSize)),
    );
    buckets[bucketIndex].count++;
  }

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  return buckets.map((b) => ({
    ...b,
    heightPct: Math.round((b.count / maxCount) * 100),
  }));
});

// Top 20 Relay Hints logic
const activeRelayUrls = ref(new Set());
const dbRelayHints = ref([]);
const hoveredRelayHint = ref(null);

const RELAY_HINT_COLORS = [
  { bg: "bg-sky-500", stroke: "#0ea5e9", text: "text-sky-400" },
  { bg: "bg-indigo-500", stroke: "#6366f1", text: "text-indigo-400" },
  { bg: "bg-emerald-500", stroke: "#10b981", text: "text-emerald-400" },
  { bg: "bg-amber-500", stroke: "#f59e0b", text: "text-amber-400" },
  { bg: "bg-purple-500", stroke: "#a855f7", text: "text-purple-400" },
  { bg: "bg-rose-500", stroke: "#f43f5e", text: "text-rose-400" },
  { bg: "bg-cyan-500", stroke: "#06b6d4", text: "text-cyan-400" },
  { bg: "bg-teal-500", stroke: "#14b8a6", text: "text-teal-400" },
];
const DEFAULT_RELAY_COLOR = { bg: "bg-zinc-500", stroke: "#71717a", text: "text-zinc-400" };

async function refreshActiveRelays() {
  const configured = await readRelays();
  activeRelayUrls.value = new Set((configured || []).map(normalizeRelay).filter(Boolean));
}

async function fetchDbPeerRelayHints() {
  dbRelayHints.value = await getAllPeerRelayHints();
}

const topRelayHints = computed(() => {
  const counts = new Map();

  // 1. Hints from events p-tags
  for (const ev of rawEvents.value) {
    if (!Array.isArray(ev.tags)) continue;
    for (const tag of ev.tags) {
      if (tag[0] === "p" && tag[2]) {
        const norm = normalizeRelay(tag[2]);
        if (norm) {
          counts.set(norm, (counts.get(norm) || 0) + 1);
        }
      }
    }
  }

  // 2. Hints from IDB peerRelayHints store
  for (const row of dbRelayHints.value) {
    if (Array.isArray(row.hints)) {
      for (const h of row.hints) {
        if (h?.url) {
          const norm = normalizeRelay(h.url);
          if (norm) {
            counts.set(norm, (counts.get(norm) || 0) + 2);
          }
        }
      }
    }
  }

  const rawEntries = [...counts.entries()].map(([url, count]) => ({
    url,
    count,
    isConfigured: activeRelayUrls.value.has(url),
  }));

  rawEntries.sort((a, b) => b.count - a.count);
  const top20 = rawEntries.slice(0, 20);
  const totalCount = top20.reduce((sum, item) => sum + item.count, 0);

  return top20.map((item, idx) => {
    const colorInfo = RELAY_HINT_COLORS[idx % RELAY_HINT_COLORS.length] || DEFAULT_RELAY_COLOR;
    const percentage = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
    return {
      ...item,
      displayHost: item.url.replace(/^wss:\/\//i, "").replace(/\/$/, ""),
      percentage,
      color: colorInfo.bg,
      strokeColor: colorInfo.stroke,
      textColor: colorInfo.text,
    };
  });
});

const totalHintCount = computed(() => {
  return topRelayHints.value.reduce((sum, item) => sum + item.count, 0);
});

const activeRelayHint = computed(() => {
  if (!hoveredRelayHint.value) return null;
  return topRelayHints.value.find((item) => item.url === hoveredRelayHint.value) || null;
});

const relayHintSegments = computed(() => {
  const hints = topRelayHints.value;
  if (!hints.length) return [];

  const radius = 45;
  const circumference = 2 * Math.PI * radius;

  const total = totalHintCount.value;
  let accumulatedOffset = 0;

  return hints.map((item) => {
    const fraction = total > 0 ? item.count / total : 1 / hints.length;
    const segmentLength = fraction * circumference;
    const dashLength = Math.max(0, segmentLength - (hints.length > 1 ? 1.5 : 0));
    const strokeDasharray = `${dashLength} ${circumference - dashLength}`;
    const strokeDashoffset = -accumulatedOffset;
    accumulatedOffset += segmentLength;

    return {
      ...item,
      fraction,
      strokeDasharray,
      strokeDashoffset,
    };
  });
});

async function handleAddRelay(url) {
  const added = addCustomRelay(url);
  if (added) {
    await refreshActiveRelays();
  }
}
</script>

<template>
  <div class="min-h-screen pb-12">
    <main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <!-- Top header & Refresh -->
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">Network Analytics</h1>
          <p class="mt-1 text-sm text-(--app-muted)">
            Global tag activity aggregated from {{ queriedRelayCount }} active Nostr relays
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- 24 Hours Badge -->
          <div
            class="flex items-center gap-1.5 rounded-xl bg-(--app-surface) px-3 py-1.5 border border-(--app-border) text-xs font-semibold text-(--app-text)"
          >
            <Clock class="h-3.5 w-3.5 text-(--app-primary)" />
            <span>24 Hours Activity</span>
          </div>

          <button
            @click="fetchNetworkStats(true)"
            :disabled="loading"
            class="flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface) text-(--app-text) transition-colors hover:bg-(--app-surface-hover) cursor-pointer disabled:opacity-50"
            title="Refresh network data (bypass cache)"
          >
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
          </button>
        </div>
      </div>

      <AppAlertBanner v-if="error" :message="error" class="mb-6" />

      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 class="h-8 w-8 animate-spin text-(--app-primary)" />
        <p class="mt-3 text-sm text-(--app-muted)">Querying relays for network event tags…</p>
      </div>

      <template v-else>
        <!-- KPI Cards -->
        <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="item in categoryBreakdown"
            :key="item.key"
            class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-4 transition-all"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-(--app-muted)">{{ item.label }}</span>
              <component :is="item.icon" class="h-4 w-4 shrink-0" :class="item.textColor" />
            </div>
            <div class="mt-3 flex items-baseline justify-between">
              <span class="text-2xl font-extrabold text-(--app-text) tabular-nums">
                {{ item.count.toLocaleString() }}
              </span>
              <span class="text-xs font-semibold" :class="item.textColor">
                {{ item.percentage }}%
              </span>
            </div>
          </div>
        </div>

        <!-- Total Volume & Distribution Progress -->
        <div class="mb-6 rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 space-y-4">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-base font-bold text-(--app-text)">Tag Event Distribution</h2>
              <p class="text-xs text-(--app-muted)">
                Total {{ totalEventsCount.toLocaleString() }} events detected over selected window
              </p>
            </div>
            <div class="flex items-center gap-2 text-xs text-(--app-muted) tabular-nums">
              <Clock class="h-3.5 w-3.5" />
              <span>Query took {{ queryDurationMs }}ms</span>
            </div>
          </div>

          <!-- Solid Multi-Segment Progress Bar (NO GRADIENTS per guidelines) -->
          <div class="flex h-3.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              v-for="item in categoryBreakdown"
              :key="item.key"
              :style="{ width: item.percentage + '%' }"
              :class="item.color"
              :title="`${item.label}: ${item.count} (${item.percentage}%)`"
              class="h-full transition-all duration-300"
            />
          </div>

          <!-- Legend -->
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
            <div
              v-for="item in categoryBreakdown"
              :key="item.key"
              class="flex items-center gap-2 text-xs"
            >
              <span class="h-2.5 w-2.5 rounded-full shrink-0" :class="item.color" />
              <span class="text-(--app-muted) truncate">{{ item.label }}</span>
              <span class="ml-auto font-bold text-(--app-text) tabular-nums">{{ item.count }}</span>
            </div>
          </div>
        </div>

        <!-- Activity Timeline & Custom Tags Grid -->
        <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
          <!-- Timeline Bar Chart -->
          <div
            class="md:col-span-2 rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 flex flex-col justify-between"
          >
            <div>
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-bold text-(--app-text)">Event Activity Histogram</h3>
                <span class="text-xs text-(--app-muted)">Timeline Distribution</span>
              </div>

              <!-- Bar graph -->
              <div
                class="flex h-40 items-end gap-1.5 pt-6 pb-2 px-2 border-b border-(--app-border)"
              >
                <div
                  v-for="b in timelineBuckets"
                  :key="b.index"
                  class="group relative flex flex-1 flex-col items-center h-full justify-end"
                >
                  <!-- Tooltip -->
                  <div
                    class="absolute -top-7 hidden rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-white group-hover:block z-10 whitespace-nowrap"
                  >
                    {{ b.count }} events
                  </div>
                  <div
                    class="w-full rounded-t bg-(--app-primary) transition-all duration-300 hover:opacity-80"
                    :style="{ height: Math.max(b.heightPct, 4) + '%' }"
                  />
                </div>
              </div>
            </div>

            <p class="mt-3 text-center text-[11px] text-(--app-muted)">
              Events grouped into 12 timeframe intervals across
              {{ TIMEFRAMES.find((t) => t.id === selectedTimeframe)?.label }}
            </p>
          </div>

          <!-- Custom User Vault Tags -->
          <div class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-bold text-(--app-text)">User Custom Tags</h3>
              <Tag class="h-4 w-4 text-(--app-muted)" />
            </div>

            <div v-if="!customTagsList.length" class="py-10 text-center text-xs text-(--app-muted)">
              No custom user tags found in fetched events.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="ct in customTagsList"
                :key="ct.tag"
                class="flex items-center justify-between rounded-xl bg-(--app-surface-hover) px-3 py-2 text-xs"
              >
                <span class="font-mono text-(--app-text) truncate">#{{ ct.tag }}</span>
                <span class="font-bold text-(--app-primary) tabular-nums">{{ ct.count }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top 20 Most Used Discovered Relays (Relay Hints) -->
        <div class="mt-6 rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-6 space-y-6">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-base font-bold text-(--app-text)">Top Discovered Relay Hints</h2>
              <p class="text-xs text-(--app-muted) mt-0.5">
                Most active relay hints extracted from peer events and local hint cache (Top 20)
              </p>
            </div>
            <div class="flex items-center gap-1.5 text-xs font-semibold text-(--app-muted) tabular-nums">
              <Server class="h-3.5 w-3.5" />
              <span>{{ topRelayHints.length }} Discovered</span>
            </div>
          </div>

          <div v-if="!topRelayHints.length" class="py-10 text-center text-xs text-(--app-muted)">
            No relay hints discovered yet.
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <!-- Donut Chart Canvas -->
            <div class="md:col-span-5 flex flex-col items-center justify-center p-2 relative">
              <div class="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
                <svg
                  class="w-full h-full -rotate-90 transform"
                  viewBox="0 0 120 120"
                >
                  <!-- Background Track Ring -->
                  <circle
                    cx="60"
                    cy="60"
                    r="45"
                    fill="transparent"
                    stroke="currentColor"
                    class="text-zinc-800"
                    stroke-width="14"
                  />
                  <!-- Segment Circles -->
                  <circle
                    v-for="item in relayHintSegments"
                    :key="item.url"
                    cx="60"
                    cy="60"
                    r="45"
                    fill="transparent"
                    :stroke="item.strokeColor"
                    :stroke-width="hoveredRelayHint === item.url ? 18 : 14"
                    :stroke-dasharray="item.strokeDasharray"
                    :stroke-dashoffset="item.strokeDashoffset"
                    :class="[
                      'transition-all duration-300 ease-out cursor-pointer',
                      hoveredRelayHint && hoveredRelayHint !== item.url ? 'opacity-40' : 'opacity-100',
                    ]"
                    @mouseenter="hoveredRelayHint = item.url"
                    @mouseleave="hoveredRelayHint = null"
                  />
                </svg>

                <!-- Center Content -->
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none"
                >
                  <template v-if="activeRelayHint">
                    <span
                      class="text-xs font-mono font-bold tracking-tight truncate max-w-[140px]"
                      :class="activeRelayHint.textColor"
                      :title="activeRelayHint.displayHost"
                    >
                      {{ activeRelayHint.displayHost }}
                    </span>
                    <span class="text-xl sm:text-2xl font-extrabold text-(--app-text) tabular-nums tracking-tight mt-1">
                      {{ activeRelayHint.count }} {{ activeRelayHint.count === 1 ? 'hint' : 'hints' }}
                    </span>
                    <span class="text-xs font-medium text-(--app-muted) mt-0.5 tabular-nums">
                      {{ activeRelayHint.percentage }}% share
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-xs font-semibold text-(--app-muted) uppercase tracking-wider">Total Hints</span>
                    <span class="text-2xl sm:text-3xl font-extrabold text-(--app-text) tabular-nums tracking-tight mt-1">
                      {{ totalHintCount }}
                    </span>
                    <span class="text-xs font-medium text-(--app-muted) mt-0.5 tabular-nums">
                      Across {{ topRelayHints.length }} relays
                    </span>
                  </template>
                </div>
              </div>
            </div>

            <!-- Discovered Relays List -->
            <div class="md:col-span-7 grid grid-cols-1 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
              <div
                v-for="(item, idx) in topRelayHints"
                :key="item.url"
                class="flex items-center justify-between rounded-xl bg-(--app-surface-hover) p-3 text-xs border transition-all cursor-pointer"
                :class="[
                  hoveredRelayHint === item.url
                    ? 'border-(--app-primary)/50 bg-(--app-surface-hover)'
                    : 'border-transparent hover:border-(--app-border)',
                ]"
                @mouseenter="hoveredRelayHint = item.url"
                @mouseleave="hoveredRelayHint = null"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="h-3 w-3 rounded-full shrink-0" :class="item.color" />
                  <span class="text-[11px] font-bold text-(--app-muted) tabular-nums shrink-0">
                    #{{ idx + 1 }}
                  </span>
                  <span class="font-mono text-(--app-text) truncate min-w-0" :title="item.url">
                    {{ item.displayHost }}
                  </span>
                </div>

                <div class="flex items-center gap-3 shrink-0 ml-2">
                  <div class="text-right">
                    <span class="text-xs font-bold text-(--app-text) tabular-nums block">
                      {{ item.count }} {{ item.count === 1 ? "hint" : "hints" }}
                    </span>
                    <span class="text-[10px] text-(--app-muted) tabular-nums block font-medium">
                      {{ item.percentage }}%
                    </span>
                  </div>

                  <!-- Active status badge or Add Relay button -->
                  <span
                    v-if="item.isConfigured"
                    class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-400"
                  >
                    <Check class="h-3 w-3" />
                    <span>Active</span>
                  </span>

                  <button
                    v-else
                    @click.stop="handleAddRelay(item.url)"
                    class="inline-flex items-center gap-1 rounded-lg bg-(--app-primary)/15 px-2.5 py-1 text-[11px] font-semibold text-(--app-primary) hover:bg-(--app-primary)/25 transition-colors cursor-pointer"
                  >
                    <Plus class="h-3 w-3" />
                    <span>Add Relay</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>
