<script setup>
import { ref, computed, onMounted, watch } from "vue";
import {
  RefreshCw,
  Play,
  Pause,
  Plus,
  Radio,
  CircleAlert,
} from "@/icons";

import PageHeader from "@/components/PageHeader.vue";
import { useRabtaSyncStore } from "@/stores/rabtaSync";
import { DEFAULT_RELAYS } from "@/config/servers";
import { countLocalRawEvents } from "@/lib/idb";
import RabtaServerTable from "@/components/rabta/RabtaServerTable.vue";
import RabtaSyncBudgetChart from "@/components/rabta/RabtaSyncBudgetChart.vue";
import RabtaSyncLogs from "@/components/rabta/RabtaSyncLogs.vue";

const rabtaSync = useRabtaSyncStore();

const newServerUrl = ref("");
const addError = ref("");
const isAdding = ref(false);
const localEventsCount = ref(null);

async function refreshLocalCount() {
  try {
    localEventsCount.value = await countLocalRawEvents();
  } catch {
    localEventsCount.value = null;
  }
}

onMounted(() => {
  refreshLocalCount();
});

watch(
  () => rabtaSync.lastSyncAt,
  () => {
    refreshLocalCount();
  },
);

const isDefaultServer = (url) => DEFAULT_RELAYS.includes(url);

const consistencyBadgeClass = computed(() => {
  const pct = rabtaSync.consistencyPct;
  if (pct >= 95) return "rabta-sync-view__success";
  if (pct >= 70) return "rabta-sync-view__warning";
  return "rabta-sync-view__danger";
});

function handleAddServer() {
  const url = newServerUrl.value.trim().replace(/\/+$/, "");
  addError.value = "";
  if (!url) return;

  if (!/^https?:\/\//i.test(url)) {
    addError.value = "Server URL must start with https:// or http://";
    return;
  }

  isAdding.value = true;
  try {
    rabtaSync.addServer(url);
    newServerUrl.value = "";
    rabtaSync.triggerSyncNow();
  } catch (err) {
    addError.value = err?.message || "Failed to add server";
  } finally {
    isAdding.value = false;
  }
}

function handleRemoveServer(url) {
  rabtaSync.removeServer(url);
}

function formatAgo(ts) {
  if (!ts) return "never";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
</script>

<template>
  <div class="rabta-sync">
    <main class="rabta-sync__main">
      <PageHeader eyebrow="Mesh" title="Rabta sync">
        <p class="rabta-sync__lede">
          Independent background worker syncing events and blobs between all Rabta servers.
        </p>
        <template #actions>
          <span
            class="rabta-sync__cadence"
            :title="`Syncs at most 50 budget units per run (text = 1, blob = 10), then waits a random delay of 10s to 30s`"
          >
            <span class="rabta-sync__cadence-key">Wait</span>
            <span class="rabta-sync__cadence-value">
              <template v-if="!rabtaSync.isAutoSync">Paused</template>
              <template v-else-if="rabtaSync.isSyncing">Syncing…</template>
              <template v-else-if="rabtaSync.nextWaitSec">~{{ rabtaSync.nextWaitSec }}s</template>
              <template v-else>10–30s</template>
            </span>
            <span class="rabta-sync__cadence-hint">· max 50</span>
          </span>

          <button
            type="button"
            class="mesh-action"
            :title="rabtaSync.isAutoSync ? 'Pause auto-sync' : 'Resume auto-sync'"
            @click="rabtaSync.toggleAutoSync"
          >
            <component
              :is="rabtaSync.isAutoSync ? Pause : Play"
              class="mesh-action__icon"
              :stroke-width="2"
              aria-hidden="true"
            />
            <span>{{ rabtaSync.isAutoSync ? "Pause" : "Resume" }}</span>
          </button>

          <button
            type="button"
            :disabled="rabtaSync.isSyncing"
            class="mesh-action mesh-action--ink"
            @click="rabtaSync.triggerSyncNow"
          >
            <RefreshCw
              class="mesh-action__icon"
              :class="{ 'mesh-action__icon--spin': rabtaSync.isSyncing }"
              :stroke-width="2"
              aria-hidden="true"
            />
            <span>{{ rabtaSync.isSyncing ? "Syncing…" : "Sync now" }}</span>
          </button>
        </template>
      </PageHeader>

      <!-- Error & Auto-Restart Recovery Banner -->
      <div v-if="rabtaSync.lastError || rabtaSync.status === 'error'" class="mesh-note" role="alert">
        <CircleAlert class="mesh-note__icon" :stroke-width="2" aria-hidden="true" />
        <div class="mesh-note__body">
          <p class="mesh-note__title">Worker Exception</p>
          <p v-if="rabtaSync.lastError" class="mesh-note__meta mesh-note__meta--error">
            {{ rabtaSync.lastError }}
          </p>
          <p v-if="rabtaSync.restartCountdown" class="mesh-note__meta">
            Auto-recovering fresh worker thread in {{ rabtaSync.restartCountdown }}s (attempt #{{ rabtaSync.crashCount }})…
          </p>
          <p v-else-if="rabtaSync.crashCount > 0" class="mesh-note__meta">
            Recovery in progress…
          </p>
        </div>
        <button type="button" class="mesh-note__action" @click="rabtaSync.restartWorkerNow">
          Restart Worker Now
        </button>
      </div>

      <!-- Metrics -->
      <section class="mesh-metrics">
        <div class="mesh-hero">
          <div class="mesh-hero__head">
            <div class="mesh-hero__label">
              <span class="mesh-hero__pulse" :class="{ 'mesh-hero__pulse--live': rabtaSync.isSyncing }" aria-hidden="true" />
              Our total events on mesh
            </div>
            <span class="mesh-hero__nodes">
              {{ rabtaSync.onlineServers }} / {{ rabtaSync.totalServers }} nodes
            </span>
          </div>

          <div class="mesh-hero__figure">
            <span class="mesh-hero__value">{{ rabtaSync.ourTotalEvents.toLocaleString() }}</span>
            <span class="mesh-hero__caption">total distinct events</span>
            <span class="mesh-hero__badge" :class="consistencyBadgeClass">
              {{ rabtaSync.consistencyPct }}% consistency
            </span>
          </div>

          <div class="mesh-hero__foot">
            <span :title="`${rabtaSync.ourOutboundEvents} sent by us · ${rabtaSync.ourInboundEvents} addressed to us`">
              {{ rabtaSync.ourOutboundEvents }} sent · {{ rabtaSync.ourInboundEvents }} received
            </span>
            <span v-if="localEventsCount != null" title="Events stored in local IndexedDB on this device">
              device local: {{ localEventsCount }}
            </span>
          </div>
        </div>

        <div class="mesh-stats">
          <div class="mesh-stat">
            <span class="mesh-stat__label">Consistency</span>
            <span class="mesh-stat__value">{{ rabtaSync.consistencyPct }}%</span>
            <p class="mesh-stat__note">
              {{ rabtaSync.consistencyPct === 100 ? "Fully in sync" : "Reconciling" }}
            </p>
          </div>

          <div class="mesh-stat">
            <span class="mesh-stat__label">Events synced</span>
            <span class="mesh-stat__value">
              {{ rabtaSync.totalEventsSynced.toLocaleString() }}
              <span v-if="rabtaSync.eventsSynced > 0" class="mesh-stat__delta">+{{ rabtaSync.eventsSynced }}</span>
            </span>
            <p class="mesh-stat__note">replicated missing</p>
          </div>

          <div class="mesh-stat">
            <span class="mesh-stat__label">Blobs synced</span>
            <span class="mesh-stat__value">
              {{ rabtaSync.totalBlobsSynced.toLocaleString() }}
              <span v-if="rabtaSync.blobsSynced > 0" class="mesh-stat__delta">+{{ rabtaSync.blobsSynced }}</span>
            </span>
            <p
              v-if="rabtaSync.totalBlobsSkippedQuota > 0"
              class="mesh-stat__note mesh-stat__note--warning"
              :title="`${rabtaSync.totalBlobsSkippedQuota} blobs skipped because target relay storage limit was reached`"
            >
              {{ rabtaSync.totalBlobsSkippedQuota }} quota-safe
            </p>
            <p v-else class="mesh-stat__note">{{ rabtaSync.totalBlobsResumed }} resumed</p>
          </div>

          <div class="mesh-stat">
            <span class="mesh-stat__label">Round #{{ rabtaSync.round || 0 }}</span>
            <span class="mesh-stat__value">{{ formatAgo(rabtaSync.lastSyncAt) }}</span>
            <p v-if="rabtaSync.durationMs" class="mesh-stat__note">in {{ rabtaSync.durationMs }}ms</p>
            <p v-else class="mesh-stat__note">cadence active</p>
          </div>
        </div>
      </section>

      <!-- Sync Budget Utilization Chart -->
      <RabtaSyncBudgetChart
        :history="rabtaSync.syncHistory"
        :current-budget-used="rabtaSync.budgetUsed"
        :max-budget="rabtaSync.maxBudgetPerRun"
      />

      <!-- Adaptive Range Bisection Telemetry -->
      <section class="mesh-bisection">
        <div class="mesh-bisection__head">
          <div class="mesh-bisection__title">
            <span class="mesh-bisection__dot" aria-hidden="true" />
            Adaptive range bisection active
          </div>
          <span class="mesh-bisection__mode">1-probe matching</span>
        </div>

        <dl class="mesh-facts">
          <div class="mesh-fact" :title="`${rabtaSync.bisection?.rangesMatched || 0} ranges verified in 1 query`">
            <dt>Verified</dt>
            <dd>{{ rabtaSync.bisection?.rangesMatched || 0 }}</dd>
          </div>
          <div class="mesh-fact" :title="`${rabtaSync.bisection?.rangesBisected || 0} divergences split recursively`">
            <dt>Bisected</dt>
            <dd>{{ rabtaSync.bisection?.rangesBisected || 0 }}</dd>
          </div>
          <div class="mesh-fact" :title="`${rabtaSync.bisection?.leafReconciled || 0} leaf windows reconciled`">
            <dt>Leafs synced</dt>
            <dd>{{ rabtaSync.bisection?.leafReconciled || 0 }}</dd>
          </div>
          <div class="mesh-fact" :title="`${rabtaSync.bisection?.probesUsed || 0} total count probes executed`">
            <dt>Probes</dt>
            <dd>{{ rabtaSync.bisection?.probesUsed || 0 }}</dd>
          </div>
          <div class="mesh-fact" :title="`${rabtaSync.bisection?.blobsSkippedQuota || 0} blobs quota protected`">
            <dt>Quota safe</dt>
            <dd>{{ rabtaSync.bisection?.blobsSkippedQuota || 0 }}</dd>
          </div>
          <div class="mesh-fact" :title="`${rabtaSync.bisection?.blobsResumed || 0} blob transfers resumed via HTTP Range`">
            <dt>Range resumed</dt>
            <dd>{{ rabtaSync.bisection?.blobsResumed || 0 }}</dd>
          </div>
          <div
            v-if="rabtaSync.bisection?.batteryBackoffs > 0"
            class="mesh-fact mesh-fact--warning"
            :title="`${rabtaSync.bisection?.batteryBackoffs} sync queries backed off for constrained battery`"
          >
            <dt>Battery backoff</dt>
            <dd>{{ rabtaSync.bisection?.batteryBackoffs }}</dd>
          </div>
        </dl>
      </section>

      <!-- Connected Server Mesh Nodes -->
      <section class="mesh-servers">
        <div class="mesh-section-head">
          <h2 class="mesh-section-title">Connected mesh nodes</h2>
          <span class="mesh-section-meta">{{ rabtaSync.onlineServers }} / {{ rabtaSync.totalServers }} online</span>
        </div>

        <RabtaServerTable
          :servers="rabtaSync.servers"
          :default-relays="DEFAULT_RELAYS"
          @remove="handleRemoveServer"
        />

        <div class="mesh-add">
          <div class="mesh-add__row">
            <input
              v-model="newServerUrl"
              type="url"
              placeholder="https://my-rabta-node.example.com"
              class="mesh-add__field"
              aria-label="New relay URL"
              @keydown.enter="handleAddServer"
            />
            <button
              type="button"
              :disabled="!newServerUrl.trim() || isAdding"
              class="mesh-action mesh-action--ink"
              @click="handleAddServer"
            >
              <Plus class="mesh-action__icon" :stroke-width="2" aria-hidden="true" />
              Add node
            </button>
          </div>
          <p v-if="addError" class="mesh-add__error">{{ addError }}</p>
        </div>
      </section>

      <!-- Live Sync Logs -->
      <RabtaSyncLogs :logs="rabtaSync.logs" @clear="rabtaSync.clearLogs" />
    </main>
  </div>
</template>

<style scoped>
/* Ledger pass: the mesh dashboard reads as measured telemetry, not cards. */

.rabta-sync {
  min-height: 100vh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.rabta-sync__main {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 860px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.rabta-sync__lede {
  max-width: 60ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.rabta-sync__cadence {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-right: var(--app-space-2);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.rabta-sync__cadence-key {
  color: var(--app-border-strong);
}

.rabta-sync__cadence-value {
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.rabta-sync__cadence-hint {
  color: var(--app-muted-2);
}

.mesh-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 32px;
  padding-inline: 11px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.mesh-action__icon {
  width: 12px;
  height: 12px;
}

.mesh-action__icon--spin {
  animation: spin 1s linear infinite;
}

.mesh-action:disabled {
  opacity: 0.45;
  cursor: default;
}

.mesh-action--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.mesh-note {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: 12px 14px;
  border: 1px solid color-mix(in oklab, var(--app-danger) 30%, var(--app-border));
  border-left: 2px solid var(--app-danger);
  border-radius: var(--app-radius-md);
  background: var(--app-danger-soft);
}

.mesh-note__icon {
  width: 14px;
  height: 14px;
  margin-top: 2px;
  color: var(--app-danger);
}

.mesh-note__body {
  flex: 1;
  min-width: 0;
}

.mesh-note__title {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.mesh-note__meta {
  margin: 3px 0 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--app-muted);
}

.mesh-note__meta--error {
  font-size: 10px;
  color: var(--app-danger);
  overflow-wrap: anywhere;
}

.mesh-note__action {
  min-height: 26px;
  padding-inline: 8px;
  border: 1px solid color-mix(in oklab, var(--app-danger) 34%, var(--app-border));
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-danger);
  cursor: pointer;
}

.mesh-metrics {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.mesh-hero {
  display: flex;
  flex-direction: column;
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 480ms var(--app-ease-emphasized) both;
}

.mesh-hero__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
}

.mesh-hero__label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.mesh-hero__pulse {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-success);
}

.mesh-hero__pulse--live {
  background: var(--app-warning);
  animation: ledger-dot-pulse 1.4s var(--app-ease-standard) infinite;
}

.mesh-hero__nodes {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.mesh-hero__figure {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  margin-top: var(--app-space-4);
}

.mesh-hero__value {
  font-size: 34px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.mesh-hero__caption {
  font-size: 11.5px;
  color: var(--app-muted);
}

.mesh-hero__badge {
  margin-left: auto;
  padding: 2px 7px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.rabta-sync-view__success {
  border-color: color-mix(in oklab, var(--app-success) 32%, var(--app-border));
  background: var(--app-success-soft);
  color: var(--app-success);
}

.rabta-sync-view__warning {
  border-color: color-mix(in oklab, var(--app-warning) 32%, var(--app-border));
  background: var(--app-warning-soft);
  color: var(--app-warning);
}

.rabta-sync-view__danger {
  border-color: color-mix(in oklab, var(--app-danger) 32%, var(--app-border));
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

.mesh-hero__foot {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: var(--app-space-4);
  padding-top: var(--app-space-3);
  border-top: 1px solid var(--app-border);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.mesh-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-rise 480ms var(--app-ease-emphasized) 60ms both;
}

.mesh-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
}

.mesh-stat:nth-child(even) {
  border-left: 1px solid var(--app-border);
}

.mesh-stat:nth-child(n + 3) {
  border-top: 1px solid var(--app-border);
}

.mesh-stat__label {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.mesh-stat__value {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: 19px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.mesh-stat__delta {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  color: var(--app-success);
}

.mesh-stat__note {
  margin: 0;
  font-size: 10.5px;
  color: var(--app-muted-2);
}

.mesh-stat__note--warning {
  color: var(--app-warning);
}

.mesh-bisection {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}

.mesh-bisection__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-border);
}

.mesh-bisection__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-text);
}

.mesh-bisection__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-success);
}

.mesh-bisection__mode {
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.mesh-facts {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
}

.mesh-fact {
  flex: 1 1 50%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 14px;
  border-top: 1px solid var(--app-border);
}

.mesh-fact:nth-child(-n + 2) {
  border-top: 0;
}

.mesh-fact:nth-child(even) {
  border-left: 1px solid var(--app-border);
}

.mesh-fact dt {
  font-size: 10.5px;
  color: var(--app-muted);
}

.mesh-fact dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.mesh-fact--warning dd {
  color: var(--app-warning);
}

.mesh-servers {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.mesh-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-2);
}

.mesh-section-title {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.mesh-section-meta {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.mesh-add {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mesh-add__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mesh-add__field {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding-inline: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.mesh-add__field::placeholder {
  color: var(--app-muted-2);
}

.mesh-add__field:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.mesh-add__error {
  margin: 0;
  font-size: 11px;
  color: var(--app-danger);
}

@media (min-width: 40rem) {
  .rabta-sync__main {
    padding-inline: var(--app-space-6);
  }

  .mesh-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .mesh-stat:nth-child(n + 2) {
    border-top: 0;
  }

  .mesh-stat:nth-child(n + 2) {
    border-left: 1px solid var(--app-border);
  }

  .mesh-fact {
    flex-basis: 33.333%;
  }

  .mesh-fact:nth-child(3) {
    border-top: 0;
  }

  .mesh-fact:nth-child(3n + 1) {
    border-left: 0;
  }

  .mesh-fact:nth-child(n + 4) {
    border-top: 1px solid var(--app-border);
  }
}

@media (max-width: 30rem) {
  .rabta-sync__cadence-hint,
  .rabta-sync__cadence-key {
    display: none;
  }

  .mesh-hero__badge {
    margin-left: 0;
  }

  .mesh-add__row .mesh-action {
    width: 100%;
  }
}

@media (hover: hover) {
  .mesh-action:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .mesh-action--ink:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .mesh-note__action:hover {
    border-color: var(--app-danger);
  }
}

@media (pointer: coarse) {
  .mesh-action,
  .mesh-note__action {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rabta-sync,
  .mesh-hero,
  .mesh-stats,
  .mesh-hero__pulse--live,
  .mesh-action__icon--spin {
    animation: none;
  }

  .mesh-action,
  .mesh-add__field {
    transition: none;
  }
}
</style>
