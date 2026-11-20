<script setup>
import { ref, computed, onMounted, watch } from "vue";
import {
  RefreshCw,
  Play,
  Pause,
  Plus,
  Radio,
  Layers,
  HardDrive,
  Activity,
  ShieldCheck,
  CircleAlert,
  Database,
} from "@lucide/vue";

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
  <div class="rabta-sync-view__block">
    <main class="rabta-sync-view__main">
      <!-- Header section -->
      <header
        class="rabta-sync-view__header"
      >
        <div class="rabta-sync-view__block-2">
          <div
            class="rabta-sync-view__block-3"
          >
            <Radio class="rabta-sync-view__radio" :stroke-width="2" />
          </div>
          <div class="rabta-sync-view__block-4">
            <h1 class="rabta-sync-view__title-rabta-server">
              Rabta Server Mesh
            </h1>
            <p class="rabta-sync-view__text">
              Independent background worker syncing events and blobs between all Rabta servers.
            </p>
          </div>
        </div>

        <!-- Controls: Sync Now, Pause/Resume, Cadence -->
        <div class="rabta-sync-view__block-5">
          <!-- Dynamic Random Cadence & Batch Policy Indicator -->
          <div
            class="rabta-sync-view__block-6"
            :title="`Syncs at most 50 budget units per run (text = 1, blob = 10), then waits a random delay of 10s to 30s`"
          >
            <span class="rabta-sync-view__text-wait">Wait</span>
            <span class="rabta-sync-view__text-2">
              <template v-if="!rabtaSync.isAutoSync">Paused</template>
              <template v-else-if="rabtaSync.isSyncing">Syncing…</template>
              <template v-else-if="rabtaSync.nextWaitSec">~{{ rabtaSync.nextWaitSec }}s</template>
              <template v-else>10s–30s</template>
            </span>
            <span class="rabta-sync-view__text-3">·</span>
            <span class="rabta-sync-view__text-4">max 50 budget (blob=10)</span>
          </div>

          <!-- Pause / Resume button -->
          <button
            type="button"
            class="rabta-sync-view__button"
            @click="rabtaSync.toggleAutoSync"
            :title="rabtaSync.isAutoSync ? 'Pause auto-sync' : 'Resume auto-sync'"
          >
            <component
              :is="rabtaSync.isAutoSync ? Pause : Play"
              class="rabta-sync-view__component"
              :stroke-width="2"
            />
            <span class="rabta-sync-view__text-5">{{ rabtaSync.isAutoSync ? "Pause" : "Resume" }}</span>
          </button>

          <!-- Sync Now button -->
          <button
            type="button"
            :disabled="rabtaSync.isSyncing"
            class="rabta-sync-view__button-2"
            @click="rabtaSync.triggerSyncNow"
          >
            <RefreshCw
              class="rabta-sync-view__refresh-cw"
              :class="{ 'rabta-sync-view__refresh-cw--spin': rabtaSync.isSyncing }"
              :stroke-width="2"
            />
            <span>{{ rabtaSync.isSyncing ? "Syncing…" : "Sync Now" }}</span>
          </button>
        </div>
      </header>

      <!-- Error & Auto-Restart Recovery Banner -->
      <div
        v-if="rabtaSync.lastError || rabtaSync.status === 'error'"
        class="rabta-sync-view__block-7"
      >
        <div class="rabta-sync-view__block-8">
          <CircleAlert class="rabta-sync-view__circle-alert" :stroke-width="2" />
          <div class="rabta-sync-view__block-9">
            <p class="rabta-sync-view__text-worker-exception">
              Worker Exception: {{ rabtaSync.lastError }}
            </p>
            <p v-if="rabtaSync.restartCountdown" class="rabta-sync-view__text-6">
              Auto-recovering fresh worker thread in {{ rabtaSync.restartCountdown }}s (attempt #{{ rabtaSync.crashCount }})…
            </p>
            <p v-else-if="rabtaSync.crashCount > 0" class="rabta-sync-view__text-7">
              Recovery in progress…
            </p>
          </div>
        </div>

        <button
          type="button"
          class="rabta-sync-view__button-restart-worker"
          @click="rabtaSync.restartWorkerNow"
        >
          <RefreshCw class="rabta-sync-view__refresh-cw-2" :stroke-width="2" />
          Restart Worker Now
        </button>
      </div>

      <!-- Quick Metrics in Single Column -->
      <section class="rabta-sync-view__section">
        <!-- Our Total Events (Hero Featured Card) -->
        <div
          class="rabta-sync-view__block-10"
        >
          <div class="rabta-sync-view__block-11">
            <div class="rabta-sync-view__block-12">
              <span class="rabta-sync-view__text-8">
                <span
                  class="rabta-sync-view__text-9"
                />
                <span class="rabta-sync-view__text-10" />
              </span>
              <span class="rabta-sync-view__text-our-total">
                Our Total Events on Mesh
              </span>
            </div>
            <span class="rabta-sync-view__text-11">
              {{ rabtaSync.onlineServers }} / {{ rabtaSync.totalServers }} nodes
            </span>
          </div>

          <div class="rabta-sync-view__block-13">
            <div class="rabta-sync-view__block-14">
              <span class="rabta-sync-view__text-12">
                {{ rabtaSync.ourTotalEvents.toLocaleString() }}
              </span>
              <span class="rabta-sync-view__text-total-distinct">
                total distinct events
              </span>
            </div>
            <span
              class="rabta-sync-view__text-13"
              :class="consistencyBadgeClass"
            >
              {{ rabtaSync.consistencyPct }}% consistency
            </span>
          </div>

          <div class="rabta-sync-view__block-15">
            <span :title="`${rabtaSync.ourOutboundEvents} sent by us · ${rabtaSync.ourInboundEvents} addressed to us`">
              {{ rabtaSync.ourOutboundEvents }} sent · {{ rabtaSync.ourInboundEvents }} received
            </span>
            <span v-if="localEventsCount != null" class="rabta-sync-view__text-events-stored" title="Events stored in local IndexedDB on this device">
              device local: {{ localEventsCount }}
            </span>
          </div>
        </div>

        <!-- 4-Stat Secondary Grid (2x2 on mobile, 4-across on desktop) -->
        <div class="rabta-sync-view__block-16">
          <!-- Pool Consistency -->
          <div class="rabta-sync-view__block-17">
            <span class="rabta-sync-view__text-consistency">
              Consistency
            </span>
            <div class="rabta-sync-view__block-18">
              <span class="rabta-sync-view__text-14">
                {{ rabtaSync.consistencyPct }}%
              </span>
            </div>
            <p class="rabta-sync-view__text-15">
              {{ rabtaSync.consistencyPct === 100 ? "Fully in sync" : "Reconciling" }}
            </p>
          </div>

          <!-- Cross-Synced -->
          <div class="rabta-sync-view__block-19">
            <span class="rabta-sync-view__text-events-synced">
              Events Synced
            </span>
            <div class="rabta-sync-view__block-20">
              <span class="rabta-sync-view__text-16">
                {{ rabtaSync.totalEventsSynced.toLocaleString() }}
              </span>
              <span v-if="rabtaSync.eventsSynced > 0" class="rabta-sync-view__text-17">
                (+{{ rabtaSync.eventsSynced }})
              </span>
            </div>
            <p class="rabta-sync-view__text-replicated-missing">
              replicated missing
            </p>
          </div>

          <!-- Blobs Synced -->
          <div class="rabta-sync-view__block-21">
            <span class="rabta-sync-view__text-blobs-synced">
              Blobs Synced
            </span>
            <div class="rabta-sync-view__block-22">
              <span class="rabta-sync-view__text-18">
                {{ rabtaSync.totalBlobsSynced.toLocaleString() }}
              </span>
              <span v-if="rabtaSync.blobsSynced > 0" class="rabta-sync-view__text-19">
                (+{{ rabtaSync.blobsSynced }})
              </span>
            </div>
            <p
              v-if="rabtaSync.totalBlobsSkippedQuota > 0"
              class="rabta-sync-view__text-quota-safe"
              :title="`${rabtaSync.totalBlobsSkippedQuota} blobs skipped because target relay storage limit was reached`"
            >
              {{ rabtaSync.totalBlobsSkippedQuota }} quota-safe
            </p>
            <p v-else class="rabta-sync-view__text-resumed">
              {{ rabtaSync.totalBlobsResumed }} resumed
            </p>
          </div>

          <!-- Last Sync / Round -->
          <div class="rabta-sync-view__block-23">
            <span class="rabta-sync-view__text-20">
              Round #{{ rabtaSync.round || 0 }}
            </span>
            <div class="rabta-sync-view__block-24">
              {{ formatAgo(rabtaSync.lastSyncAt) }}
            </div>
            <p class="rabta-sync-view__text-21" v-if="rabtaSync.durationMs">
              in {{ rabtaSync.durationMs }}ms
            </p>
            <p class="rabta-sync-view__text-cadence-active" v-else>
              cadence active
            </p>
          </div>
        </div>
      </section>

      <!-- Sync Budget Utilization Chart -->
      <RabtaSyncBudgetChart
        :history="rabtaSync.syncHistory"
        :current-budget-used="rabtaSync.budgetUsed"
        :max-budget="rabtaSync.maxBudgetPerRun"
      />

      <!-- Adaptive Range Bisection Telemetry Card -->
      <section class="rabta-sync-view__section-2">
        <div class="rabta-sync-view__block-25">
          <div class="rabta-sync-view__block-26">
            <span class="rabta-sync-view__text-22" />
            <span class="rabta-sync-view__text-23">Adaptive Range Bisection Active</span>
          </div>
          <span class="rabta-sync-view__text-1-probe">1-probe matching</span>
        </div>

        <div class="rabta-sync-view__block-27">
          <div :title="`${rabtaSync.bisection?.rangesMatched || 0} ranges verified in 1 query`">
            <span class="rabta-sync-view__text-verified">Verified:</span>
            <span class="rabta-sync-view__text-24">{{
              rabtaSync.bisection?.rangesMatched || 0
            }}</span>
          </div>
          <div :title="`${rabtaSync.bisection?.rangesBisected || 0} divergences split recursively`">
            <span class="rabta-sync-view__text-bisected">Bisected:</span>
            <span class="rabta-sync-view__text-25">{{
              rabtaSync.bisection?.rangesBisected || 0
            }}</span>
          </div>
          <div :title="`${rabtaSync.bisection?.leafReconciled || 0} leaf windows reconciled`">
            <span class="rabta-sync-view__text-leafs-synced">Leafs Synced:</span>
            <span class="rabta-sync-view__text-26">{{
              rabtaSync.bisection?.leafReconciled || 0
            }}</span>
          </div>
          <div :title="`${rabtaSync.bisection?.probesUsed || 0} total count probes executed`">
            <span class="rabta-sync-view__text-probes">Probes:</span>
            <span class="rabta-sync-view__text-27">{{
              rabtaSync.bisection?.probesUsed || 0
            }}</span>
          </div>
          <div :title="`${rabtaSync.bisection?.blobsSkippedQuota || 0} blobs quota protected`">
            <span class="rabta-sync-view__text-quota-safe-2">Quota Safe:</span>
            <span class="rabta-sync-view__text-28">{{
              rabtaSync.bisection?.blobsSkippedQuota || 0
            }}</span>
          </div>
          <div :title="`${rabtaSync.bisection?.blobsResumed || 0} blob transfers resumed via HTTP Range`">
            <span class="rabta-sync-view__text-range-resumed">Range Resumed:</span>
            <span class="rabta-sync-view__text-29">{{
              rabtaSync.bisection?.blobsResumed || 0
            }}</span>
          </div>
          <div
            v-if="rabtaSync.bisection?.batteryBackoffs > 0"
            class="rabta-sync-view__block-28"
            :title="`${rabtaSync.bisection?.batteryBackoffs} sync queries backed off for constrained battery`"
          >
            <span class="rabta-sync-view__text-battery-backoff">Battery Backoff:</span>
            <span class="rabta-sync-view__text-30">{{ rabtaSync.bisection?.batteryBackoffs }}</span>
          </div>
        </div>
      </section>

      <!-- Configured Rabta Servers in Single Column Stack -->
      <section class="rabta-sync-view__section-3">
        <div class="rabta-sync-view__block-29">
          <div class="rabta-sync-view__block-30">
            <h2 class="rabta-sync-view__subtitle">
              Connected Server Mesh Nodes
            </h2>
            <span class="rabta-sync-view__text-31">
              {{ rabtaSync.onlineServers }} / {{ rabtaSync.totalServers }} online
            </span>
          </div>
        </div>

        <!-- Minimal Connected Server Mesh Nodes Table -->
        <RabtaServerTable
          :servers="rabtaSync.servers"
          :default-relays="DEFAULT_RELAYS"
          @remove="handleRemoveServer"
        />

        <!-- Add Server Form -->
        <div class="rabta-sync-view__block-31">
          <div class="rabta-sync-view__block-32">
            <input
              v-model="newServerUrl"
              type="url"
              placeholder="https://my-rabta-node.example.com"
              class="rabta-sync-view__field-url"
              @keydown.enter="handleAddServer"
            />
            <button
              type="button"
              :disabled="!newServerUrl.trim() || isAdding"
              class="rabta-sync-view__button-add-node"
              @click="handleAddServer"
            >
              <Plus class="rabta-sync-view__plus" :stroke-width="2" />
              Add Node
            </button>
          </div>
          <p v-if="addError" class="rabta-sync-view__text-32">
            {{ addError }}
          </p>
        </div>
      </section>

      <!-- Live Sync Logs -->
      <RabtaSyncLogs :logs="rabtaSync.logs" @clear="rabtaSync.clearLogs" />
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.rabta-sync-view__block-10:hover {
  border-color: #00bb7f80;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__block-10:hover {
  border-color: color-mix(in oklab,var(--color-emerald-500) 50%,transparent);
}
}
}

@media (hover:hover) {
.rabta-sync-view__button:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.rabta-sync-view__button-add-node:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.rabta-sync-view__button-2:hover {
  background-color: #00bb7f40;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__button-2:hover {
  background-color: color-mix(in oklab,var(--color-emerald-500) 25%,transparent);
}
}
}

@media (hover:hover) {
.rabta-sync-view__button-restart-worker:hover {
  background-color: #fb2c364d;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__button-restart-worker:hover {
  background-color: color-mix(in oklab,var(--color-red-500) 30%,transparent);
}
}
}

@media (hover:hover) {
.rabta-sync-view__button:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.rabta-sync-view__button-add-node:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.rabta-sync-view__button:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.rabta-sync-view__button-add-node:hover {
  color: var(--color-white);
}
}

@media (min-width:40rem) {
.rabta-sync-view__block-28 {
  grid-column: span 3/span 3;
}
}

@media (min-width:40rem) {
.rabta-sync-view__text-5 {
  display: inline;
}
}

@media (min-width:40rem) {
.rabta-sync-view__block-27 {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.rabta-sync-view__block-16 {
  grid-template-columns: repeat(4,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.rabta-sync-view__header {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.rabta-sync-view__block-7 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.rabta-sync-view__block-32 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.rabta-sync-view__header {
  align-items: center;
}
}

@media (min-width:40rem) {
.rabta-sync-view__block-7 {
  align-items: center;
}
}

@media (min-width:40rem) {
.rabta-sync-view__block-32 {
  align-items: center;
}
}

@media (min-width:40rem) {
.rabta-sync-view__header {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.rabta-sync-view__block-7 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.rabta-sync-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.rabta-sync-view__text-12 {
  font-size: var(--text-4xl);
  line-height: var(--leading,var(--text-4xl--line-height));
}
}

@media (min-width:48rem) {
.rabta-sync-view__block-28 {
  grid-column: span 6/span 6;
}
}

@media (min-width:48rem) {
.rabta-sync-view__block-27 {
  grid-template-columns: repeat(6,minmax(0,1fr));
}
}

@media (min-width:64rem) {
.rabta-sync-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.rabta-sync-view__text-9 {
  position: absolute;
}
.rabta-sync-view__text-8 {
  position: relative;
}
.rabta-sync-view__text-10 {
  position: relative;
}
.rabta-sync-view__block-28 {
  grid-column: span 2/span 2;
}
.rabta-sync-view__main {
  margin-inline: auto;
}
.rabta-sync-view__text {
  margin-top: calc(var(--spacing) * .5);
}
.rabta-sync-view__circle-alert {
  margin-top: calc(var(--spacing) * .5);
}
.rabta-sync-view__text-24 {
  margin-left: var(--spacing);
}
.rabta-sync-view__text-25 {
  margin-left: var(--spacing);
}
.rabta-sync-view__text-26 {
  margin-left: var(--spacing);
}
.rabta-sync-view__text-27 {
  margin-left: var(--spacing);
}
.rabta-sync-view__text-28 {
  margin-left: var(--spacing);
}
.rabta-sync-view__text-29 {
  margin-left: var(--spacing);
}
.rabta-sync-view__text-30 {
  margin-left: var(--spacing);
}
.rabta-sync-view__header {
  display: flex;
}
.rabta-sync-view__block-2 {
  display: flex;
}
.rabta-sync-view__block-3 {
  display: flex;
}
.rabta-sync-view__block-5 {
  display: flex;
}
.rabta-sync-view__block-6 {
  display: flex;
}
.rabta-sync-view__block-7 {
  display: flex;
}
.rabta-sync-view__block-8 {
  display: flex;
}
.rabta-sync-view__block-11 {
  display: flex;
}
.rabta-sync-view__block-12 {
  display: flex;
}
.rabta-sync-view__text-8 {
  display: flex;
}
.rabta-sync-view__block-13 {
  display: flex;
}
.rabta-sync-view__block-14 {
  display: flex;
}
.rabta-sync-view__block-15 {
  display: flex;
}
.rabta-sync-view__block-18 {
  display: flex;
}
.rabta-sync-view__block-20 {
  display: flex;
}
.rabta-sync-view__block-22 {
  display: flex;
}
.rabta-sync-view__block-25 {
  display: flex;
}
.rabta-sync-view__block-26 {
  display: flex;
}
.rabta-sync-view__text-22 {
  display: flex;
}
.rabta-sync-view__block-29 {
  display: flex;
}
.rabta-sync-view__block-30 {
  display: flex;
}
.rabta-sync-view__block-32 {
  display: flex;
}
.rabta-sync-view__block-16 {
  display: grid;
}
.rabta-sync-view__block-27 {
  display: grid;
}
.rabta-sync-view__text-5 {
  display: none;
}
.rabta-sync-view__button {
  display: inline-flex;
}
.rabta-sync-view__button-2 {
  display: inline-flex;
}
.rabta-sync-view__button-restart-worker {
  display: inline-flex;
}
.rabta-sync-view__text-9 {
  display: inline-flex;
}
.rabta-sync-view__text-10 {
  display: inline-flex;
}
.rabta-sync-view__button-add-node {
  display: inline-flex;
}
.rabta-sync-view__text-8 {
  height: calc(var(--spacing) * 2);
}
.rabta-sync-view__text-10 {
  height: calc(var(--spacing) * 2);
}
.rabta-sync-view__text-22 {
  height: calc(var(--spacing) * 2);
}
.rabta-sync-view__component {
  height: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__refresh-cw {
  height: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__refresh-cw-2 {
  height: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__plus {
  height: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__circle-alert {
  height: calc(var(--spacing) * 4);
}
.rabta-sync-view__radio {
  height: calc(var(--spacing) * 5);
}
.rabta-sync-view__block-3 {
  height: calc(var(--spacing) * 10);
}
.rabta-sync-view__text-9 {
  height: 100%;
}
.rabta-sync-view__button {
  min-height: 44px;
}
.rabta-sync-view__button-2 {
  min-height: 44px;
}
.rabta-sync-view__button-restart-worker {
  min-height: 44px;
}
.rabta-sync-view__field-url {
  min-height: 44px;
}
.rabta-sync-view__button-add-node {
  min-height: 44px;
}
.rabta-sync-view__block {
  min-height: 100vh;
}
.rabta-sync-view__text-8 {
  width: calc(var(--spacing) * 2);
}
.rabta-sync-view__text-10 {
  width: calc(var(--spacing) * 2);
}
.rabta-sync-view__text-22 {
  width: calc(var(--spacing) * 2);
}
.rabta-sync-view__component {
  width: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__refresh-cw {
  width: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__refresh-cw-2 {
  width: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__plus {
  width: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__circle-alert {
  width: calc(var(--spacing) * 4);
}
.rabta-sync-view__radio {
  width: calc(var(--spacing) * 5);
}
.rabta-sync-view__block-3 {
  width: calc(var(--spacing) * 10);
}
.rabta-sync-view__main {
  width: 100%;
}
.rabta-sync-view__text-9 {
  width: 100%;
}
.rabta-sync-view__main {
  max-width: var(--container-6xl);
}
.rabta-sync-view__block-2 {
  min-width: 0;
}
.rabta-sync-view__block-4 {
  min-width: 0;
}
.rabta-sync-view__block-8 {
  min-width: 0;
}
.rabta-sync-view__block-9 {
  min-width: 0;
}
.rabta-sync-view__field-url {
  min-width: 0;
}
.rabta-sync-view__field-url {
  flex: 1;
}
.rabta-sync-view__block-3 {
  flex-shrink: 0;
}
.rabta-sync-view__circle-alert {
  flex-shrink: 0;
}
.rabta-sync-view__button-restart-worker {
  flex-shrink: 0;
}
.rabta-sync-view__button-add-node {
  flex-shrink: 0;
}
.rabta-sync-view__text-9 {
  animation: var(--animate-ping);
}
.rabta-sync-view__refresh-cw--spin {
  animation: var(--animate-spin);
}
.rabta-sync-view__button {
  cursor: pointer;
}
.rabta-sync-view__button-2 {
  cursor: pointer;
}
.rabta-sync-view__button-restart-worker {
  cursor: pointer;
}
.rabta-sync-view__button-add-node {
  cursor: pointer;
}
.rabta-sync-view__block-16 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
.rabta-sync-view__block-27 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
.rabta-sync-view__header {
  flex-direction: column;
}
.rabta-sync-view__block-7 {
  flex-direction: column;
}
.rabta-sync-view__block-32 {
  flex-direction: column;
}
.rabta-sync-view__block-5 {
  flex-wrap: wrap;
}
.rabta-sync-view__block-13 {
  align-items: baseline;
}
.rabta-sync-view__block-14 {
  align-items: baseline;
}
.rabta-sync-view__block-18 {
  align-items: baseline;
}
.rabta-sync-view__block-20 {
  align-items: baseline;
}
.rabta-sync-view__block-22 {
  align-items: baseline;
}
.rabta-sync-view__block-2 {
  align-items: center;
}
.rabta-sync-view__block-3 {
  align-items: center;
}
.rabta-sync-view__block-5 {
  align-items: center;
}
.rabta-sync-view__block-6 {
  align-items: center;
}
.rabta-sync-view__button {
  align-items: center;
}
.rabta-sync-view__button-2 {
  align-items: center;
}
.rabta-sync-view__button-restart-worker {
  align-items: center;
}
.rabta-sync-view__block-11 {
  align-items: center;
}
.rabta-sync-view__block-12 {
  align-items: center;
}
.rabta-sync-view__block-15 {
  align-items: center;
}
.rabta-sync-view__block-25 {
  align-items: center;
}
.rabta-sync-view__block-26 {
  align-items: center;
}
.rabta-sync-view__block-29 {
  align-items: center;
}
.rabta-sync-view__block-30 {
  align-items: center;
}
.rabta-sync-view__button-add-node {
  align-items: center;
}
.rabta-sync-view__block-8 {
  align-items: flex-start;
}
.rabta-sync-view__block-11 {
  justify-content: space-between;
}
.rabta-sync-view__block-13 {
  justify-content: space-between;
}
.rabta-sync-view__block-15 {
  justify-content: space-between;
}
.rabta-sync-view__block-25 {
  justify-content: space-between;
}
.rabta-sync-view__block-29 {
  justify-content: space-between;
}
.rabta-sync-view__block-3 {
  justify-content: center;
}
.rabta-sync-view__button {
  justify-content: center;
}
.rabta-sync-view__button-2 {
  justify-content: center;
}
.rabta-sync-view__button-restart-worker {
  justify-content: center;
}
.rabta-sync-view__button-add-node {
  justify-content: center;
}
.rabta-sync-view__button {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-view__button-2 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-view__button-restart-worker {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-view__block-18 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-view__block-20 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-view__block-22 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-view__button-add-node {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-view__block-5 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-6 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-12 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-13 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-14 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-25 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-26 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-27 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-30 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-32 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-8 {
  gap: calc(var(--spacing) * 2.5);
}
.rabta-sync-view__block-2 {
  gap: calc(var(--spacing) * 3);
}
.rabta-sync-view__block-7 {
  gap: calc(var(--spacing) * 3);
}
.rabta-sync-view__block-16 {
  gap: calc(var(--spacing) * 3);
}
.rabta-sync-view__header {
  gap: calc(var(--spacing) * 4);
}
:where(.rabta-sync-view__block-17>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.rabta-sync-view__block-19>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.rabta-sync-view__block-21>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.rabta-sync-view__block-23>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.rabta-sync-view__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.rabta-sync-view__block-31>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.rabta-sync-view__section-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2.5) * calc(1 - 0));
}
:where(.rabta-sync-view__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.rabta-sync-view__section-3>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.rabta-sync-view__main>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.rabta-sync-view__title-rabta-server {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-view__text {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-view__text-15 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-view__text-replicated-missing {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-view__text-quota-safe {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-view__text-resumed {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-view__text-21 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-view__text-cadence-active {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-view__text-13 {
  border-radius: .25rem;
}
.rabta-sync-view__text-31 {
  border-radius: .25rem;
}
.rabta-sync-view__text-9 {
  border-radius: 3.40282e38px;
}
.rabta-sync-view__text-10 {
  border-radius: 3.40282e38px;
}
.rabta-sync-view__text-22 {
  border-radius: 3.40282e38px;
}
.rabta-sync-view__block-6 {
  border-radius: var(--radius-lg);
}
.rabta-sync-view__button {
  border-radius: var(--radius-lg);
}
.rabta-sync-view__button-2 {
  border-radius: var(--radius-lg);
}
.rabta-sync-view__button-restart-worker {
  border-radius: var(--radius-lg);
}
.rabta-sync-view__field-url {
  border-radius: var(--radius-lg);
}
.rabta-sync-view__button-add-node {
  border-radius: var(--radius-lg);
}
.rabta-sync-view__block-3 {
  border-radius: var(--radius-xl);
}
.rabta-sync-view__block-7 {
  border-radius: var(--radius-xl);
}
.rabta-sync-view__block-10 {
  border-radius: var(--radius-xl);
}
.rabta-sync-view__block-17 {
  border-radius: var(--radius-xl);
}
.rabta-sync-view__block-19 {
  border-radius: var(--radius-xl);
}
.rabta-sync-view__block-21 {
  border-radius: var(--radius-xl);
}
.rabta-sync-view__block-23 {
  border-radius: var(--radius-xl);
}
.rabta-sync-view__section-2 {
  border-radius: var(--radius-xl);
}
.rabta-sync-view__block-31 {
  border-radius: var(--radius-xl);
}
.rabta-sync-view__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__block-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__button-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__block-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__button-restart-worker {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__block-10 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__text-13 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__block-17 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__block-19 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__block-21 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__block-23 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__section-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__block-31 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__field-url {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__button-add-node {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-view__block-15 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.rabta-sync-view__block-27 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.rabta-sync-view__header {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.rabta-sync-view__block-31 {
  --border-style: dashed;
  border-style: dashed;
}
.rabta-sync-view__warning {
  border-color: #f99c0033;
}
.rabta-sync-view__block-15 {
  border-color: #00bb7f33;
}
.rabta-sync-view__success {
  border-color: #00bb7f33;
}
.rabta-sync-view__block-10 {
  border-color: #00bb7f4d;
}
.rabta-sync-view__button-2 {
  border-color: #00bb7f66;
}
.rabta-sync-view__danger {
  border-color: #fb2c3633;
}
.rabta-sync-view__block-7 {
  border-color: #fb2c364d;
}
.rabta-sync-view__button-restart-worker {
  border-color: #fb2c3666;
}
.rabta-sync-view__block-6 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-view__button {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-view__block-31 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-view__field-url {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-view__button-add-node {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-view__block-27 {
  border-color: var(--app-border-faint);
}
.rabta-sync-view__header {
  border-color: var(--app-border-quiet);
}
.rabta-sync-view__block-3 {
  border-color: var(--app-border-quiet);
}
.rabta-sync-view__block-17 {
  border-color: var(--app-border-quiet);
}
.rabta-sync-view__block-19 {
  border-color: var(--app-border-quiet);
}
.rabta-sync-view__block-21 {
  border-color: var(--app-border-quiet);
}
.rabta-sync-view__block-23 {
  border-color: var(--app-border-quiet);
}
.rabta-sync-view__section-2 {
  border-color: var(--app-border-quiet);
}
.rabta-sync-view__warning {
  background-color: var(--app-warning-soft);
}
.rabta-sync-view__block {
  background-color: var(--ui-black);
}
.rabta-sync-view__text-9 {
  background-color: var(--color-emerald-400);
}
.rabta-sync-view__text-10 {
  background-color: var(--color-emerald-400);
}
.rabta-sync-view__text-22 {
  background-color: var(--color-emerald-400);
}
.rabta-sync-view__success {
  background-color: #00bb7f1a;
}
.rabta-sync-view__button-2 {
  background-color: #00bb7f26;
}
.rabta-sync-view__block-7 {
  background-color: var(--app-danger-soft);
}
.rabta-sync-view__danger {
  background-color: var(--app-danger-soft);
}
.rabta-sync-view__button-restart-worker {
  background-color: #fb2c3633;
}
.rabta-sync-view__text-31 {
  background-color: var(--ui-zinc-800);
}
.rabta-sync-view__block-31 {
  background-color: var(--ui-zinc-900);
}
.rabta-sync-view__section-2 {
  background-color: var(--ui-zinc-900);
}
.rabta-sync-view__block-17 {
  background-color: var(--app-surface-tint-soft);
}
.rabta-sync-view__block-19 {
  background-color: var(--app-surface-tint-soft);
}
.rabta-sync-view__block-21 {
  background-color: var(--app-surface-tint-soft);
}
.rabta-sync-view__block-23 {
  background-color: var(--app-surface-tint-soft);
}
.rabta-sync-view__block-6 {
  background-color: var(--app-surface-tint);
}
.rabta-sync-view__button {
  background-color: var(--app-surface-tint);
}
.rabta-sync-view__button-add-node {
  background-color: var(--ui-zinc-900);
}
.rabta-sync-view__block-3 {
  background-color: var(--app-surface-inset);
}
.rabta-sync-view__field-url {
  background-color: var(--ui-zinc-950);
}
.rabta-sync-view__block-10 {
  --gradient-position: to bottom right in oklab;
  background-image: linear-gradient(var(--gradient-stops,));
}
.rabta-sync-view__block-10 {
  --gradient-from: #00bb7f1a;
}
.rabta-sync-view__block-10 {
  --gradient-stops: var(--gradient-via-stops,var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--gradient-to,#0000) var(--gradient-to-position,100%));
}
.rabta-sync-view__block-10 {
  --gradient-via: var(--ui-zinc-900);
}
.rabta-sync-view__block-10 {
  --gradient-via-stops: var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--gradient-via,#0000) var(--gradient-via-position,50%), var(--gradient-to,#0000) var(--gradient-to-position,100%);
  --gradient-stops: var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--gradient-via,#0000) var(--gradient-via-position,50%), var(--gradient-to,#0000) var(--gradient-to-position,100%);
}
.rabta-sync-view__block-10 {
  --gradient-to: var(--ui-zinc-900);
}
.rabta-sync-view__block-17 {
  padding: calc(var(--spacing) * 3);
}
.rabta-sync-view__block-19 {
  padding: calc(var(--spacing) * 3);
}
.rabta-sync-view__block-21 {
  padding: calc(var(--spacing) * 3);
}
.rabta-sync-view__block-23 {
  padding: calc(var(--spacing) * 3);
}
.rabta-sync-view__block-7 {
  padding: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__section-2 {
  padding: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__block-31 {
  padding: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__block-10 {
  padding: calc(var(--spacing) * 4);
}
.rabta-sync-view__text-13 {
  padding-inline: calc(var(--spacing) * 2);
}
.rabta-sync-view__text-31 {
  padding-inline: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-6 {
  padding-inline: calc(var(--spacing) * 3);
}
.rabta-sync-view__button {
  padding-inline: calc(var(--spacing) * 3);
}
.rabta-sync-view__button-restart-worker {
  padding-inline: calc(var(--spacing) * 3);
}
.rabta-sync-view__field-url {
  padding-inline: calc(var(--spacing) * 3);
}
.rabta-sync-view__button-2 {
  padding-inline: calc(var(--spacing) * 3.5);
}
.rabta-sync-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.rabta-sync-view__button-add-node {
  padding-inline: calc(var(--spacing) * 4);
}
.rabta-sync-view__text-13 {
  padding-block: calc(var(--spacing) * .5);
}
.rabta-sync-view__text-31 {
  padding-block: calc(var(--spacing) * .5);
}
.rabta-sync-view__block-6 {
  padding-block: calc(var(--spacing) * 1.5);
}
.rabta-sync-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.rabta-sync-view__block-15 {
  padding-top: calc(var(--spacing) * 2);
}
.rabta-sync-view__block-27 {
  padding-top: calc(var(--spacing) * 2.5);
}
.rabta-sync-view__header {
  padding-bottom: calc(var(--spacing) * 5);
}
.rabta-sync-view__block {
  padding-bottom: calc(var(--spacing) * 16);
}
.rabta-sync-view__block-6 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-worker-exception {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-6 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-7 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-our-total {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-11 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-12 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-total-distinct {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-13 {
  font-family: var(--font-mono);
}
.rabta-sync-view__block-15 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-consistency {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-14 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-15 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-events-synced {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-16 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-17 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-replicated-missing {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-blobs-synced {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-18 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-19 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-quota-safe {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-resumed {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-20 {
  font-family: var(--font-mono);
}
.rabta-sync-view__block-24 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-21 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-cadence-active {
  font-family: var(--font-mono);
}
.rabta-sync-view__section-2 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-31 {
  font-family: var(--font-mono);
}
.rabta-sync-view__field-url {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-32 {
  font-family: var(--font-mono);
}
.rabta-sync-view__text-12 {
  font-size: var(--text-3xl);
  line-height: var(--leading,var(--text-3xl--line-height));
}
.rabta-sync-view__title-rabta-server {
  font-size: var(--text-lg);
  line-height: var(--leading,var(--text-lg--line-height));
}
.rabta-sync-view__subtitle {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.rabta-sync-view__text-14 {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.rabta-sync-view__text-16 {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.rabta-sync-view__text-18 {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.rabta-sync-view__block-24 {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.rabta-sync-view__text {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__block-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__text-worker-exception {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__button-restart-worker {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__text-our-total {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__text-11 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__text-total-distinct {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__block-15 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__text-17 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__text-19 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__section-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__text-31 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__field-url {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__button-add-node {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__text-32 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-view__text-wait {
  font-size: 10px;
}
.rabta-sync-view__text-13 {
  font-size: 10px;
}
.rabta-sync-view__text-consistency {
  font-size: 10px;
}
.rabta-sync-view__text-15 {
  font-size: 10px;
}
.rabta-sync-view__text-events-synced {
  font-size: 10px;
}
.rabta-sync-view__text-replicated-missing {
  font-size: 10px;
}
.rabta-sync-view__text-blobs-synced {
  font-size: 10px;
}
.rabta-sync-view__text-quota-safe {
  font-size: 10px;
}
.rabta-sync-view__text-resumed {
  font-size: 10px;
}
.rabta-sync-view__text-20 {
  font-size: 10px;
}
.rabta-sync-view__text-21 {
  font-size: 10px;
}
.rabta-sync-view__text-cadence-active {
  font-size: 10px;
}
.rabta-sync-view__text-1-probe {
  font-size: 10px;
}
.rabta-sync-view__text-4 {
  font-size: 11px;
}
.rabta-sync-view__text-6 {
  font-size: 11px;
}
.rabta-sync-view__text-7 {
  font-size: 11px;
}
.rabta-sync-view__block-27 {
  font-size: 11px;
}
.rabta-sync-view__text-12 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.rabta-sync-view__text-14 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.rabta-sync-view__text-16 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.rabta-sync-view__text-18 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.rabta-sync-view__block-24 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.rabta-sync-view__text-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-sync-view__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-sync-view__button-restart-worker {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-sync-view__button-add-node {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-sync-view__title-rabta-server {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__button-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-worker-exception {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-our-total {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-13 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-23 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-24 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-25 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-26 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-27 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-28 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-29 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__text-30 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__subtitle {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-view__title-rabta-server {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.rabta-sync-view__subtitle {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.rabta-sync-view__text-our-total {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-sync-view__text-consistency {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-sync-view__text-events-synced {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-sync-view__text-blobs-synced {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-sync-view__text-20 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-sync-view__text-worker-exception {
  overflow-wrap: break-word;
}
.rabta-sync-view__text-2 {
  color: var(--color-amber-300);
}
.rabta-sync-view__text-25 {
  color: var(--color-amber-400);
}
.rabta-sync-view__block-28 {
  color: var(--color-amber-400);
}
.rabta-sync-view__warning {
  color: var(--color-amber-400);
}
.rabta-sync-view__text-quota-safe {
  color: #fcbb00e6;
}
.rabta-sync-view__button-2 {
  color: var(--color-emerald-300);
}
.rabta-sync-view__block-3 {
  color: var(--color-emerald-400);
}
.rabta-sync-view__text-our-total {
  color: var(--color-emerald-400);
}
.rabta-sync-view__text-17 {
  color: var(--color-emerald-400);
}
.rabta-sync-view__text-19 {
  color: var(--color-emerald-400);
}
.rabta-sync-view__text-24 {
  color: var(--color-emerald-400);
}
.rabta-sync-view__text-28 {
  color: var(--color-emerald-400);
}
.rabta-sync-view__text-29 {
  color: var(--color-emerald-400);
}
.rabta-sync-view__success {
  color: var(--color-emerald-400);
}
.rabta-sync-view__button-restart-worker {
  color: var(--color-red-200);
}
.rabta-sync-view__text-worker-exception {
  color: var(--color-red-300);
}
.rabta-sync-view__circle-alert {
  color: var(--color-red-400);
}
.rabta-sync-view__text-32 {
  color: var(--color-red-400);
}
.rabta-sync-view__danger {
  color: var(--color-red-400);
}
.rabta-sync-view__text-6 {
  color: #ff6568cc;
}
.rabta-sync-view__text-7 {
  color: #ff6568cc;
}
.rabta-sync-view__title-rabta-server {
  color: var(--color-white);
}
.rabta-sync-view__block {
  color: var(--ui-zinc-100);
}
.rabta-sync-view__text-12 {
  color: var(--ui-zinc-100);
}
.rabta-sync-view__text-14 {
  color: var(--ui-zinc-100);
}
.rabta-sync-view__text-16 {
  color: var(--ui-zinc-100);
}
.rabta-sync-view__text-18 {
  color: var(--ui-zinc-100);
}
.rabta-sync-view__block-24 {
  color: var(--ui-zinc-100);
}
.rabta-sync-view__field-url {
  color: var(--ui-zinc-100);
}
.rabta-sync-view__text-23 {
  color: var(--ui-zinc-200);
}
.rabta-sync-view__text-26 {
  color: var(--ui-zinc-200);
}
.rabta-sync-view__subtitle {
  color: var(--ui-zinc-200);
}
.rabta-sync-view__button-add-node {
  color: var(--ui-zinc-200);
}
.rabta-sync-view__block-6 {
  color: var(--ui-zinc-300);
}
.rabta-sync-view__button {
  color: var(--ui-zinc-300);
}
.rabta-sync-view__text {
  color: var(--ui-zinc-400);
}
.rabta-sync-view__text-4 {
  color: var(--ui-zinc-400);
}
.rabta-sync-view__text-11 {
  color: var(--ui-zinc-400);
}
.rabta-sync-view__text-total-distinct {
  color: var(--ui-zinc-400);
}
.rabta-sync-view__block-15 {
  color: var(--ui-zinc-400);
}
.rabta-sync-view__section-2 {
  color: var(--ui-zinc-400);
}
.rabta-sync-view__text-27 {
  color: var(--ui-zinc-400);
}
.rabta-sync-view__text-31 {
  color: var(--ui-zinc-400);
}
.rabta-sync-view__text-wait {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-events-stored {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-consistency {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-15 {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-events-synced {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-replicated-missing {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-blobs-synced {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-resumed {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-20 {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-21 {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-cadence-active {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-1-probe {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-verified {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-bisected {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-leafs-synced {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-probes {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-quota-safe-2 {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-range-resumed {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-battery-backoff {
  color: var(--ui-zinc-500);
}
.rabta-sync-view__text-3 {
  color: var(--ui-zinc-600);
}
.rabta-sync-view__text-wait {
  text-transform: uppercase;
}
.rabta-sync-view__text-our-total {
  text-transform: uppercase;
}
.rabta-sync-view__text-consistency {
  text-transform: uppercase;
}
.rabta-sync-view__text-events-synced {
  text-transform: uppercase;
}
.rabta-sync-view__text-blobs-synced {
  text-transform: uppercase;
}
.rabta-sync-view__text-20 {
  text-transform: uppercase;
}
.rabta-sync-view__block-27 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-sync-view__text-9 {
  opacity: .75;
}
.rabta-sync-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-view__button-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-view__block-7 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-view__block-10 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-view__button-restart-worker {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-view__field-url {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-view__button-add-node {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-view__block-10 {
  --duration: .2s;
  transition-duration: .2s;
}
.rabta-sync-view__field-url::placeholder {
  color: var(--ui-zinc-600);
}
.rabta-sync-view__field-url:focus {
  border-color: var(--ui-zinc-700);
}
.rabta-sync-view__field-url:focus {
  --outline-style: none;
  outline-style: none;
}
.rabta-sync-view__button:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.rabta-sync-view__button-2:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.rabta-sync-view__button-restart-worker:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.rabta-sync-view__button-add-node:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.rabta-sync-view__button-add-node:disabled {
  opacity: .4;
}
.rabta-sync-view__button-2:disabled {
  opacity: .5;
}
[data-theme="light"] .rabta-sync-view__text-2 {
  color: var(--app-warning-strong);
}
[data-theme="light"] .rabta-sync-view__text-25 {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-sync-view__block-28 {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-sync-view__warning {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-sync-view__button-2 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-view__block-3 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-view__text-our-total {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-view__text-17 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-view__text-19 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-view__text-24 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-view__text-28 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-view__text-29 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-view__success {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-view__button-restart-worker {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-sync-view__text-worker-exception {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-sync-view__circle-alert {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-sync-view__text-32 {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-sync-view__danger {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-sync-view__block-6 {
  color: var(--app-text-soft);
}
[data-theme="light"] .rabta-sync-view__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .rabta-sync-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-11 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-total-distinct {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__block-15 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__section-2 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-27 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-31 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-wait {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-events-stored {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-consistency {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-15 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-events-synced {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-replicated-missing {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-blobs-synced {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-resumed {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-20 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-21 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-cadence-active {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-1-probe {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-verified {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-bisected {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-leafs-synced {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-probes {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-quota-safe-2 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-range-resumed {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-battery-backoff {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-view__text-3 {
  color: var(--app-text-soft);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__warning {
  border-color: color-mix(in oklab,var(--color-amber-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__block-15 {
  border-color: color-mix(in oklab,var(--color-emerald-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__success {
  border-color: color-mix(in oklab,var(--color-emerald-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__block-10 {
  border-color: color-mix(in oklab,var(--color-emerald-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__button-2 {
  border-color: color-mix(in oklab,var(--color-emerald-500) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__danger {
  border-color: color-mix(in oklab,var(--color-red-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__block-7 {
  border-color: color-mix(in oklab,var(--color-red-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__button-restart-worker {
  border-color: color-mix(in oklab,var(--color-red-500) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__success {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__button-2 {
  background-color: color-mix(in oklab,var(--color-emerald-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__button-restart-worker {
  background-color: color-mix(in oklab,var(--color-red-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__block-31 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__section-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__button-add-node {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__block-10 {
  --gradient-from: color-mix(in oklab, var(--color-emerald-500) 10%, transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__block-10 {
  --gradient-via: color-mix(in oklab, var(--ui-zinc-900) 60%, transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__block-10 {
  --gradient-to: color-mix(in oklab, var(--ui-zinc-900) 40%, transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__text-quota-safe {
  color: color-mix(in oklab,var(--color-amber-400) 90%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__text-6 {
  color: color-mix(in oklab,var(--color-red-400) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-view__text-7 {
  color: color-mix(in oklab,var(--color-red-400) 80%,transparent);
}
}
}
</style>
