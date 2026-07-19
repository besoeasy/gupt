<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, RotateCcw, Search, X } from "@lucide/vue";
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
const addErrorKey = ref("");

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
  addErrorKey.value = "";
  const normalized = normalizeOriginlessServerUrl(draftServerUrl.value);
  if (!normalized) {
    addErrorKey.value = "invalid";
    return;
  }
  if (originlessServers.value.includes(normalized)) {
    addErrorKey.value = "duplicate";
    return;
  }
  originlessServers.value = [...originlessServers.value, normalized];
  persistInputs();
  draftServerUrl.value = "";
  clearTestResults();
}

function removeServer(server) {
  originlessServers.value = originlessServers.value.filter((e) => e !== server);
  persistInputs();
  clearTestResults();
}

async function runServerTests() {
  testingServers.value = true;
  try {
    const results = await testUploadServers(availableServers.value);
    testResults.value = Object.fromEntries(results.map((r) => [r.id, r]));
  } finally {
    testingServers.value = false;
  }
}

async function resetUploadSettings() {
  saving.value = true;
  try {
    saveUserOriginlessServers([]);
    loadInputs();
    clearTestResults();
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
        <p class="text-sm font-semibold">Available Servers</p>
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

      <div v-if="availableServers.length" class="space-y-1.5">
        <div
          v-for="entry in availableServers"
          :key="entry.id"
          class="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) transition-colors duration-150 hover:bg-(--app-surface-hover)"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs text-(--app-text) font-mono" :title="entry.server">
              {{ entry.server }}
            </p>
          </div>

          <span
            v-if="testResults[entry.id]"
            class="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap leading-tight tabular-nums"
            :class="
              testResults[entry.id].ok
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-red-500/15 text-red-400'
            "
          >
            <span>{{ testResults[entry.id].ok ? 'OK' : 'Fail' }}</span>
            <span class="opacity-70">
              {{ testResults[entry.id].status ? `HTTP ${testResults[entry.id].status}` : '—' }}
            </span>
            <span class="opacity-60 hidden sm:inline">{{ testResults[entry.id].summary }}</span>
          </span>

          <span
            v-else
            class="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap leading-tight bg-(--app-surface-soft) text-(--app-muted)"
          >
            {{ entry.type }}
          </span>

          <button
            v-if="entry.removable"
            type="button"
            class="inline-flex shrink-0 h-8 w-8 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            @click="removeServer(entry.server)"
          >
            <X class="h-3.5 w-3.5" :stroke-width="2" />
          </button>
        </div>
      </div>

      <div v-else class="py-8 text-center text-sm text-zinc-500">
        No upload servers available.
      </div>
    </div>

    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
    >
      <p class="text-sm font-semibold">Add Server</p>
      <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label class="space-y-1.5">
          <span class="text-[11px] text-zinc-500">Originless Server URL</span>
          <input
            v-model="draftServerUrl"
            type="url"
            placeholder="https://originless.gupt.app"
            spellcheck="false"
            class="w-full rounded-2xl px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60,transparent)] transition-colors border border-(--app-border) bg-(--app-surface-soft) text-(--app-text) focus:border-[color-mix(in_srgb,var(--app-primary)_62,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80,var(--app-primary-soft))]"
            @keydown.enter="addServer"
          />
          <p v-if="addErrorKey === 'invalid'" class="text-[11px] text-red-400">
            Enter a valid http or https URL.
          </p>
          <p v-else-if="addErrorKey === 'duplicate'" class="text-[11px] text-red-400">
            This server is already in the list.
          </p>
        </label>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold sm:self-end border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          @click="addServer"
        >
          <Plus class="h-3.5 w-3.5" :stroke-width="2" />
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
        >github.com/besoeasy/Originless</a>
      </div>
    </div>

    <button
      @click="resetUploadSettings"
      :disabled="saving"
      class="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold disabled:opacity-50 border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
    >
      <RotateCcw class="h-4 w-4" :stroke-width="1.9" />
      Reset Upload Servers
    </button>
  </div>
</template>