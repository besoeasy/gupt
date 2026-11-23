<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { getCacheSummary, getRelayHealthSummary } from "@/lib/idb";
import { tierBadgeClass, tierDotClass } from "@/lib/relay";

const loading = ref(true);
const error = ref("");
const relayHealth = ref([]);
const cache = ref(null);
const quota = ref(null);

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

function formatRate(rate) {
  return rate === null || rate === undefined ? "—" : `${rate}%`;
}

function rateTone(rate) {
  if (rate === null || rate === undefined) return "muted";
  if (rate >= 80) return "good";
  if (rate >= 50) return "fair";
  return "poor";
}

function tierLabel(tier) {
  if (tier === "offline") return "Offline";
  if (tier === "good") return "Good";
  if (tier === "degraded") return "Degraded";
  if (tier === "poor") return "Poor";
  return "New";
}

function relayLabel(url) {
  return String(url || "")
    .replace(/^https?:\/\//i, "")
    .replace(/^wss?:\/\//i, "");
}

const sortedStores = computed(() =>
  [...(cache.value?.stores || [])].sort((a, b) => b.estimatedBytes - a.estimatedBytes),
);

const quotaPercent = computed(() => {
  const total = Number(quota.value?.quota) || 0;
  if (!total) return null;
  return Math.min(100, ((Number(quota.value?.usage) || 0) / total) * 100);
});

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const [cacheSummary, relays] = await Promise.all([getCacheSummary(), getRelayHealthSummary()]);
    cache.value = cacheSummary;
    relayHealth.value = relays;
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      quota.value = await navigator.storage.estimate().catch(() => null);
    }
  } catch (err) {
    error.value = err?.message || "Unable to load analytics.";
  } finally {
    loading.value = false;
  }
}

function handleRelaysChanged() {
  void refresh();
}

onMounted(() => {
  void refresh();
  if (typeof window !== "undefined") {
    window.addEventListener("gupt:relays-changed", handleRelaysChanged);
  }
});

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("gupt:relays-changed", handleRelaysChanged);
  }
});
</script>

<template>
  <div class="analytics-panel">
    <AppAlertBanner v-if="error" :message="error" />

    <section class="analytics-panel__block" aria-labelledby="analytics-relay-health">
      <div class="analytics-panel__block-head">
        <p id="analytics-relay-health" class="analytics-panel__label">Relay health</p>
        <p class="analytics-panel__meta">
          {{ relayHealth.length }} tracked · 90-day window
        </p>
      </div>

      <p v-if="loading" class="analytics-panel__empty">Reading relay traffic…</p>
      <p v-else-if="!relayHealth.length" class="analytics-panel__empty">
        No relay traffic yet. Send a message or probe the relays to start collecting.
      </p>
      <div v-else class="analytics-panel__relays">
        <article v-for="entry in relayHealth" :key="entry.relay" class="analytics-relay">
          <header class="analytics-relay__head">
            <span
              class="analytics-relay__dot"
              :class="tierDotClass(entry.tier)"
              aria-hidden="true"
            />
            <p class="analytics-relay__name" :title="entry.relay">{{ relayLabel(entry.relay) }}</p>
            <span class="analytics-relay__tier" :class="tierBadgeClass(entry.tier)">
              {{ tierLabel(entry.tier) }}
            </span>
          </header>

          <dl class="analytics-relay__rates">
            <div class="analytics-relay__rate">
              <dt>Send</dt>
              <dd :class="`analytics-relay__value--${rateTone(entry.publishSuccessRate)}`">
                {{ formatRate(entry.publishSuccessRate) }}
              </dd>
              <p class="analytics-relay__samples">
                {{ entry.publishOk }}/{{ entry.publishTotal }}
                <template v-if="entry.avgPublishMs"> · {{ entry.avgPublishMs }} ms</template>
              </p>
            </div>
            <div class="analytics-relay__rate">
              <dt>Connect</dt>
              <dd :class="`analytics-relay__value--${rateTone(entry.connectSuccessRate)}`">
                {{ formatRate(entry.connectSuccessRate) }}
              </dd>
              <p class="analytics-relay__samples">
                {{ entry.connectOk }}/{{ entry.connectTotal }}
              </p>
            </div>
            <div class="analytics-relay__rate">
              <dt>Read</dt>
              <dd :class="`analytics-relay__value--${rateTone(entry.querySuccessRate)}`">
                {{ formatRate(entry.querySuccessRate) }}
              </dd>
              <p class="analytics-relay__samples">
                {{ entry.queryOk }}/{{ entry.queryTotal }}
                <template v-if="entry.avgQueryMs"> · {{ entry.avgQueryMs }} ms</template>
              </p>
            </div>
          </dl>

          <p v-if="entry.lastError" class="analytics-relay__error" :title="entry.lastError">
            {{ entry.lastError }}
          </p>
        </article>
      </div>
    </section>

    <section class="analytics-panel__block" aria-labelledby="analytics-cache">
      <div class="analytics-panel__block-head">
        <p id="analytics-cache" class="analytics-panel__label">Cache on this device</p>
        <p v-if="cache" class="analytics-panel__meta">
          {{ cache.totalEntries.toLocaleString() }} entries ·
          {{ formatBytes(cache.totalEstimatedBytes) }}
        </p>
      </div>

      <template v-if="cache">
        <div v-if="quotaPercent !== null" class="analytics-panel__usage">
          <div class="analytics-panel__track" aria-hidden="true">
            <div class="analytics-panel__fill" :style="{ width: `${quotaPercent}%` }" />
          </div>
          <p class="analytics-panel__hint">
            {{ quotaPercent.toFixed(1) }}% of browser storage ·
            {{ formatBytes(quota.quota) }} available
          </p>
        </div>

        <ul class="analytics-panel__stores">
          <li v-for="store in sortedStores" :key="store.table" class="analytics-panel__store">
            <span
              class="analytics-panel__store-dot"
              :class="`analytics-panel__store-dot--${storeTone(store.table)}`"
              aria-hidden="true"
            />
            <span class="analytics-panel__store-name">{{ store.label }}</span>
            <span class="analytics-panel__store-value">
              {{ store.entries.toLocaleString() }} · {{ formatBytes(store.estimatedBytes) }}
            </span>
          </li>
        </ul>

        <p class="analytics-panel__hint">
          Relays keep your events for their retention window; this device only mirrors them.
        </p>
      </template>
      <p v-else class="analytics-panel__empty">Cache summary unavailable.</p>
    </section>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

.analytics-panel {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
  min-width: 0;
}

.analytics-panel__block {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
  min-width: 0;
}

.analytics-panel__block-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing);
}

.analytics-panel__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.analytics-panel__meta {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted-2);
}

.analytics-panel__empty {
  margin: 0;
  padding-block: calc(var(--spacing) * 3);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-muted);
}

.analytics-panel__relays {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: calc(var(--spacing) * 2);
  min-width: 0;
}

.analytics-relay {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 2.5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background-color: var(--app-surface);
  min-width: 0;
  animation: analytics-in var(--app-dur-base) var(--app-ease-out) both;
  transition: border-color var(--app-dur-fast) var(--app-ease-standard);
}

.analytics-relay__head {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1.5);
  min-width: 0;
}

.analytics-relay__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.analytics-relay__name {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
}

.analytics-relay__tier {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.analytics-relay__rates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--spacing);
  margin: 0;
}

.analytics-relay__rate {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.analytics-relay__rate dt {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.analytics-relay__rate dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.analytics-relay__value--good {
  color: var(--app-success);
}

.analytics-relay__value--fair {
  color: var(--app-warning);
}

.analytics-relay__value--poor {
  color: var(--app-danger);
}

.analytics-relay__value--muted {
  color: var(--app-muted);
}

.analytics-relay__samples {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted-2);
}

.analytics-relay__error {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-danger);
}

.analytics-panel__usage {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.analytics-panel__track {
  height: 6px;
  border-radius: 999px;
  background-color: var(--app-surface-inset);
  overflow: hidden;
}

.analytics-panel__fill {
  height: 100%;
  border-radius: inherit;
  background-color: var(--app-primary);
  transition: width var(--app-dur-slow) var(--app-ease-standard);
}

.analytics-panel__stores {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.analytics-panel__store {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  min-height: 36px;
  padding-inline: var(--spacing);
  border-radius: var(--app-radius-sm);
  min-width: 0;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.analytics-panel__store-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.analytics-panel__store-dot--info {
  background-color: var(--app-info);
}

.analytics-panel__store-dot--accent {
  background-color: var(--app-accent-share);
}

.analytics-panel__store-dot--danger {
  background-color: var(--app-danger);
}

.analytics-panel__store-dot--success {
  background-color: var(--app-success);
}

.analytics-panel__store-dot--warning {
  background-color: var(--app-warning);
}

.analytics-panel__store-dot--muted {
  background-color: var(--app-muted);
}

.analytics-panel__store-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--app-text-soft);
}

.analytics-panel__store-value {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted);
}

.analytics-panel__hint {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.6;
  color: var(--app-muted);
}

@media (hover: hover) {
  .analytics-relay:hover {
    border-color: var(--app-border-strong);
  }

  .analytics-panel__store:hover {
    background-color: var(--app-surface-hover);
  }
}

@keyframes analytics-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .analytics-relay,
  .analytics-panel__fill {
    animation: none;
    transition: none;
  }
}

@media (max-width: 30rem) {
  .analytics-relay__rates {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
