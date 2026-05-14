<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, RotateCcw, Search, X } from "lucide-vue-next";
import packageMeta from "../../package.json";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useSettingsStore } from "@/stores/settings";
import { RETENTION_DAYS, RETENTION_MAX_BYTES } from "@/config/retention";
import { getCacheSummary } from "@/lib/idb";

const settingsStore = useSettingsStore();
const version = packageMeta.version;

function onToggleSound(event) {
  settingsStore.soundEnabled = event.target.checked;
}

async function onToggleAutostart(event) {
  await settingsStore.setAutostartEnabled(event.target.checked);
}
import {
  buildOriginlessUploadUrl,
  DEFAULT_BLOSSOM_SERVERS,
  DEFAULT_ORIGINLESS_SERVERS,
  normalizeOriginlessServerUrl,
  readUserBlossomServers,
  readUserOriginlessServers,
  saveUserBlossomServers,
  saveUserOriginlessServers,
} from "@/config/servers";
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

onMounted(() => {
  loadInputs();
  void settingsStore.hydrateAutostart();
  void refreshCache();
});
</script>

<template>
  <div class="min-h-screen text-white">
    <main class="app-page-shell mx-auto px-4 py-6 lg:px-8">
      <div class="max-w-2xl mx-auto space-y-5">
        <!-- Header -->
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Settings</h1>
          <p class="mt-1 text-sm text-zinc-500">
            Manage encrypted upload servers for E2E-encrypted attachments.
          </p>
        </div>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <!-- Notifications -->
        <div class="ui-panel rounded-2xl p-4 space-y-3">
          <p class="text-sm font-semibold">Notifications</p>

          <label class="flex items-center justify-between gap-4 cursor-pointer">
            <span class="min-w-0 flex-1">
              <span class="block text-sm">Message sound</span>
              <span class="block text-[11px] text-zinc-500">
                Play a soft ping on incoming messages.
              </span>
            </span>
            <input
              type="checkbox"
              class="h-4 w-4 shrink-0 accent-white"
              :checked="settingsStore.soundEnabled"
              @change="onToggleSound"
            />
          </label>

          <label
            v-if="settingsStore.autostartSupported"
            class="flex items-center justify-between gap-4 cursor-pointer"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm">Start at login</span>
              <span class="block text-[11px] text-zinc-500">
                Launch GUPT in the background when you sign in — keeps notifications live.
              </span>
            </span>
            <input
              type="checkbox"
              class="h-4 w-4 shrink-0 accent-white"
              :checked="settingsStore.autostartEnabled"
              @change="onToggleAutostart"
            />
          </label>
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
              class="text-zinc-400 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white"
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
        </button>

        <!-- Cache Analytics -->
        <AppAlertBanner v-if="cacheError" :message="cacheError" />
        <div class="ui-panel rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold">Cache Analytics</p>
            <p class="text-[11px] text-zinc-500">{{ RETENTION_DAYS }}-day · {{ formatBytes(RETENTION_MAX_BYTES) }} max</p>
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
                <span>{{ formatBytes(summary.totalEstimatedBytes) }} / {{ formatBytes(RETENTION_MAX_BYTES) }}</span>
              </div>
              <div class="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
                <div class="h-full rounded-full bg-emerald-500 transition-all duration-500" :style="{ width: storageUsedPct + '%' }" />
              </div>
            </div>
            <div class="space-y-0.5">
              <div v-for="store in sortedStores" :key="store.table" class="flex items-center gap-3 rounded-xl px-2 py-1.5">
                <span class="inline-block h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: storeColor(store.table) }" />
                <p class="flex-1 text-xs truncate text-zinc-300">{{ store.label }}</p>
                <p class="shrink-0 text-[11px] text-zinc-500 tabular-nums">{{ store.entries.toLocaleString() }} · {{ formatBytes(store.estimatedBytes) }}</p>
              </div>
            </div>
          </template>
        </div>

        <!-- Open Source -->
        <div class="ui-panel rounded-2xl p-4 space-y-3">
          <p class="text-sm font-semibold">Open Source</p>
          <p class="text-[11px] text-zinc-400 leading-5">
            GUPT is free and open source. Fork the repo, build your own features, and submit a pull request — contributions of any size are welcome.
          </p>
          <a
            href="https://github.com/besoeasy/gupt"
            target="_blank"
            rel="noreferrer"
            class="flex items-center gap-3 rounded-xl ui-surface px-3 py-2.5 transition-colors hover:border-white/20 hover:bg-white/6"
          >
            <svg class="h-5 w-5 shrink-0 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">github.com/besoeasy/gupt</p>
              <p class="text-[11px] text-zinc-500">Fork · Star · Contribute</p>
            </div>
            <svg class="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </a>
        </div>

        <!-- Version -->
        <p class="text-center text-xs text-zinc-600">v{{ version }}</p>
      </div>
    </main>
  </div>
</template>
