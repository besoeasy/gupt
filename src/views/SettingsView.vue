<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, RotateCcw, Search, X } from "lucide-vue-next";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
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

onMounted(() => {
  loadInputs();
});
</script>

<template>
  <div class="min-h-screen bg-black text-white">
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

      <!-- Servers -->
      <div class="rounded-2xl bg-white/[0.04] p-4 space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm font-semibold">Available servers</p>
          <button
            type="button"
            :disabled="testingServers || !availableServers.length"
            class="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white/8 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/14 hover:text-white disabled:opacity-50"
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
            class="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.04]"
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
            <span class="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-zinc-400">{{
              entry.type
            }}</span>
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
              class="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/8 hover:text-white"
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
      <div class="rounded-2xl bg-white/[0.04] p-4 space-y-3">
        <p class="text-sm font-semibold">Add server</p>
        <div class="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
          <label class="space-y-1.5">
            <span class="text-[11px] text-zinc-500">Type</span>
            <select
              v-model="draftServerType"
              class="w-full rounded-full bg-white/8 px-3 py-2.5 text-sm focus:outline-none focus:bg-white/12 transition-colors"
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
              class="w-full rounded-full bg-white/8 px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:bg-white/12 transition-colors"
            />
          </label>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-full bg-white/8 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/14 hover:text-white sm:self-end"
            @click="addServer"
          >
            <Plus class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
            Add
          </button>
        </div>
        <div class="rounded-2xl bg-white/[0.04] px-4 py-3 text-xs leading-6 text-zinc-500">
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
        class="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-50"
      >
        <RotateCcw class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
        Reset Upload Servers
      </button>
      </div>
    </main>
  </div>
</template>
