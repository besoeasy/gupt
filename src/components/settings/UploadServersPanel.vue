<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, X, Server, Loader2 } from "@lucide/vue";
import {
  normalizeOriginlessServerUrl,
  readUserOriginlessServers,
  saveUserOriginlessServers,
} from "@/config/servers";

const originlessServers = ref([]);
const draftServerUrl = ref("");
const saving = ref(false);
const addErrorKey = ref("");

function load() {
  originlessServers.value = readUserOriginlessServers();
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
}

function removeServer(server) {
  originlessServers.value = originlessServers.value.filter((e) => e !== server);
  persistInputs();
}

onMounted(load);
</script>

<template>
  <div
    class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-4"
  >
    <div class="flex items-center gap-2">
      <Server class="h-4 w-4 text-(--app-primary) shrink-0" :stroke-width="1.9" />
      <p class="text-sm font-semibold">Custom Originless</p>
      <span
        v-if="originlessServers.length"
        class="ml-1 rounded-full bg-(--app-primary)/15 px-1.5 py-px text-[10px] font-bold text-(--app-primary)"
        >{{ originlessServers.length }}</span
      >
    </div>

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
        :disabled="!draftServerUrl.trim() || saving"
        class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold sm:self-end border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-40"
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
        class="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) transition-colors duration-150 hover:bg-(--app-surface-hover)"
      >
        <span
          class="min-w-0 flex-1 truncate font-mono text-xs text-(--app-text-soft)"
          :title="server"
        >
          {{ server }}
        </span>
        <button
          type="button"
          class="inline-flex shrink-0 h-8 w-8 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          @click="removeServer(server)"
        >
          <X class="h-3.5 w-3.5" :stroke-width="2" />
        </button>
      </div>
    </div>

    <div v-else class="py-8 text-center text-sm text-zinc-500">
      No custom originless servers added.
    </div>
  </div>
</template>
