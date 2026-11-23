<script setup>
import { computed, onMounted, ref } from "vue";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { getCacheSummary } from "@/lib/idb";

const cache = ref(null);
const quota = ref(null);
const error = ref("");

const STORE_TONES = {
  mediaCache: "info",
  roomMeta: "accent",
  groups: "danger",
  rawEvents: "success",
  engineBlobs: "warning",
};

function storeTone(table) {
  return STORE_TONES[table] || "muted";
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

const sortedStores = computed(() =>
  [...(cache.value?.stores || [])].sort((a, b) => b.estimatedBytes - a.estimatedBytes),
);

const quotaPercent = computed(() => {
  const total = Number(quota.value?.quota) || 0;
  if (!total) return null;
  return Math.min(100, ((Number(quota.value?.usage) || 0) / total) * 100);
});

async function load() {
  error.value = "";
  try {
    cache.value = await getCacheSummary();
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      quota.value = await navigator.storage.estimate().catch(() => null);
    }
  } catch (err) {
    error.value = err?.message || "Unable to read the cache summary.";
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <section class="cache-panel" aria-labelledby="settings-cache">
    <AppAlertBanner v-if="error" :message="error" />

    <div class="cache-panel__head">
      <p id="settings-cache" class="cache-panel__label">Cache on this device</p>
      <p v-if="cache" class="cache-panel__meta">
        {{ cache.totalEntries.toLocaleString() }} entries ·
        {{ formatBytes(cache.totalEstimatedBytes) }}
      </p>
    </div>

    <template v-if="cache">
      <div v-if="quotaPercent !== null" class="cache-panel__usage">
        <div class="cache-panel__track" aria-hidden="true">
          <div class="cache-panel__fill" :style="{ width: `${quotaPercent}%` }" />
        </div>
        <p class="cache-panel__hint">
          {{ quotaPercent.toFixed(1) }}% of browser storage · {{ formatBytes(quota.quota) }}
          available
        </p>
      </div>

      <ul class="cache-panel__stores">
        <li v-for="store in sortedStores" :key="store.table" class="cache-panel__store">
          <span
            class="cache-panel__dot"
            :class="`cache-panel__dot--${storeTone(store.table)}`"
            aria-hidden="true"
          />
          <span class="cache-panel__store-name">{{ store.label }}</span>
          <span class="cache-panel__store-value">
            {{ store.entries.toLocaleString() }} · {{ formatBytes(store.estimatedBytes) }}
          </span>
        </li>
      </ul>

      <p class="cache-panel__hint">
        Relays keep your events for their retention window; this device only mirrors them.
      </p>
    </template>
    <p v-else class="cache-panel__hint">Reading the cache…</p>
  </section>
</template>

<style scoped>
@layer base, gupt-components;

.cache-panel {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
  min-width: 0;
  padding-top: calc(var(--spacing) * 4);
  border-top: 1px solid var(--app-border-faint);
}

.cache-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing);
}

.cache-panel__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.cache-panel__meta {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted-2);
}

.cache-panel__usage {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cache-panel__track {
  height: 6px;
  border-radius: 999px;
  background-color: var(--app-surface-inset);
  overflow: hidden;
}

.cache-panel__fill {
  height: 100%;
  border-radius: inherit;
  background-color: var(--app-primary);
  transition: width var(--app-dur-slow) var(--app-ease-standard);
}

.cache-panel__stores {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cache-panel__store {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  min-height: 36px;
  padding-inline: var(--spacing);
  border-radius: var(--app-radius-sm);
  min-width: 0;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.cache-panel__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.cache-panel__dot--info {
  background-color: var(--app-info);
}

.cache-panel__dot--accent {
  background-color: var(--app-accent-share);
}

.cache-panel__dot--danger {
  background-color: var(--app-danger);
}

.cache-panel__dot--success {
  background-color: var(--app-success);
}

.cache-panel__dot--warning {
  background-color: var(--app-warning);
}

.cache-panel__dot--muted {
  background-color: var(--app-muted);
}

.cache-panel__store-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--app-text-soft);
}

.cache-panel__store-value {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted);
}

.cache-panel__hint {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.6;
  color: var(--app-muted);
}

@media (hover: hover) {
  .cache-panel__store:hover {
    background-color: var(--app-surface-hover);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cache-panel__fill {
    transition: none;
  }
}
</style>
