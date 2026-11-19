<script setup>
import { computed, onMounted, ref } from "vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import { RETENTION_DAYS } from "@/config/retention";
import { formatBytes } from "@/lib/chatUtils";
import { clearMediaCache, getCacheSummary } from "@/lib/idb";

const RETAINED_TABLES = new Set(["mediaCache", "engineBlobs"]);

const cacheBytes = ref(0);
const cacheEntries = ref(0);
const loading = ref(true);
const clearing = ref(false);
const confirmOpen = ref(false);
const message = ref("");

const cacheLabel = computed(() => (loading.value ? "…" : formatBytes(cacheBytes.value)));
const cacheSub = computed(() => {
  if (loading.value) return "Reading cache size.";
  if (!cacheEntries.value) return "Nothing cached yet.";
  return `${cacheEntries.value.toLocaleString()} cached files · safe to clear`;
});

async function load() {
  try {
    const summary = await getCacheSummary();
    const stores = (summary?.stores || []).filter((store) => RETAINED_TABLES.has(store.table));
    cacheBytes.value = stores.reduce((sum, store) => sum + Number(store.estimatedBytes || 0), 0);
    cacheEntries.value = stores.reduce((sum, store) => sum + Number(store.entries || 0), 0);
  } catch {
    cacheBytes.value = 0;
    cacheEntries.value = 0;
  } finally {
    loading.value = false;
  }
}

async function handleClear() {
  confirmOpen.value = false;
  clearing.value = true;
  message.value = "";
  try {
    await clearMediaCache();
    await load();
    message.value = "Cached media cleared. Relays still hold your messages.";
  } catch {
    message.value = "Could not clear the cache. Try again.";
  } finally {
    clearing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <SettingsRow title="Cached media" :description="cacheSub">
      <span class="font-mono text-[11px] text-zinc-300 tabular-nums">{{ cacheLabel }}</span>
      <button
        type="button"
        class="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 active:scale-[0.98] disabled:opacity-40 sm:min-h-8"
        :disabled="clearing || loading || !cacheEntries"
        @click="confirmOpen = true"
      >
        {{ clearing ? "Clearing…" : "Clear" }}
      </button>
    </SettingsRow>

    <SettingsRow
      title="Message history on relays"
      description="Relays keep events for this long; this device only mirrors them."
    >
      <span class="font-mono text-[11px] text-zinc-300 tabular-nums"
        >{{ RETENTION_DAYS }} days</span
      >
    </SettingsRow>

    <p v-if="message" class="px-1 pt-3 text-[11px] leading-relaxed text-zinc-500" role="status">
      {{ message }}
    </p>

    <AppConfirmDialog
      :open="confirmOpen"
      title="Clear cached media?"
      message="Downloaded images and file blobs are removed from this device. Messages, rooms, and relays stay as they are, and media downloads again when you open it."
      confirm-label="Clear media"
      @confirm="handleClear"
      @cancel="confirmOpen = false"
    />
  </div>
</template>
