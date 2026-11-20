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
      <span class="settings-privacy-panel__text">{{ cacheLabel }}</span>
      <button
        type="button"
        class="settings-privacy-panel__button"
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
      <span class="settings-privacy-panel__text-days"
        >{{ RETENTION_DAYS }} days</span
      >
    </SettingsRow>

    <p v-if="message" class="settings-privacy-panel__status" role="status">
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

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@media (hover:hover) {
.settings-privacy-panel__button:hover {
  background-color: var(--app-danger-soft);
}
}

@media (hover:hover) {

}

@media (hover:hover) {
.settings-privacy-panel__button:hover {
  color: var(--color-red-300);
}
}

@media (min-width:40rem) {
.settings-privacy-panel__button {
  min-height: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.settings-privacy-panel__button {
  display: inline-flex;
}
.settings-privacy-panel__button {
  min-height: calc(var(--spacing) * 11);
}
.settings-privacy-panel__button {
  cursor: pointer;
}
.settings-privacy-panel__button {
  align-items: center;
}
.settings-privacy-panel__button {
  border-radius: var(--radius-lg);
}
.settings-privacy-panel__status {
  padding-inline: var(--spacing);
}
.settings-privacy-panel__button {
  padding-inline: calc(var(--spacing) * 2);
}
.settings-privacy-panel__status {
  padding-top: calc(var(--spacing) * 3);
}
.settings-privacy-panel__text {
  font-family: var(--font-mono);
}
.settings-privacy-panel__text-days {
  font-family: var(--font-mono);
}
.settings-privacy-panel__text {
  font-size: 11px;
}
.settings-privacy-panel__button {
  font-size: 11px;
}
.settings-privacy-panel__text-days {
  font-size: 11px;
}
.settings-privacy-panel__status {
  font-size: 11px;
}
.settings-privacy-panel__status {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.settings-privacy-panel__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-privacy-panel__button {
  color: var(--color-red-400);
}
.settings-privacy-panel__text {
  color: var(--ui-zinc-300);
}
.settings-privacy-panel__text-days {
  color: var(--ui-zinc-300);
}
.settings-privacy-panel__status {
  color: var(--ui-zinc-500);
}
.settings-privacy-panel__text {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.settings-privacy-panel__text-days {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.settings-privacy-panel__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-privacy-panel__button:active {
  scale: .98;
}
.settings-privacy-panel__button:disabled {
  opacity: .4;
}
[data-theme="light"] .settings-privacy-panel__button {
  color: var(--app-danger);
}
[data-theme="light"] .settings-privacy-panel__text {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-privacy-panel__text-days {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-privacy-panel__status {
  color: var(--app-muted);
}
}
}
</style>
