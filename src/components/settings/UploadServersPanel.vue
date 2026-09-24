<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, X, Server, AlertTriangle, ExternalLink, RotateCcw } from "@lucide/vue";
import {
  normalizeOriginlessServerUrl,
  readConfiguredOriginlessServers,
  saveConfiguredOriginlessServers,
  DEFAULT_ORIGINLESS_SERVERS,
} from "@/config/servers";

const originlessServers = ref([]);
const draftServerUrl = ref("");
const saving = ref(false);
const addErrorKey = ref("");

const totalConfiguredCount = computed(() => originlessServers.value.length);

function load() {
  originlessServers.value = readConfiguredOriginlessServers();
}

function persistInputs() {
  originlessServers.value = saveConfiguredOriginlessServers(originlessServers.value);
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
}

function removeServer(server) {
  originlessServers.value = originlessServers.value.filter((e) => e !== server);
  persistInputs();
}

function resetToDefaults() {
  originlessServers.value = saveConfiguredOriginlessServers(DEFAULT_ORIGINLESS_SERVERS);
}

onMounted(load);
</script>

<template>
  <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5 space-y-4 shadow-xs">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 min-w-0">
        <Server class="h-4 w-4 text-zinc-400 shrink-0" :stroke-width="1.9" />
        <p class="text-sm font-semibold tracking-tight text-white truncate">Originless Servers</p>
        <span
          v-if="originlessServers.length"
          class="ml-1 rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400 tabular-nums"
          >{{ originlessServers.length }}</span
        >
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer tabular-nums"
        title="Reset to default servers"
        @click="resetToDefaults"
      >
        <RotateCcw class="h-3 w-3" :stroke-width="2" />
        Reset
      </button>
    </div>

    <!-- Single Server Redundancy Warning -->
    <div
      v-if="totalConfiguredCount < 2"
      class="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs"
    >
      <AlertTriangle class="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" :stroke-width="2" />
      <div class="min-w-0 space-y-1">
        <p class="font-semibold tracking-tight text-zinc-200">Single originless server</p>
        <p class="text-zinc-500 leading-relaxed">
          Only 1 server configured. Add another for redundancy — ideally one you run yourself.
        </p>
        <a
          href="https://github.com/besoeasy/Originless"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 font-medium text-zinc-200 hover:text-white hover:underline underline-offset-2"
        >
          <span>Originless setup on GitHub</span>
          <ExternalLink class="h-3 w-3 shrink-0" :stroke-width="2" />
        </a>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label class="space-y-1.5">
        <span class="text-[11px] text-zinc-500">Originless Server URL</span>
        <input
          v-model="draftServerUrl"
          type="url"
          placeholder="https://originless.gupt.app"
          spellcheck="false"
          class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600/40"
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
        :disabled="!draftServerUrl.trim() || saving"
        class="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer sm:self-end"
        @click="addServer"
      >
        <Plus class="h-3.5 w-3.5" :stroke-width="2" />
        Add
      </button>
    </div>

    <div v-if="originlessServers.length" class="space-y-1.5">
      <div
        v-for="server in originlessServers"
        :key="server"
        class="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-zinc-800/80 bg-zinc-950/40 transition-colors duration-150 hover:border-zinc-700 hover:bg-zinc-900/40"
      >
        <span
          class="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300 tracking-tight"
          :title="server"
        >
          {{ server }}
        </span>
        <button
          type="button"
          class="inline-flex shrink-0 h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
          @click="removeServer(server)"
        >
          <X class="h-3.5 w-3.5" :stroke-width="2" />
        </button>
      </div>
    </div>

    <div v-else class="py-8 text-center text-sm text-zinc-500">
      No originless servers configured.
    </div>
  </div>
</template>
