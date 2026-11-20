<script setup>
import { computed, onMounted, ref } from "vue";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import { getCacheSummary, getRelayHealthSummary } from "@/lib/idb";

const summary = ref(null);
const relayHealth = ref([]);
const loading = ref(true);
const error = ref("");

const STORE_COLORS = {
  mediaCache: "#38bdf8",
  roomMeta: "#a78bfa",
  groups: "#fb7185",
  rawEvents: "#34d399",
  engineBlobs: "#fbbf24",
};

function storeColor(table) {
  return STORE_COLORS[table] || "#71717a";
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

function pct(value, total) {
  if (!total) return 0;
  return Math.min(100, (value / total) * 100);
}

function timeago(ms) {
  const s = Math.floor(Math.abs(ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

function relativeDate(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const label = timeago(diff);
  if (label === "just now") return "just now";
  return diff > 0 ? `${label} ago` : `in ${label}`;
}

const storageQuota = computed(() => summary.value?.storageQuota || null);

const storageUsedPct = computed(() => {
  if (!storageQuota.value) return 0;
  return pct(summary.value?.totalEstimatedBytes || 0, storageQuota.value);
});

const sortedStores = computed(() =>
  [...(summary.value?.stores || [])].sort((a, b) => b.estimatedBytes - a.estimatedBytes),
);

const relaysToReplace = computed(() => relayHealth.value.filter((entry) => entry.tier === "poor"));

const relaysDegraded = computed(() =>
  relayHealth.value.filter((entry) => entry.tier === "degraded"),
);

function relayLabel(url) {
  return String(url || "")
    .replace(/^https?:\/\//i, "")
    .replace(/^wss?:\/\//i, "");
}

function tierLabel(tier) {
  if (tier === "good") return "Good";
  if (tier === "degraded") return "Degraded";
  if (tier === "poor") return "Replace";
  return "Collecting data";
}

function tierDot(tier) {
  if (tier === "good") return "stats-view__success";
  if (tier === "degraded") return "stats-view__warning";
  if (tier === "poor") return "stats-view__danger";
  return "stats-view__muted";
}

function tierText(tier) {
  if (tier === "good") return "stats-view__success-2";
  if (tier === "degraded") return "stats-view__warning-2";
  if (tier === "poor") return "stats-view__danger-2";
  return "stats-view__muted-2";
}

function formatRate(rate) {
  return rate === null || rate === undefined ? "—" : `${rate}%`;
}

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const [cacheSummary, relays] = await Promise.all([getCacheSummary(), getRelayHealthSummary()]);
    summary.value = cacheSummary;
    relayHealth.value = relays;
  } catch (e) {
    error.value = e.message || "Unable to load stats.";
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <div class="stats-view__block">
    <main class="stats-view__main">
      <div class="stats-view__block-2">
        <!-- Header -->
        <div class="stats-view__block-3">
          <div>
            <h1 class="stats-view__title-stats">Stats</h1>
            <p class="stats-view__text">
              Cache usage and relay health from real sends · 90-day rolling window
            </p>
          </div>
        </div>

        <AppAlertBanner v-if="error" :message="error" />

        <div v-if="loading" class="stats-view__status" role="status">
          <span class="stats-view__text-2">Loading stats…</span>

          <!-- Relay health -->
          <div
            class="stats-view__block-4"
          >
            <div class="stats-view__block-5">
              <div class="stats-view__block-6">
                <AppSkeleton class="stats-view__app-skeleton" />
                <AppSkeleton class="stats-view__app-skeleton-2" />
              </div>
              <AppSkeleton class="stats-view__app-skeleton-3" />
            </div>
            <div class="stats-view__block-7">
              <div v-for="n in 3" :key="n" class="stats-view__block-8">
                <div class="stats-view__block-9">
                  <AppSkeleton class="stats-view__app-skeleton-4" />
                  <AppSkeleton class="stats-view__app-skeleton-5" />
                  <AppSkeleton class="stats-view__app-skeleton-6" />
                </div>
                <div class="stats-view__block-10">
                  <div v-for="col in 3" :key="col" class="stats-view__block-11">
                    <AppSkeleton class="stats-view__app-skeleton-7" />
                    <AppSkeleton class="stats-view__app-skeleton-8" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Summary cards -->
          <div class="stats-view__block-12">
            <div
              v-for="n in 2"
              :key="n"
              class="stats-view__block-13"
            >
              <AppSkeleton class="stats-view__app-skeleton-9" />
              <AppSkeleton class="stats-view__app-skeleton-10" />
            </div>
          </div>

          <!-- Storage usage -->
          <div
            class="stats-view__block-14"
          >
            <div class="stats-view__block-15">
              <AppSkeleton class="stats-view__app-skeleton-11" />
              <AppSkeleton class="stats-view__app-skeleton-12" />
            </div>
            <AppSkeleton class="stats-view__app-skeleton-13" />
            <AppSkeleton class="stats-view__app-skeleton-14" />
          </div>
        </div>

        <template v-else-if="summary">
          <!-- Relay health (raw outcomes) -->
          <div
            class="stats-view__block-16"
          >
            <div class="stats-view__block-17">
              <div>
                <p class="stats-view__text-relay-health">Relay health</p>
                <p class="stats-view__text-3">
                  Per-relay publish, connect, and query success from actual app traffic
                </p>
              </div>
              <p class="stats-view__text-tracked">{{ relayHealth.length }} tracked</p>
            </div>

            <div
              v-if="relaysToReplace.length"
              class="stats-view__block-18"
            >
              Consider replacing {{ relaysToReplace.length }} relay{{
                relaysToReplace.length === 1 ? "" : "s"
              }}
              with consistently low publish success.
            </div>

            <div
              v-else-if="relaysDegraded.length"
              class="stats-view__block-19"
            >
              {{ relaysDegraded.length }} relay{{ relaysDegraded.length === 1 ? " is" : "s are" }}
              degraded — watch before removing.
            </div>

            <div class="stats-view__block-20">
              <div
                v-for="entry in relayHealth"
                :key="entry.relay"
                class="stats-view__block-21"
              >
                <div class="stats-view__block-22">
                  <span class="stats-view__text-4" :class="tierDot(entry.tier)" />
                  <p class="stats-view__text-5">
                    {{ relayLabel(entry.relay) }}
                  </p>
                  <span
                    class="stats-view__text-6"
                    :class="{
                      'stats-view__text--success': entry.tier === 'good',
                      'stats-view__text--warning': entry.tier === 'degraded',
                      'stats-view__text--danger': entry.tier === 'poor',
                      'stats-view__text--muted': entry.tier === 'unknown',
                    }"
                  >
                    {{ tierLabel(entry.tier) }}
                  </span>
                </div>

                <div class="stats-view__block-23">
                  <div>
                    <p class="stats-view__text-publish">Publish</p>
                    <p class="stats-view__text-7" :class="tierText(entry.tier)">
                      {{ formatRate(entry.publishSuccessRate) }}
                      <span class="stats-view__text-8">
                        ({{ entry.publishOk }}/{{ entry.publishTotal }})
                      </span>
                    </p>
                    <p v-if="entry.avgPublishMs" class="stats-view__text-9">
                      avg {{ entry.avgPublishMs }} ms
                    </p>
                  </div>
                  <div>
                    <p class="stats-view__text-connect">Connect</p>
                    <p class="stats-view__text-10">
                      {{ formatRate(entry.connectSuccessRate) }}
                      <span class="stats-view__text-11">
                        ({{ entry.connectOk }}/{{ entry.connectTotal }})
                      </span>
                    </p>
                    <p v-if="entry.avgConnectMs" class="stats-view__text-12">
                      avg {{ entry.avgConnectMs }} ms
                    </p>
                  </div>
                  <div>
                    <p class="stats-view__text-query">Query</p>
                    <p class="stats-view__text-13">
                      {{ formatRate(entry.querySuccessRate) }}
                      <span class="stats-view__text-14">
                        ({{ entry.queryOk }}/{{ entry.queryTotal }})
                      </span>
                    </p>
                    <p v-if="entry.avgQueryMs" class="stats-view__text-15">
                      avg {{ entry.avgQueryMs }} ms
                    </p>
                  </div>
                </div>

                <p v-if="entry.lastError" class="stats-view__text-last-error">
                  Last error: {{ entry.lastError }}
                </p>
              </div>

              <div v-if="!relayHealth.length" class="stats-view__block-24">
                No relay stats yet. Send a message or refresh Settings relay health to start
                collecting data.
              </div>
            </div>
          </div>

          <!-- Summary cards -->
          <div class="stats-view__block-25">
            <div
              class="stats-view__block-26"
            >
              <p class="stats-view__text-16">{{ summary.totalEntries.toLocaleString() }}</p>
              <p class="stats-view__text-cached-entries">Cached entries</p>
            </div>
            <div
              class="stats-view__block-27"
            >
              <p class="stats-view__text-17">{{ formatBytes(summary.totalEstimatedBytes) }}</p>
              <p class="stats-view__text-estimated-size">Estimated size</p>
            </div>
          </div>

          <!-- Storage bar -->
          <div
            class="stats-view__block-28"
          >
            <div class="stats-view__block-29">
              <p class="stats-view__text-storage-usage">Storage usage</p>
              <p class="stats-view__text-18">
                <template v-if="storageQuota">
                  {{ formatBytes(summary.totalEstimatedBytes) }} /
                  {{ formatBytes(storageQuota) }}
                </template>
                <template v-else>
                  {{ formatBytes(summary.totalEstimatedBytes) }} (uncapped)
                </template>
              </p>
            </div>
            <div v-if="storageQuota" class="stats-view__block-30">
              <div
                class="stats-view__block-31"
                :style="{ width: storageUsedPct + '%' }"
              />
            </div>
            <p class="stats-view__text-19">
              <template v-if="storageQuota"> {{ storageUsedPct.toFixed(1) }}% used </template>
              <template v-else> IndexedDB storage uncapped </template>
            </p>
          </div>

          <!-- Per-store -->
          <div
            class="stats-view__block-32"
          >
            <div class="stats-view__block-33">
              <p class="stats-view__text-cache-stores">Cache stores</p>
              <p class="stats-view__text-20">{{ summary.dbName }}</p>
            </div>
            <div
              v-for="store in sortedStores"
              :key="store.table"
              class="stats-view__block-34"
            >
              <span
                class="stats-view__text-21"
                :style="{ backgroundColor: storeColor(store.table) }"
              />
              <p class="stats-view__text-22">{{ store.label }}</p>
              <p class="stats-view__text-23">
                {{ store.entries.toLocaleString() }} · {{ formatBytes(store.estimatedBytes) }}
              </p>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-18 {
  border-color: color-mix(in oklab,var(--color-red-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-19 {
  border-color: color-mix(in oklab,var(--color-yellow-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-4 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-13 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-14 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-16 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-26 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-27 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-28 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-32 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__text--success {
  background-color: color-mix(in oklab,var(--color-emerald-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-18 {
  background-color: color-mix(in oklab,var(--color-red-500) 8%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__text--danger {
  background-color: color-mix(in oklab,var(--color-red-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__text--muted {
  background-color: color-mix(in oklab,var(--color-white) 8%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-30 {
  background-color: color-mix(in oklab,var(--color-white) 8%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-19 {
  background-color: color-mix(in oklab,var(--color-yellow-500) 8%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.stats-view__text--warning {
  background-color: color-mix(in oklab,var(--color-yellow-500) 15%,transparent);
}
}

@media (hover:hover) {
.stats-view__block-21:hover {
  background-color: #ffffff0a;
}
}

@media (hover:hover) {
.stats-view__block-34:hover {
  background-color: #ffffff0a;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-21:hover {
  background-color: color-mix(in oklab,var(--color-white) 4%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.stats-view__block-34:hover {
  background-color: color-mix(in oklab,var(--color-white) 4%,transparent);
}
}
}

@media (min-width:40rem) {
.stats-view__block-5 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.stats-view__block-17 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.stats-view__block-29 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.stats-view__block-5 {
  align-items: flex-end;
}
}

@media (min-width:40rem) {
.stats-view__block-17 {
  align-items: flex-end;
}
}

@media (min-width:40rem) {
.stats-view__block-29 {
  align-items: flex-end;
}
}

@media (min-width:40rem) {
.stats-view__block-5 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.stats-view__block-17 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.stats-view__block-29 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.stats-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.stats-view__block-12 {
  grid-template-columns: repeat(4,minmax(0,1fr));
}
}

@media (min-width:64rem) {
.stats-view__block-25 {
  grid-template-columns: repeat(4,minmax(0,1fr));
}
}

@media (min-width:64rem) {
.stats-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.stats-view__text-2 {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.stats-view__main {
  margin-inline: auto;
}
.stats-view__text-7 {
  margin-top: calc(var(--spacing) * .5);
}
.stats-view__text-9 {
  margin-top: calc(var(--spacing) * .5);
}
.stats-view__text-10 {
  margin-top: calc(var(--spacing) * .5);
}
.stats-view__text-12 {
  margin-top: calc(var(--spacing) * .5);
}
.stats-view__text-13 {
  margin-top: calc(var(--spacing) * .5);
}
.stats-view__text-15 {
  margin-top: calc(var(--spacing) * .5);
}
.stats-view__text {
  margin-top: var(--spacing);
}
.stats-view__text-cached-entries {
  margin-top: var(--spacing);
}
.stats-view__text-estimated-size {
  margin-top: var(--spacing);
}
.stats-view__block-10 {
  margin-top: calc(var(--spacing) * 2);
}
.stats-view__block-23 {
  margin-top: calc(var(--spacing) * 2);
}
.stats-view__text-last-error {
  margin-top: calc(var(--spacing) * 2);
}
.stats-view__block-3 {
  display: flex;
}
.stats-view__block-5 {
  display: flex;
}
.stats-view__block-9 {
  display: flex;
}
.stats-view__block-15 {
  display: flex;
}
.stats-view__block-17 {
  display: flex;
}
.stats-view__block-22 {
  display: flex;
}
.stats-view__block-29 {
  display: flex;
}
.stats-view__block-33 {
  display: flex;
}
.stats-view__block-34 {
  display: flex;
}
.stats-view__block-10 {
  display: grid;
}
.stats-view__block-12 {
  display: grid;
}
.stats-view__block-23 {
  display: grid;
}
.stats-view__block-25 {
  display: grid;
}
.stats-view__text-21 {
  display: inline-block;
}
.stats-view__app-skeleton-4 {
  height: calc(var(--spacing) * 2);
}
.stats-view__app-skeleton-7 {
  height: calc(var(--spacing) * 2);
}
.stats-view__app-skeleton-13 {
  height: calc(var(--spacing) * 2);
}
.stats-view__text-4 {
  height: calc(var(--spacing) * 2);
}
.stats-view__block-30 {
  height: calc(var(--spacing) * 2);
}
.stats-view__text-21 {
  height: calc(var(--spacing) * 2);
}
.stats-view__app-skeleton-2 {
  height: calc(var(--spacing) * 2.5);
}
.stats-view__app-skeleton-3 {
  height: calc(var(--spacing) * 2.5);
}
.stats-view__app-skeleton-8 {
  height: calc(var(--spacing) * 2.5);
}
.stats-view__app-skeleton-12 {
  height: calc(var(--spacing) * 2.5);
}
.stats-view__app-skeleton-14 {
  height: calc(var(--spacing) * 2.5);
}
.stats-view__app-skeleton-5 {
  height: calc(var(--spacing) * 3);
}
.stats-view__app-skeleton-10 {
  height: calc(var(--spacing) * 3);
}
.stats-view__app-skeleton {
  height: calc(var(--spacing) * 4);
}
.stats-view__app-skeleton-6 {
  height: calc(var(--spacing) * 4);
}
.stats-view__app-skeleton-11 {
  height: calc(var(--spacing) * 4);
}
.stats-view__app-skeleton-9 {
  height: calc(var(--spacing) * 7);
}
.stats-view__block-31 {
  height: 100%;
}
.stats-view__block {
  min-height: 100vh;
}
.stats-view__app-skeleton-4 {
  width: calc(var(--spacing) * 2);
}
.stats-view__text-4 {
  width: calc(var(--spacing) * 2);
}
.stats-view__text-21 {
  width: calc(var(--spacing) * 2);
}
.stats-view__app-skeleton-7 {
  width: calc(var(--spacing) * 12);
}
.stats-view__app-skeleton-3 {
  width: calc(var(--spacing) * 16);
}
.stats-view__app-skeleton-6 {
  width: calc(var(--spacing) * 16);
}
.stats-view__app-skeleton-8 {
  width: calc(var(--spacing) * 16);
}
.stats-view__app-skeleton-14 {
  width: calc(var(--spacing) * 16);
}
.stats-view__app-skeleton-9 {
  width: calc(var(--spacing) * 20);
}
.stats-view__app-skeleton-10 {
  width: calc(var(--spacing) * 24);
}
.stats-view__app-skeleton {
  width: calc(var(--spacing) * 28);
}
.stats-view__app-skeleton-11 {
  width: calc(var(--spacing) * 28);
}
.stats-view__app-skeleton-12 {
  width: calc(var(--spacing) * 28);
}
.stats-view__app-skeleton-2 {
  width: calc(var(--spacing) * 72);
}
.stats-view__main {
  width: 100%;
}
.stats-view__app-skeleton-13 {
  width: 100%;
}
.stats-view__block-30 {
  width: 100%;
}
.stats-view__main {
  max-width: var(--container-6xl);
}
.stats-view__app-skeleton-2 {
  max-width: 100%;
}
.stats-view__text-5 {
  min-width: 0;
}
.stats-view__app-skeleton-5 {
  flex: 1;
}
.stats-view__text-5 {
  flex: 1;
}
.stats-view__text-22 {
  flex: 1;
}
.stats-view__app-skeleton-4 {
  flex-shrink: 0;
}
.stats-view__app-skeleton-6 {
  flex-shrink: 0;
}
.stats-view__text-4 {
  flex-shrink: 0;
}
.stats-view__text-6 {
  flex-shrink: 0;
}
.stats-view__text-21 {
  flex-shrink: 0;
}
.stats-view__text-23 {
  flex-shrink: 0;
}
.stats-view__block-12 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
.stats-view__block-25 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
.stats-view__block-10 {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
.stats-view__block-23 {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
.stats-view__block-5 {
  flex-direction: column;
}
.stats-view__block-17 {
  flex-direction: column;
}
.stats-view__block-29 {
  flex-direction: column;
}
.stats-view__block-3 {
  align-items: center;
}
.stats-view__block-9 {
  align-items: center;
}
.stats-view__block-22 {
  align-items: center;
}
.stats-view__block-33 {
  align-items: center;
}
.stats-view__block-34 {
  align-items: center;
}
.stats-view__block-15 {
  align-items: flex-end;
}
.stats-view__block-3 {
  justify-content: space-between;
}
.stats-view__block-15 {
  justify-content: space-between;
}
.stats-view__block-33 {
  justify-content: space-between;
}
.stats-view__block-5 {
  gap: var(--spacing);
}
.stats-view__block-17 {
  gap: var(--spacing);
}
.stats-view__block-29 {
  gap: var(--spacing);
}
.stats-view__block-10 {
  gap: calc(var(--spacing) * 2);
}
.stats-view__block-23 {
  gap: calc(var(--spacing) * 2);
}
.stats-view__block-9 {
  gap: calc(var(--spacing) * 3);
}
.stats-view__block-12 {
  gap: calc(var(--spacing) * 3);
}
.stats-view__block-15 {
  gap: calc(var(--spacing) * 3);
}
.stats-view__block-22 {
  gap: calc(var(--spacing) * 3);
}
.stats-view__block-25 {
  gap: calc(var(--spacing) * 3);
}
.stats-view__block-34 {
  gap: calc(var(--spacing) * 3);
}
:where(.stats-view__block-7>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * .5) * 0);
  margin-block-end: calc(calc(var(--spacing) * .5) * calc(1 - 0));
}
:where(.stats-view__block-20>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * .5) * 0);
  margin-block-end: calc(calc(var(--spacing) * .5) * calc(1 - 0));
}
:where(.stats-view__block-11>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.stats-view__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.stats-view__block-13>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.stats-view__block-32>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.stats-view__block-14>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.stats-view__block-28>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.stats-view__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.stats-view__block-16>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.stats-view__main>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.stats-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.stats-view__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.stats-view__text-5 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.stats-view__text-last-error {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.stats-view__text-22 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.stats-view__block-30 {
  overflow: hidden;
}
.stats-view__block-4 {
  border-radius: var(--radius-2xl);
}
.stats-view__block-13 {
  border-radius: var(--radius-2xl);
}
.stats-view__block-14 {
  border-radius: var(--radius-2xl);
}
.stats-view__block-16 {
  border-radius: var(--radius-2xl);
}
.stats-view__block-26 {
  border-radius: var(--radius-2xl);
}
.stats-view__block-27 {
  border-radius: var(--radius-2xl);
}
.stats-view__block-28 {
  border-radius: var(--radius-2xl);
}
.stats-view__block-32 {
  border-radius: var(--radius-2xl);
}
.stats-view__app-skeleton-4 {
  border-radius: 3.40282e38px;
}
.stats-view__app-skeleton-6 {
  border-radius: 3.40282e38px;
}
.stats-view__app-skeleton-13 {
  border-radius: 3.40282e38px;
}
.stats-view__text-4 {
  border-radius: 3.40282e38px;
}
.stats-view__text-6 {
  border-radius: 3.40282e38px;
}
.stats-view__block-30 {
  border-radius: 3.40282e38px;
}
.stats-view__block-31 {
  border-radius: 3.40282e38px;
}
.stats-view__text-21 {
  border-radius: 3.40282e38px;
}
.stats-view__block-8 {
  border-radius: var(--radius-xl);
}
.stats-view__block-18 {
  border-radius: var(--radius-xl);
}
.stats-view__block-19 {
  border-radius: var(--radius-xl);
}
.stats-view__block-21 {
  border-radius: var(--radius-xl);
}
.stats-view__block-34 {
  border-radius: var(--radius-xl);
}
.stats-view__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.stats-view__block-13 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.stats-view__block-14 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.stats-view__block-16 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.stats-view__block-18 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.stats-view__block-19 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.stats-view__block-26 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.stats-view__block-27 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.stats-view__block-28 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.stats-view__block-32 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.stats-view__block-4 {
  border-color: var(--app-border);
}
.stats-view__block-13 {
  border-color: var(--app-border);
}
.stats-view__block-14 {
  border-color: var(--app-border);
}
.stats-view__block-16 {
  border-color: var(--app-border);
}
.stats-view__block-26 {
  border-color: var(--app-border);
}
.stats-view__block-27 {
  border-color: var(--app-border);
}
.stats-view__block-28 {
  border-color: var(--app-border);
}
.stats-view__block-32 {
  border-color: var(--app-border);
}
.stats-view__block-18 {
  border-color: #fb2c3633;
}
.stats-view__block-19 {
  border-color: #edb20033;
}
.stats-view__block-4 {
  background-color: var(--app-surface);
}
.stats-view__block-13 {
  background-color: var(--app-surface);
}
.stats-view__block-14 {
  background-color: var(--app-surface);
}
.stats-view__block-16 {
  background-color: var(--app-surface);
}
.stats-view__block-26 {
  background-color: var(--app-surface);
}
.stats-view__block-27 {
  background-color: var(--app-surface);
}
.stats-view__block-28 {
  background-color: var(--app-surface);
}
.stats-view__block-32 {
  background-color: var(--app-surface);
}
.stats-view__success {
  background-color: var(--color-emerald-400);
}
.stats-view__block-31 {
  background-color: var(--color-emerald-500);
}
.stats-view__text--success {
  background-color: #00bb7f26;
}
.stats-view__danger {
  background-color: var(--color-red-500);
}
.stats-view__block-18 {
  background-color: #fb2c3614;
}
.stats-view__text--danger {
  background-color: #fb2c3626;
}
.stats-view__text--muted {
  background-color: #ffffff14;
}
.stats-view__block-30 {
  background-color: #ffffff14;
}
.stats-view__warning {
  background-color: var(--color-yellow-400);
}
.stats-view__block-19 {
  background-color: #edb20014;
}
.stats-view__text--warning {
  background-color: #edb20026;
}
.stats-view__muted {
  background-color: var(--ui-zinc-500);
}
.stats-view__block-4 {
  padding: calc(var(--spacing) * 4);
}
.stats-view__block-13 {
  padding: calc(var(--spacing) * 4);
}
.stats-view__block-14 {
  padding: calc(var(--spacing) * 4);
}
.stats-view__block-16 {
  padding: calc(var(--spacing) * 4);
}
.stats-view__block-26 {
  padding: calc(var(--spacing) * 4);
}
.stats-view__block-27 {
  padding: calc(var(--spacing) * 4);
}
.stats-view__block-28 {
  padding: calc(var(--spacing) * 4);
}
.stats-view__block-32 {
  padding: calc(var(--spacing) * 4);
}
.stats-view__block-8 {
  padding-inline: calc(var(--spacing) * 2);
}
.stats-view__block-21 {
  padding-inline: calc(var(--spacing) * 2);
}
.stats-view__text-6 {
  padding-inline: calc(var(--spacing) * 2);
}
.stats-view__block-34 {
  padding-inline: calc(var(--spacing) * 2);
}
.stats-view__block-18 {
  padding-inline: calc(var(--spacing) * 3);
}
.stats-view__block-19 {
  padding-inline: calc(var(--spacing) * 3);
}
.stats-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.stats-view__text-6 {
  padding-block: calc(var(--spacing) * .5);
}
.stats-view__block-18 {
  padding-block: calc(var(--spacing) * 2);
}
.stats-view__block-19 {
  padding-block: calc(var(--spacing) * 2);
}
.stats-view__block-34 {
  padding-block: calc(var(--spacing) * 2);
}
.stats-view__block-8 {
  padding-block: calc(var(--spacing) * 2.5);
}
.stats-view__block-21 {
  padding-block: calc(var(--spacing) * 2.5);
}
.stats-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.stats-view__block-24 {
  padding-block: calc(var(--spacing) * 8);
}
.stats-view__block-33 {
  padding-bottom: calc(var(--spacing) * 2);
}
.stats-view__block-24 {
  text-align: center;
}
.stats-view__text-5 {
  font-family: var(--font-mono);
}
.stats-view__title-stats {
  font-size: var(--text-2xl);
  line-height: var(--leading,var(--text-2xl--line-height));
}
.stats-view__text-16 {
  font-size: var(--text-2xl);
  line-height: var(--leading,var(--text-2xl--line-height));
}
.stats-view__text-17 {
  font-size: var(--text-2xl);
  line-height: var(--leading,var(--text-2xl--line-height));
}
.stats-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.stats-view__text-relay-health {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.stats-view__block-24 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.stats-view__text-storage-usage {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.stats-view__text-cache-stores {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.stats-view__text-22 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.stats-view__block-18 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.stats-view__block-19 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.stats-view__text-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.stats-view__text-cached-entries {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.stats-view__text-estimated-size {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.stats-view__text-18 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.stats-view__text-23 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.stats-view__text-6 {
  font-size: 10px;
}
.stats-view__block-23 {
  font-size: 10px;
}
.stats-view__text-last-error {
  font-size: 10px;
}
.stats-view__text-3 {
  font-size: 11px;
}
.stats-view__text-tracked {
  font-size: 11px;
}
.stats-view__text-19 {
  font-size: 11px;
}
.stats-view__text-20 {
  font-size: 11px;
}
.stats-view__title-stats {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.stats-view__text-16 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.stats-view__text-17 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.stats-view__text-relay-health {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.stats-view__text-6 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.stats-view__text-storage-usage {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.stats-view__text-cache-stores {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.stats-view__title-stats {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.stats-view__text-publish {
  --tracking: var(--tracking-wide);
  letter-spacing: var(--tracking-wide);
}
.stats-view__text-connect {
  --tracking: var(--tracking-wide);
  letter-spacing: var(--tracking-wide);
}
.stats-view__text-query {
  --tracking: var(--tracking-wide);
  letter-spacing: var(--tracking-wide);
}
.stats-view__text--success {
  color: var(--color-emerald-400);
}
.stats-view__success-2 {
  color: var(--color-emerald-400);
}
.stats-view__block-18 {
  color: var(--color-red-300);
}
.stats-view__text--danger {
  color: var(--color-red-400);
}
.stats-view__danger-2 {
  color: var(--color-red-400);
}
.stats-view__block-19 {
  color: var(--color-yellow-300);
}
.stats-view__text--warning {
  color: var(--color-yellow-400);
}
.stats-view__warning-2 {
  color: var(--color-yellow-400);
}
.stats-view__text-5 {
  color: var(--ui-zinc-300);
}
.stats-view__text--muted {
  color: var(--ui-zinc-400);
}
.stats-view__text {
  color: var(--ui-zinc-500);
}
.stats-view__text-3 {
  color: var(--ui-zinc-500);
}
.stats-view__text-tracked {
  color: var(--ui-zinc-500);
}
.stats-view__block-23 {
  color: var(--ui-zinc-500);
}
.stats-view__block-24 {
  color: var(--ui-zinc-500);
}
.stats-view__text-cached-entries {
  color: var(--ui-zinc-500);
}
.stats-view__text-estimated-size {
  color: var(--ui-zinc-500);
}
.stats-view__text-18 {
  color: var(--ui-zinc-500);
}
.stats-view__text-19 {
  color: var(--ui-zinc-500);
}
.stats-view__text-20 {
  color: var(--ui-zinc-500);
}
.stats-view__text-23 {
  color: var(--ui-zinc-500);
}
.stats-view__muted-2 {
  color: var(--ui-zinc-500);
}
.stats-view__text-publish {
  color: var(--ui-zinc-600);
}
.stats-view__text-8 {
  color: var(--ui-zinc-600);
}
.stats-view__text-connect {
  color: var(--ui-zinc-600);
}
.stats-view__text-11 {
  color: var(--ui-zinc-600);
}
.stats-view__text-query {
  color: var(--ui-zinc-600);
}
.stats-view__text-14 {
  color: var(--ui-zinc-600);
}
.stats-view__text-last-error {
  color: var(--ui-zinc-600);
}
.stats-view__text-publish {
  text-transform: uppercase;
}
.stats-view__text-connect {
  text-transform: uppercase;
}
.stats-view__text-query {
  text-transform: uppercase;
}
.stats-view__text-tracked {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.stats-view__text-7 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.stats-view__text-9 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.stats-view__text-10 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.stats-view__text-12 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.stats-view__text-13 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.stats-view__text-15 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.stats-view__text-23 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.stats-view__block-4 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.stats-view__block-13 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.stats-view__block-14 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.stats-view__block-16 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.stats-view__block-26 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.stats-view__block-27 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.stats-view__block-28 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.stats-view__block-32 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.stats-view__block-31 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.stats-view__block-21 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.stats-view__block-34 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.stats-view__block-31 {
  --duration: .5s;
  transition-duration: .5s;
}
[data-theme="light"] .stats-view__text--muted {
  background-color: var(--app-surface-soft) !important;
}
[data-theme="light"] .stats-view__block-30 {
  background-color: var(--app-surface-soft) !important;
}
[data-theme="light"] .stats-view__text--success {
  color: #059669;
}
[data-theme="light"] .stats-view__success-2 {
  color: #059669;
}
[data-theme="light"] .stats-view__block-18 {
  color: #dc2626;
}
[data-theme="light"] .stats-view__text--danger {
  color: #dc2626;
}
[data-theme="light"] .stats-view__danger-2 {
  color: #dc2626;
}
[data-theme="light"] .stats-view__text-5 {
  color: var(--app-text-soft);
}
[data-theme="light"] .stats-view__text--muted {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__text-tracked {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__block-23 {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__block-24 {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__text-cached-entries {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__text-estimated-size {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__text-18 {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__text-19 {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__text-20 {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__text-23 {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__muted-2 {
  color: var(--app-muted);
}
[data-theme="light"] .stats-view__text-publish {
  color: var(--app-text-soft);
}
[data-theme="light"] .stats-view__text-8 {
  color: var(--app-text-soft);
}
[data-theme="light"] .stats-view__text-connect {
  color: var(--app-text-soft);
}
[data-theme="light"] .stats-view__text-11 {
  color: var(--app-text-soft);
}
[data-theme="light"] .stats-view__text-query {
  color: var(--app-text-soft);
}
[data-theme="light"] .stats-view__text-14 {
  color: var(--app-text-soft);
}
[data-theme="light"] .stats-view__text-last-error {
  color: var(--app-text-soft);
}
[data-theme="light"] .stats-view__block-21:hover {
  background-color: var(--app-surface-hover) !important;
}
[data-theme="light"] .stats-view__block-34:hover {
  background-color: var(--app-surface-hover) !important;
}
}
}
</style>
