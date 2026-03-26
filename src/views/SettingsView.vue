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
  if (type === "Blossom") {
    blossomServers.value = blossomServers.value.filter((entry) => entry !== server);
  } else {
    originlessServers.value = originlessServers.value.filter((entry) => entry !== server);
  }
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
    testResults.value = Object.fromEntries(results.map((result) => [result.id, result]));

    const passing = results.filter((result) => result.ok).length;
    message.value =
      passing === results.length
        ? "All servers responded."
        : `${passing} of ${results.length} servers responded.`;
    // score tracking removed
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
    // score tracking removed
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
  // score tracking removed
});
</script>

<template>
  <div class="min-h-screen bg-black text-white flex flex-col">
    <main class="app-page-shell mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <section class="app-card space-y-3 lg:col-span-2">
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Settings</p>
        <h1 class="text-2xl font-bold tracking-tight">Privacy & Transport</h1>
        <p class="max-w-2xl text-sm leading-relaxed text-zinc-400">
          Manage encrypted upload servers for E2E-encrypted attachments.
        </p>
      </section>

      <div class="lg:col-span-2 space-y-4" v-if="message || error">
        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />
      </div>

      <section class="app-card space-y-4 lg:col-span-2">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-white">Available servers</p>
            <p class="mt-1 text-xs text-zinc-500">
              Hover a row to inspect each server and its current score.
            </p>
          </div>

          <button
            type="button"
            :disabled="testingServers || !availableServers.length"
            class="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/4 px-3 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            @click="runServerTests"
          >
            <Search
              :class="testingServers ? 'h-4 w-4 animate-spin' : 'h-4 w-4'"
              :stroke-width="1.9"
              aria-hidden="true"
            />
            {{ testingServers ? "Testing…" : "Test Servers" }}
          </button>
        </div>

        <div class="overflow-hidden rounded-2xl border border-white/8 bg-black/30">
          <div v-if="availableServers.length" class="overflow-x-auto">
            <table class="min-w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr class="bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <th class="px-4 py-3 font-medium">Server</th>
                  <th class="px-3 py-3 font-medium">Type</th>

                  <th class="px-3 py-3 font-medium">Test</th>
                  <th class="px-3 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                <tr
                  v-for="entry in availableServers"
                  :key="entry.id"
                  class="group border-t border-white/6 transition-all duration-200 hover:-translate-y-[1px] hover:bg-white/[0.035] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_28px_rgba(0,0,0,0.18)]"
                >
                  <td class="px-4 py-3 align-top">
                    <div class="min-w-[220px] space-y-1">
                      <p class="max-w-[26rem] truncate text-sm font-medium text-zinc-100">
                        {{ entry.server }}
                      </p>
                      <p class="max-w-[30rem] truncate text-[11px] text-zinc-600">
                        {{ entry.uploadUrl }}
                      </p>
                      <p v-if="testResults[entry.id]" class="text-[11px] text-zinc-500">
                        {{
                          testResults[entry.id].status
                            ? `HTTP ${testResults[entry.id].status}`
                            : "No HTTP response"
                        }}
                        · {{ testResults[entry.id].summary }}
                      </p>
                      <p
                        v-if="testResults[entry.id]?.returnedUrl"
                        class="max-w-[30rem] break-all text-[11px] text-emerald-300"
                      >
                        URL: {{ testResults[entry.id].returnedUrl }}
                      </p>
                    </div>
                  </td>

                  <td class="px-3 py-3 align-top">
                    <span
                      class="rounded-full border border-white/8 px-2 py-1 text-[11px] text-zinc-200"
                    >
                      {{ entry.type }}
                    </span>
                  </td>

                  <td class="px-3 py-3 align-top">
                    <span
                      v-if="testResults[entry.id]"
                      :class="
                        testResults[entry.id].ok
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-red-500/30 bg-red-500/10 text-red-300'
                      "
                      class="rounded-full border px-2 py-1 text-[11px] font-semibold"
                    >
                      {{ testResults[entry.id].ok ? "OK" : "Fail" }}
                    </span>
                    <span v-else class="text-[11px] text-zinc-600">Not tested</span>
                  </td>

                  <td class="px-3 py-3 align-top text-right">
                    <button
                      v-if="entry.removable"
                      type="button"
                      class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-zinc-500 transition-all duration-200 group-hover:border-white/20 group-hover:text-white hover:bg-white/6"
                      @click="removeServer(entry.server, entry.type)"
                    >
                      <X class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
                    </button>
                    <span v-else class="text-[11px] text-zinc-700">Locked</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="px-4 py-5 text-sm text-zinc-500">No upload servers available.</div>
        </div>
      </section>

      <section class="app-card space-y-4 lg:col-span-1 flex flex-col h-full justify-between">
        <div class="space-y-4">
          <div>
            <p class="text-sm font-semibold text-white">Add server</p>
            <p class="mt-1 text-xs text-zinc-500">Choose the type, then paste the base URL.</p>
          </div>

          <div class="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
            <label class="space-y-1">
              <span class="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Type</span>
              <select
                v-model="draftServerType"
                class="w-full rounded-2xl border border-white/8 bg-zinc-900 px-3 py-3 text-sm text-white focus:outline-none focus:border-white/20"
              >
                <option value="blossom">Blossom</option>
                <option value="originless">Originless</option>
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Server URL</span>
              <input
                v-model="draftServerUrl"
                type="url"
                placeholder="https://24242.io"
                spellcheck="false"
                class="w-full rounded-2xl border border-white/8 bg-zinc-900 px-3 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/20"
              />
            </label>

            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/8 hover:text-white sm:self-end"
              @click="addServer"
            >
              <Plus class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
              Add
            </button>
          </div>
        </div>

        <div
          class="rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-xs leading-6 text-zinc-400 mt-4"
        >
          <p class="text-white">Recommended: run Originless yourself.</p>
          <p>If you want a stable private fallback, self-host Originless and add that URL here.</p>
          <a
            href="https://github.com/besoeasy/Originless"
            target="_blank"
            rel="noreferrer"
            class="text-zinc-200 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white"
          >
            https://github.com/besoeasy/Originless
          </a>
        </div>
      </section>

      <div class="lg:col-span-1 flex flex-col justify-end space-y-4 h-full">
        <button
          @click="resetUploadSettings"
          :disabled="saving"
          class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm font-semibold text-zinc-300 transition-all duration-150 hover:border-white/20 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
          Reset Upload Servers
        </button>

        <RouterLink
          to="/stats"
          class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm font-semibold text-zinc-300 transition-all duration-150 hover:border-white/20 hover:bg-white/8 hover:text-white"
        >
          View Cache Stats →
        </RouterLink>
      </div>
    </main>
  </div>
</template>
