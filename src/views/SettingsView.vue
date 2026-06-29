<script setup>
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { Plus, RefreshCw, RotateCcw, Search, Trash2, X } from "lucide-vue-next";
import packageMeta from "../../package.json";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useSettingsStore } from "@/stores/settings";
import { RETENTION_DAYS, RETENTION_MAX_BYTES } from "@/config/retention";
import { getCacheSummary, getRelayHealthSummary } from "@/lib/idb";
import { cleanupLocalDataKeepingAccount } from "@/lib/appReset";
import { useIdentityStore } from "@/stores/identity";

const settingsStore = useSettingsStore();
const identity = useIdentityStore();
const version = packageMeta.version;

import {
  buildOriginlessUploadUrl,
  DEFAULT_BLOSSOM_SERVERS,
  DEFAULT_ORIGINLESS_SERVERS,
  DEFAULT_RELAYS,
  normalizeOriginlessServerUrl,
  readUserBlossomServers,
  readUserOriginlessServers,
  saveUserBlossomServers,
  saveUserOriginlessServers,
} from "@/config/servers";
import { getKnownRelays } from "@/lib/api";

// ─── Relay health ─────────────────────────────────────────────────────────────

/**
 * Probe a relay by opening a real WebSocket connection and measuring the time
 * to the `open` event. This correctly tests the relay protocol (wss://) rather
 * than an arbitrary HTTP endpoint, and avoids no-cors opaque response issues.
 * Returns { url, ms, tier } where tier is 'fast'|'ok'|'slow'|'offline'.
 */
function probeRelay(wssUrl) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let settled = false;

    function done(ms) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ms === null) {
        resolve({ url: wssUrl, ms: null, tier: "offline" });
      } else {
        const tier = ms < 150 ? "fast" : ms < 500 ? "ok" : "slow";
        resolve({ url: wssUrl, ms, tier });
      }
      // Close quietly — ignore any subsequent events.
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }

    const timer = setTimeout(() => done(null), 4000);

    let ws;
    try {
      ws = new WebSocket(wssUrl);
    } catch {
      done(null);
      return;
    }

    ws.onopen = () => done(Math.round(performance.now() - t0));
    ws.onerror = () => done(null);
    ws.onclose = (e) => {
      // Some relays close immediately after open (e.g. send a NOTICE then close).
      // If we timed the open event already we're settled; otherwise count as offline.
      if (!settled) done(null);
    };
  });
}

const relayResults = ref([]);
const relayTrafficByUrl = ref({});
const relayChecking = ref(false);
const relayCheckedAt = ref(null);

function relayList() {
  const known = getKnownRelays();
  return known.length ? known : [...DEFAULT_RELAYS];
}

async function loadRelayTrafficStats() {
  try {
    const rows = await getRelayHealthSummary();
    const next = {};
    for (const row of rows) {
      if (row?.relay) next[row.relay] = row;
    }
    relayTrafficByUrl.value = next;
  } catch {
    relayTrafficByUrl.value = {};
  }
}

function trafficFor(url) {
  return relayTrafficByUrl.value[String(url || "")] || null;
}

function formatTrafficRate(rate) {
  return rate === null || rate === undefined ? "—" : `${rate}%`;
}

function trafficTierLabel(tier) {
  if (tier === "good") return "Healthy";
  if (tier === "degraded") return "Degraded";
  if (tier === "replace") return "Replace";
  return "No data";
}

function trafficTierText(tier) {
  if (tier === "good") return "text-emerald-400";
  if (tier === "degraded") return "text-yellow-400";
  if (tier === "replace") return "text-red-400";
  return "text-zinc-500";
}

const relaysToReplace = computed(() =>
  Object.values(relayTrafficByUrl.value).filter((entry) => entry.tier === "replace"),
);

const relaysDegraded = computed(() =>
  Object.values(relayTrafficByUrl.value).filter((entry) => entry.tier === "degraded"),
);

const relaysHealthy = computed(() =>
  Object.values(relayTrafficByUrl.value).filter((entry) => entry.tier === "good"),
);

const mergedRelayRows = computed(() => {
  const trafficRank = { replace: 0, degraded: 1, unknown: 2, good: 3 };
  const probeRank = { offline: 0, slow: 1, ok: 2, fast: 3, checking: 4 };

  return relayResults.value
    .map((probe) => {
      const traffic = trafficFor(probe.url);
      return {
        url: probe.url,
        label: probe.url.replace(/^wss:\/\//i, ""),
        probe,
        traffic,
      };
    })
    .sort((left, right) => {
      const leftTrafficRank = trafficRank[left.traffic?.tier] ?? 2;
      const rightTrafficRank = trafficRank[right.traffic?.tier] ?? 2;
      if (leftTrafficRank !== rightTrafficRank) return leftTrafficRank - rightTrafficRank;

      const leftProbeRank = probeRank[left.probe.tier] ?? 4;
      const rightProbeRank = probeRank[right.probe.tier] ?? 4;
      if (leftProbeRank !== rightProbeRank) return leftProbeRank - rightProbeRank;

      return left.label.localeCompare(right.label);
    });
});

function trafficTierBadgeClass(tier) {
  if (tier === "good") return "bg-emerald-500/15 text-emerald-400";
  if (tier === "degraded") return "bg-yellow-500/15 text-yellow-400";
  if (tier === "replace") return "bg-red-500/15 text-red-400";
  return "bg-white/8 text-zinc-400";
}

function probeBadgeClass(tier) {
  if (tier === "fast") return "bg-emerald-500/15 text-emerald-400";
  if (tier === "ok") return "bg-yellow-500/15 text-yellow-400";
  if (tier === "slow") return "bg-orange-500/15 text-orange-400";
  if (tier === "offline") return "bg-red-500/15 text-red-400";
  return "bg-white/8 text-zinc-400";
}

function rateBarClass(rate) {
  if (rate === null || rate === undefined) return "bg-zinc-600";
  if (rate >= 80) return "bg-emerald-500";
  if (rate >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

async function checkRelays() {
  if (relayChecking.value) return;
  relayChecking.value = true;
  const relays = relayList();
  // Seed rows immediately so the list renders in "checking" state.
  relayResults.value = relays.map((url) => ({ url, ms: null, tier: "checking" }));
  // Probe all relays concurrently and update each row as soon as its result
  // arrives — fast relays appear instantly without waiting for slow ones.
  await Promise.allSettled(
    relays.map((url, i) =>
      probeRelay(url)
        .then((result) => {
          relayResults.value[i] = result;
        })
        .catch(() => {
          relayResults.value[i] = { url, ms: null, tier: "offline" };
        }),
    ),
  );
  relayCheckedAt.value = new Date();
  relayChecking.value = false;
  await loadRelayTrafficStats();
}

function tierLabel(tier) {
  if (tier === "checking") return "Checking…";
  if (tier === "fast") return "Fast";
  if (tier === "ok") return "OK";
  if (tier === "slow") return "Slow";
  return "Offline";
}

function tierDot(tier) {
  if (tier === "checking") return "bg-zinc-600 animate-pulse";
  if (tier === "fast") return "bg-emerald-400";
  if (tier === "ok") return "bg-yellow-400";
  if (tier === "slow") return "bg-orange-400";
  return "bg-red-500";
}

function tierText(tier) {
  if (tier === "fast") return "text-emerald-400";
  if (tier === "ok") return "text-yellow-400";
  if (tier === "slow") return "text-orange-400";
  if (tier === "offline") return "text-red-400";
  return "text-zinc-500";
}

const checkedAtLabel = computed(() => {
  if (!relayCheckedAt.value) return null;
  return relayCheckedAt.value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
});
import { testUploadServers } from "@/lib/upload";

const blossomServers = ref([]);
const originlessServers = ref([]);
const draftServerUrl = ref("");
const draftServerType = ref("blossom");
const saving = ref(false);
const testingServers = ref(false);
const message = ref("");
const error = ref("");
const testResults = ref({});

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

const envBlossomServers = splitCsv(
  import.meta.env.VITE_BLOSSOM_SERVERS || import.meta.env.VITE_BLOSSOM_SERVER,
)
  .map(normalizeOriginlessServerUrl)
  .filter(Boolean);

const envOriginlessServers = splitCsv(import.meta.env.VITE_UPLOAD_URL)
  .map(normalizeOriginlessServerUrl)
  .filter(Boolean);

const effectiveBlossomServers = computed(() =>
  dedupe([...blossomServers.value, ...envBlossomServers, ...DEFAULT_BLOSSOM_SERVERS]),
);

const effectiveOriginlessServers = computed(() =>
  dedupe([...originlessServers.value, ...envOriginlessServers, ...DEFAULT_ORIGINLESS_SERVERS]),
);

const availableServers = computed(() => {
  const blossomCustom = new Set(blossomServers.value);
  const originlessCustom = new Set(originlessServers.value);
  return [
    ...effectiveBlossomServers.value.map((server) => ({
      id: `blossom:${server}`,
      server,
      uploadUrl: buildOriginlessUploadUrl(server),
      type: "Blossom",
      removable: blossomCustom.has(server),
    })),
    ...effectiveOriginlessServers.value.map((server) => ({
      id: `originless:${server}`,
      server,
      uploadUrl: buildOriginlessUploadUrl(server),
      type: "Originless",
      removable: originlessCustom.has(server),
    })),
  ];
});

function loadInputs() {
  blossomServers.value = readUserBlossomServers();
  originlessServers.value = readUserOriginlessServers();
}

function clearTestResults() {
  testResults.value = {};
}

function persistInputs() {
  blossomServers.value = saveUserBlossomServers(blossomServers.value);
  originlessServers.value = saveUserOriginlessServers(originlessServers.value);
}

function addServer() {
  const normalized = normalizeOriginlessServerUrl(draftServerUrl.value);
  if (!normalized) {
    error.value = "Enter a valid http or https server URL.";
    message.value = "";
    return;
  }
  const target = draftServerType.value === "blossom" ? blossomServers : originlessServers;
  if (target.value.includes(normalized)) {
    error.value = `${draftServerType.value === "blossom" ? "Blossom" : "Originless"} server already added.`;
    message.value = "";
    return;
  }
  target.value = [...target.value, normalized];
  persistInputs();
  draftServerUrl.value = "";
  message.value = `${draftServerType.value === "blossom" ? "Blossom" : "Originless"} server added and saved.`;
  error.value = "";
  clearTestResults();
}

function removeServer(server, type) {
  if (type === "Blossom") blossomServers.value = blossomServers.value.filter((e) => e !== server);
  else originlessServers.value = originlessServers.value.filter((e) => e !== server);
  persistInputs();
  message.value = "Server removed and saved.";
  error.value = "";
  clearTestResults();
}

async function runServerTests() {
  testingServers.value = true;
  message.value = "";
  error.value = "";
  try {
    const results = await testUploadServers(availableServers.value);
    testResults.value = Object.fromEntries(results.map((r) => [r.id, r]));
    const passing = results.filter((r) => r.ok).length;
    message.value =
      passing === results.length
        ? "All servers responded."
        : `${passing} of ${results.length} servers responded.`;
  } catch (testError) {
    error.value = testError?.message || "Unable to test servers.";
  } finally {
    testingServers.value = false;
  }
}

async function resetUploadSettings() {
  saving.value = true;
  message.value = "";
  error.value = "";
  try {
    saveUserBlossomServers([]);
    saveUserOriginlessServers([]);
    loadInputs();
    clearTestResults();
    message.value = "Upload servers reset to defaults.";
  } catch (resetError) {
    error.value = resetError?.message || "Unable to reset upload servers.";
  } finally {
    saving.value = false;
  }
}

// ─── Cache stats ─────────────────────────────────────────────────────────────
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
  message.value = "";
  error.value = "";
  cacheError.value = "";

  try {
    await identity.init();
    await cleanupLocalDataKeepingAccount(identity);
    message.value = "Local data purged. Syncing messages from relays…";
    await refreshCache();
  } catch (cleanupError) {
    error.value = cleanupError?.message || "Unable to purge local data.";
  } finally {
    cleaningUp.value = false;
  }
}

const activeTab = ref("general");

const tabs = [
  { id: "general", label: "General" },
  { id: "servers", label: "Servers" },
  { id: "storage", label: "Storage" },
];

onMounted(() => {
  loadInputs();
  void refreshCache();
  void loadRelayTrafficStats();
  void checkRelays();
});
</script>

<template>
  <div class="min-h-screen">
    <main class="app-page-shell mx-auto px-4 py-6 lg:px-8">
      <div class="max-w-2xl mx-auto space-y-5">
        <!-- Header -->
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Settings</h1>
          <p class="mt-1 text-sm text-zinc-500">Manage your preferences, servers, and storage.</p>
        </div>

        <!-- Tab bar -->
        <div class="flex gap-1 rounded-2xl ui-panel p-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            :id="`settings-tab-${tab.id}`"
            class="flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200"
            :class="
              activeTab === tab.id
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/4'
            "
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <!-- General tab: Notifications, Open Source, Version -->
        <template v-if="activeTab === 'general'">
          <!-- Notifications -->
          <div class="ui-panel rounded-2xl p-4 space-y-3">
            <p class="text-sm font-semibold">Notifications</p>

            <label
              id="settings-sound-toggle"
              class="flex items-center justify-between gap-4 cursor-pointer select-none group"
              @click.prevent="settingsStore.soundEnabled = !settingsStore.soundEnabled"
            >
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium text-zinc-100">Message sound</span>
                <span class="block text-[11px] text-zinc-500 mt-0.5">
                  Play a soft ping on incoming messages.
                </span>
              </span>

              <!-- Pill toggle -->
              <span
                class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out"
                :class="settingsStore.soundEnabled ? 'bg-emerald-500' : 'bg-white/15'"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
                  :class="settingsStore.soundEnabled ? 'translate-x-5' : 'translate-x-0.5'"
                />
              </span>
            </label>
          </div>

          <!-- Offline Notifications (ntfy) -->
          <div class="ui-panel rounded-2xl p-4 space-y-3 mt-4">
            <p class="text-sm font-semibold">Offline push (ntfy)</p>
            <p class="text-[13px] leading-relaxed text-zinc-400">
              Gupt can't use normal push alerts because chats are encrypted and we run no central
              server. Get pinged when someone wants you online — full setup guide with app links and
              your topic key.
            </p>
            <RouterLink
              to="/notifications"
              class="inline-flex items-center justify-center rounded-2xl bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 hover:text-emerald-200"
            >
              Open notifications setup
            </RouterLink>
          </div>
        </template>

        <!-- Servers tab: Relay Health + Upload Servers -->
        <template v-if="activeTab === 'servers'">
          <!-- Relay Health -->
          <div class="ui-panel rounded-2xl p-4 space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold">Relay Health</p>
                <p class="text-[11px] text-zinc-500 mt-0.5">
                  Live probe + 90-day traffic stats · worst relays first
                </p>
                <p v-if="checkedAtLabel" class="text-[11px] text-zinc-600 mt-0.5">
                  Probed at {{ checkedAtLabel }}
                </p>
              </div>
              <button
                id="relay-refresh-btn"
                type="button"
                :disabled="relayChecking"
                class="ui-icon-button inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-50"
                @click="checkRelays"
              >
                <RefreshCw
                  :class="relayChecking ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'"
                  :stroke-width="1.9"
                  aria-hidden="true"
                />
                {{ relayChecking ? "Checking…" : "Refresh" }}
              </button>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div class="rounded-xl bg-white/4 px-3 py-2">
                <p class="text-lg font-bold tabular-nums">{{ mergedRelayRows.length }}</p>
                <p class="text-[10px] text-zinc-500">Relays</p>
              </div>
              <div class="rounded-xl bg-emerald-500/8 px-3 py-2">
                <p class="text-lg font-bold tabular-nums text-emerald-400">
                  {{ relaysHealthy.length }}
                </p>
                <p class="text-[10px] text-zinc-500">Healthy</p>
              </div>
              <div class="rounded-xl bg-yellow-500/8 px-3 py-2">
                <p class="text-lg font-bold tabular-nums text-yellow-400">
                  {{ relaysDegraded.length }}
                </p>
                <p class="text-[10px] text-zinc-500">Degraded</p>
              </div>
              <div class="rounded-xl bg-red-500/8 px-3 py-2">
                <p class="text-lg font-bold tabular-nums text-red-400">
                  {{ relaysToReplace.length }}
                </p>
                <p class="text-[10px] text-zinc-500">Replace</p>
              </div>
            </div>

            <div
              v-if="relaysToReplace.length"
              class="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-300"
            >
              {{ relaysToReplace.length }} relay{{ relaysToReplace.length === 1 ? "" : "s" }} with
              consistently low publish success — swap them out of your relay list.
            </div>

            <div v-if="mergedRelayRows.length" class="space-y-1.5">
              <div v-for="row in mergedRelayRows" :key="row.url" class="relay-pill-row">
                <!-- Relay name -->
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="shrink-0 h-2 w-2 rounded-full" :class="tierDot(row.probe.tier)" />
                  <p class="truncate font-mono text-xs text-zinc-200" :title="row.url">
                    {{ row.label }}
                  </p>
                </div>

                <!-- Pills -->
                <div class="flex shrink-0 items-center gap-1.5 flex-wrap justify-end">
                  <!-- Ping pill -->
                  <span
                    class="relay-pill"
                    :class="probeBadgeClass(row.probe.tier)"
                    :title="
                      row.probe.tier === 'checking'
                        ? 'Checking…'
                        : row.probe.ms !== null
                          ? row.probe.ms + ' ms'
                          : 'No response'
                    "
                  >
                    Ping
                    <span v-if="row.probe.ms !== null" class="opacity-70"
                      >{{ row.probe.ms }}ms</span
                    >
                    <span v-else-if="row.probe.tier === 'checking'" class="opacity-70">…</span>
                    <span v-else class="opacity-70">—</span>
                  </span>

                  <!-- Publish pill -->
                  <span
                    v-if="row.traffic"
                    class="relay-pill"
                    :class="trafficTierBadgeClass(row.traffic.tier)"
                    :title="
                      'Publish ' +
                      formatTrafficRate(row.traffic.publishSuccessRate) +
                      ' · ' +
                      row.traffic.publishOk +
                      '/' +
                      row.traffic.publishTotal
                    "
                  >
                    Pub
                    <span class="opacity-70">{{
                      formatTrafficRate(row.traffic.publishSuccessRate)
                    }}</span>
                  </span>
                  <span v-else class="relay-pill relay-pill-muted">Pub —</span>

                  <!-- Connect pill -->
                  <span
                    v-if="row.traffic?.connectTotal"
                    class="relay-pill relay-pill-muted"
                    :title="
                      'Connect ' +
                      formatTrafficRate(row.traffic.connectSuccessRate) +
                      ' · ' +
                      row.traffic.connectOk +
                      '/' +
                      row.traffic.connectTotal
                    "
                  >
                    Con
                    <span class="opacity-70">{{
                      formatTrafficRate(row.traffic.connectSuccessRate)
                    }}</span>
                  </span>
                  <span v-else class="relay-pill relay-pill-muted">Con —</span>
                </div>
              </div>
            </div>

            <div v-else class="py-8 text-center text-sm text-zinc-500">No relays configured.</div>

            <p class="text-[10px] leading-relaxed text-zinc-600">
              <span class="text-zinc-500">Probe:</span> WebSocket open time (fast &lt; 150 ms, OK
              &lt; 500 ms). <span class="text-zinc-500">Traffic:</span> real publish/connect/query
              results from the last 90 days. Send messages to populate publish stats.
            </p>
          </div>

          <!-- Servers -->
          <div class="ui-panel rounded-2xl p-4 space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-sm font-semibold">Available servers</p>
              <button
                type="button"
                :disabled="testingServers || !availableServers.length"
                class="ui-icon-button inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-50"
                @click="runServerTests"
              >
                <Search
                  :class="testingServers ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'"
                  :stroke-width="1.9"
                  aria-hidden="true"
                />
                {{ testingServers ? "Testing…" : "Test Servers" }}
              </button>
            </div>

            <div class="space-y-1">
              <div
                v-for="entry in availableServers"
                :key="entry.id"
                class="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/4"
              >
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium truncate">{{ entry.server }}</p>
                  <p class="text-[11px] text-zinc-500 truncate">{{ entry.uploadUrl }}</p>
                  <p v-if="testResults[entry.id]" class="text-[11px] text-zinc-500 mt-0.5">
                    {{
                      testResults[entry.id].status
                        ? `HTTP ${testResults[entry.id].status}`
                        : "No response"
                    }}
                    · {{ testResults[entry.id].summary }}
                  </p>
                </div>
                <span
                  class="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-zinc-400"
                  >{{ entry.type }}</span
                >
                <span
                  v-if="testResults[entry.id]"
                  class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  :class="
                    testResults[entry.id].ok
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-red-500/15 text-red-400'
                  "
                  >{{ testResults[entry.id].ok ? "OK" : "Fail" }}</span
                >
                <button
                  v-if="entry.removable"
                  type="button"
                  class="ui-icon-button shrink-0 flex h-8 w-8 rounded-xl"
                  @click="removeServer(entry.server, entry.type)"
                >
                  <X class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                </button>
              </div>
              <div v-if="!availableServers.length" class="py-5 text-sm text-zinc-500 text-center">
                No upload servers available.
              </div>
            </div>
          </div>

          <!-- Add server -->
          <div class="ui-panel rounded-2xl p-4 space-y-3">
            <p class="text-sm font-semibold">Add server</p>
            <div class="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
              <label class="space-y-1.5">
                <span class="text-[11px] text-zinc-500">Type</span>
                <select
                  v-model="draftServerType"
                  class="chat-input-modern w-full rounded-2xl px-3 py-2.5 text-sm focus:outline-none transition-colors"
                >
                  <option value="blossom">Blossom</option>
                  <option value="originless">Originless</option>
                </select>
              </label>
              <label class="space-y-1.5">
                <span class="text-[11px] text-zinc-500">Server URL</span>
                <input
                  v-model="draftServerUrl"
                  type="url"
                  placeholder="https://24242.io"
                  spellcheck="false"
                  class="chat-input-modern w-full rounded-2xl px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none transition-colors"
                />
              </label>
              <button
                type="button"
                class="ui-icon-button inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold sm:self-end"
                @click="addServer"
              >
                <Plus class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                Add
              </button>
            </div>
            <div class="ui-surface rounded-2xl px-4 py-3 text-xs leading-6 text-zinc-500">
              <p class="text-zinc-300">Recommended: run Originless yourself.</p>
              <a
                href="https://github.com/besoeasy/Originless"
                target="_blank"
                rel="noreferrer"
                class="text-zinc-400 underline decoration-white/20 underline-offset-4 transition-colors hover:text-zinc-300"
                >github.com/besoeasy/Originless</a
              >
            </div>
          </div>

          <button
            @click="resetUploadSettings"
            :disabled="saving"
            class="ui-icon-button w-full inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            <RotateCcw class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
            Reset Upload Servers
          </button> </template
        ><!-- /servers -->

        <!-- Storage tab: Cache Analytics -->
        <template v-if="activeTab === 'storage'">
          <!-- Cache Analytics -->
          <AppAlertBanner v-if="cacheError" :message="cacheError" />
          <div class="ui-panel rounded-2xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold">Cache Analytics</p>
              <p class="text-[11px] text-zinc-500">
                {{ RETENTION_DAYS }}-day · {{ formatBytes(RETENTION_MAX_BYTES) }} max
              </p>
            </div>
            <div v-if="cacheLoading" class="py-4 text-center text-zinc-500 text-xs">Loading…</div>
            <template v-else-if="summary">
              <div class="grid grid-cols-2 gap-3">
                <div class="ui-surface rounded-xl p-3">
                  <p class="text-lg font-bold">{{ summary.totalEntries.toLocaleString() }}</p>
                  <p class="mt-0.5 text-[11px] text-zinc-500">Cached entries</p>
                </div>
                <div class="ui-surface rounded-xl p-3">
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
                <div class="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
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
                  <p class="flex-1 text-xs truncate text-zinc-300">{{ store.label }}</p>
                  <p class="shrink-0 text-[11px] text-zinc-500 tabular-nums">
                    {{ store.entries.toLocaleString() }} · {{ formatBytes(store.estimatedBytes) }}
                  </p>
                </div>
              </div>
            </template>
          </div>

          <div class="ui-panel rounded-2xl border border-amber-500/20 p-4 space-y-3">
            <p class="text-sm font-semibold">Cleanup</p>
            <p class="text-[13px] leading-relaxed text-zinc-400">
              Having problems seeing messages? Click to purge local data. Your account and keys are
              kept — everything else is cleared and re-synced from relays.
            </p>
            <button
              id="settings-cleanup-btn"
              type="button"
              :disabled="cleaningUp"
              class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
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
        </template
        ><!-- /storage -->

        <!-- General tab tail: Open Source, Version (shown inside general template above) -->
        <template v-if="activeTab === 'general'">
          <!-- Open Source -->
          <div class="ui-panel rounded-2xl p-4 space-y-3">
            <p class="text-sm font-semibold">Open Source</p>
            <p class="text-[11px] text-zinc-400 leading-5">
              GUPT is free and open source. Fork the repo, build your own features, and submit a
              pull request — contributions of any size are welcome.
            </p>
            <a
              href="https://github.com/besoeasy/gupt"
              target="_blank"
              rel="noreferrer"
              class="flex items-center gap-3 rounded-xl ui-surface px-3 py-2.5 transition-colors hover:border-white/20 hover:bg-white/6"
            >
              <svg
                class="h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">github.com/besoeasy/gupt</p>
                <p class="text-[11px] text-zinc-500">Fork · Star · Contribute</p>
              </div>
              <svg
                class="h-4 w-4 shrink-0 text-zinc-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path
                  d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"
                />
              </svg>
            </a>
          </div>

          <!-- Version -->
          <p class="text-center text-xs text-zinc-600">v{{ version }}</p> </template
        ><!-- /general tail -->
      </div>
    </main>
  </div>
</template>

<style scoped>
.relay-pill-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  transition: background 0.15s;
}
.relay-pill-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.relay-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 9999px;
  padding: 0.125rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.4;
}

.relay-pill-muted {
  background: rgba(255, 255, 255, 0.08);
  color: #71717a;
}
</style>
