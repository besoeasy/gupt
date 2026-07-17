<script setup>
import { ref, onMounted } from "vue";
import { Plus, X, Server, Loader2 } from "@lucide/vue";
import { getCustomRelays, addCustomRelay, removeCustomRelay } from "@/lib/relay";

const customRelays = ref([]);
const newRelayUrl = ref("");
const adding = ref(false);
const error = ref("");

function load() {
  customRelays.value = getCustomRelays();
}

onMounted(load);

async function handleAdd() {
  const url = newRelayUrl.value.trim();
  if (!url) return;

  error.value = "";
  adding.value = true;
  try {
    const result = addCustomRelay(url);
    if (!result) {
      error.value = "Invalid or duplicate relay URL.";
      return;
    }
    newRelayUrl.value = "";
    load();
  } finally {
    adding.value = false;
  }
}

function handleRemove(url) {
  removeCustomRelay(url);
  load();
}
</script>

<template>
  <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) overflow-hidden">
    <!-- Header -->
    <div class="flex items-center gap-1.5 px-4 py-2.5 border-b border-(--app-border)">
      <Server class="h-3.5 w-3.5 text-(--app-primary) shrink-0" :stroke-width="2" />
      <p class="text-xs font-semibold text-(--app-text)">Custom Relays</p>
      <span
        v-if="customRelays.length"
        class="ml-1 rounded-full bg-(--app-primary)/15 px-1.5 py-px text-[9px] font-bold text-(--app-primary)"
        >{{ customRelays.length }}</span
      >
    </div>

    <!-- Add form -->
    <div class="flex items-center gap-2 px-4 py-3 border-b border-(--app-border)">
      <input
        v-model="newRelayUrl"
        type="url"
        placeholder="wss://relay.example.com"
        class="flex-1 rounded-xl border border-(--app-border) bg-(--app-bg) px-3 py-1.5 text-xs text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none focus:ring-1 focus:ring-(--app-primary)/30"
        @keydown.enter="handleAdd"
      />
      <button
        @click="handleAdd"
        :disabled="!newRelayUrl.trim() || adding"
        class="inline-flex h-7 items-center gap-1 rounded-xl bg-(--app-primary)/15 px-3 text-xs font-medium text-(--app-primary) transition-colors hover:bg-(--app-primary)/25 disabled:opacity-40"
      >
        <Loader2 v-if="adding" class="h-3 w-3 animate-spin" :stroke-width="2" />
        <Plus v-else class="h-3 w-3" :stroke-width="2" />
        Add
      </button>
    </div>

    <p v-if="error" class="px-4 pt-2 text-[11px] text-red-400">{{ error }}</p>

    <!-- Relay list -->
    <div v-if="customRelays.length" class="divide-y divide-(--app-border)">
      <div
        v-for="relay in customRelays"
        :key="relay"
        class="flex items-center justify-between gap-3 px-4 py-2.5"
      >
        <span class="min-w-0 truncate text-xs text-(--app-text-soft) font-mono">{{ relay }}</span>
        <button
          @click="handleRemove(relay)"
          class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-(--app-muted) hover:bg-red-500/15 hover:text-red-400 transition-colors"
          title="Remove relay"
        >
          <X class="h-3 w-3" :stroke-width="2" />
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="px-4 py-5 text-center">
      <p class="text-[11px] text-(--app-muted)">
        No custom relays added. These are merged with the default relay set and used for all
        operations.
      </p>
    </div>
  </div>
</template>
