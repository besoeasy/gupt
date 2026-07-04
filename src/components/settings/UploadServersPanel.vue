<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, RotateCcw, Search, X } from "lucide-vue-next";
import {
  buildOriginlessUploadUrl,
  DEFAULT_ORIGINLESS_SERVERS,
  normalizeOriginlessServerUrl,
  readUserOriginlessServers,
  saveUserOriginlessServers,
} from "@/config/servers";
import { testUploadServers } from "@/lib/upload";

const emit = defineEmits(["message", "error"]);

const originlessServers = ref([]);
const draftServerUrl = ref("");
const saving = ref(false);
const testingServers = ref(false);
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

const envOriginlessServers = splitCsv(import.meta.env.VITE_UPLOAD_URL)
  .map(normalizeOriginlessServerUrl)
  .filter(Boolean);

const effectiveOriginlessServers = computed(() =>
  dedupe([...originlessServers.value, ...envOriginlessServers, ...DEFAULT_ORIGINLESS_SERVERS]),
);

const availableServers = computed(() => {
  const originlessCustom = new Set(originlessServers.value);
  return [
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
  originlessServers.value = readUserOriginlessServers();
}

function clearTestResults() {
  testResults.value = {};
}

function persistInputs() {
  originlessServers.value = saveUserOriginlessServers(originlessServers.value);
}

function addServer() {
  const normalized = normalizeOriginlessServerUrl(draftServerUrl.value);
  if (!normalized) {
    emit("error", "Enter a valid http or https server URL.");
    emit("message", "");
    return;
  }
  if (originlessServers.value.includes(normalized)) {
    emit("error", "Originless server already added.");
    emit("message", "");
    return;
  }
  originlessServers.value = [...originlessServers.value, normalized];
  persistInputs();
  draftServerUrl.value = "";
  emit("message", "Originless server added and saved.");
  emit("error", "");
  clearTestResults();
}

function removeServer(server) {
  originlessServers.value = originlessServers.value.filter((e) => e !== server);
  persistInputs();
  emit("message", "Server removed and saved.");
  emit("error", "");
  clearTestResults();
}

async function runServerTests() {
  testingServers.value = true;
  emit("message", "");
  emit("error", "");
  try {
    const results = await testUploadServers(availableServers.value);
    testResults.value = Object.fromEntries(results.map((r) => [r.id, r]));
    const passing = results.filter((r) => r.ok).length;
    emit(
      "message",
      passing === results.length
        ? "All servers responded."
        : `${passing} of ${results.length} servers responded.`,
    );
  } catch (testError) {
    emit("error", testError?.message || "Unable to test servers.");
  } finally {
    testingServers.value = false;
  }
}

async function resetUploadSettings() {
  saving.value = true;
  emit("message", "");
  emit("error", "");
  try {
    saveUserOriginlessServers([]);
    loadInputs();
    clearTestResults();
    emit("message", "Upload servers reset to defaults.");
  } catch (resetError) {
    emit("error", resetError?.message || "Unable to reset upload servers.");
  } finally {
    saving.value = false;
  }
}

onMounted(loadInputs);
</script>

<template>
  <div class="space-y-4">
    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-4"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-sm font-semibold">Available servers</p>
        <button
          type="button"
          :disabled="testingServers || !availableServers.length"
          class="inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-50 border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
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
          class="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-(--app-surface-hover)"
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
            class="inline-flex shrink-0 h-8 w-8 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            @click="removeServer(entry.server)"
          >
            <X class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
        <div v-if="!availableServers.length" class="py-5 text-sm text-zinc-500 text-center">
          No upload servers available.
        </div>
      </div>
    </div>

    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
    >
      <p class="text-sm font-semibold">Add server</p>
      <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label class="space-y-1.5">
          <span class="text-[11px] text-zinc-500">Originless Server URL</span>
          <input
            v-model="draftServerUrl"
            type="url"
            placeholder="https://originless.gupt.app"
            spellcheck="false"
            class="w-full rounded-2xl px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] transition-colors border border-(--app-border) bg-(--app-surface-soft) text-(--app-text) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))]"
          />
        </label>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold sm:self-end border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          @click="addServer"
        >
          <Plus class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
          Add
        </button>
      </div>
      <div
        class="border border-(--app-border) bg-(--app-surface-soft) rounded-2xl px-4 py-3 text-xs leading-6 text-zinc-500"
      >
        <p class="text-(--app-text-soft)">Recommended: run Originless yourself.</p>
        <a
          href="https://github.com/besoeasy/Originless"
          target="_blank"
          rel="noreferrer"
          class="text-(--app-muted) underline decoration-(--app-border) underline-offset-4 transition-colors hover:text-(--app-text-soft)"
          >github.com/besoeasy/Originless</a
        >
      </div>
    </div>

    <button
      @click="resetUploadSettings"
      :disabled="saving"
      class="w-full inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50 border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
    >
      <RotateCcw class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
      Reset Upload Servers
    </button>
  </div>
</template>
