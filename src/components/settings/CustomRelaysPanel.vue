<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowUpRight,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "@/icons";
import {
  addCustomRelay,
  getCustomRelays,
  normalizeRelay,
  probeRelayConnections,
  removeCustomRelay,
} from "@/lib/relay";
import { DEFAULT_RELAYS, saveConfiguredRelays } from "@/config/servers";
import { getRelayHealthSummary, getRelayScores } from "@/lib/idb";
import { RELAY_RECOMMENDED_MIN } from "@/lib/relayNudge";
import RelayCard from "./RelayCard.vue";

const customRelays = ref([]);
const newRelayUrl = ref("");
const adding = ref(false);
const probing = ref(false);
const errorKey = ref("");
const healthByUrl = ref({});
const scoresByUrl = ref({});

function load() {
  customRelays.value = getCustomRelays();
}

async function loadStats() {
  try {
    // Health is the observed traffic; the score is the write ranking the
    // sender uses. Both are local, so they load in one pass.
    const [health, scores] = await Promise.all([getRelayHealthSummary(), getRelayScores()]);
    const nextHealth = {};
    for (const row of health) {
      if (row?.relay) nextHealth[row.relay] = row;
    }
    healthByUrl.value = nextHealth;
    scoresByUrl.value = scores && typeof scores === "object" ? scores : {};
  } catch {
    // stale data is fine
  }
}

function latencyFor(traffic) {
  if (!traffic) return null;
  const values = [traffic.avgPublishMs, traffic.avgQueryMs, traffic.avgConnectMs].filter(
    (value) => Number(value) > 0,
  );
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + Number(value), 0) / values.length);
}

const rows = computed(() =>
  customRelays.value.map((url, index) => {
    const traffic = healthByUrl.value[url] || null;
    const score = scoresByUrl.value[url] || null;
    const writes = Number(score?.writeSamples) || 0;
    return {
      url,
      index,
      label: url.replace(/^https?:\/\//i, ""),
      tier: traffic?.tier || "unknown",
      score: writes > 0 && Number.isFinite(Number(score?.writeScore)) ? Number(score.writeScore) : null,
      latencyMs: latencyFor(traffic),
      publishRate: traffic?.publishSuccessRate ?? null,
      queryRate: traffic?.querySuccessRate ?? null,
      batteryMode: traffic?.batteryMode || null,
      lastError: traffic?.lastError || null,
    };
  }),
);

const failingRows = computed(() =>
  rows.value.filter((row) => row.tier === "poor" || row.tier === "offline"),
);

const failingLabel = computed(() =>
  failingRows.value.length === 1 ? "1 relay is failing" : `${failingRows.value.length} relays are failing`,
);

onMounted(() => {
  load();
  loadStats();
  if (typeof window !== "undefined") {
    window.addEventListener("gupt:relays-changed", handleRelaysChanged);
  }
});

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("gupt:relays-changed", handleRelaysChanged);
  }
});

/** Relay edits can come from here, invites, probes, or the suggestions panel. */
function handleRelaysChanged() {
  load();
  loadStats();
}

function handleAdd() {
  const raw = newRelayUrl.value.trim();
  errorKey.value = "";
  if (!raw) return;

  const normalized = normalizeRelay(raw);
  if (!normalized) {
    errorKey.value = "invalid";
    return;
  }
  if (customRelays.value.includes(normalized)) {
    errorKey.value = "duplicate";
    return;
  }

  adding.value = true;
  try {
    addCustomRelay(raw);
    newRelayUrl.value = "";
    load();
    loadStats();
  } finally {
    adding.value = false;
  }
}

function handleRemove(url) {
  removeCustomRelay(url);
  load();
  loadStats();
}

function handleResetDefaults() {
  saveConfiguredRelays(DEFAULT_RELAYS);
  load();
  loadStats();
}

async function handleProbe() {
  if (probing.value || !customRelays.value.length) return;
  probing.value = true;
  try {
    await probeRelayConnections(customRelays.value, { detailed: true });
    await loadStats();
  } finally {
    probing.value = false;
  }
}
</script>

<template>
  <div class="relays-panel">
    <div class="relays-panel__head">
      <p class="relays-panel__count">
        {{ customRelays.length }} configured
        <template v-if="customRelays.length < RELAY_RECOMMENDED_MIN">
          <span class="relays-panel__count-sep">·</span>
          <span class="relays-panel__count-recommended">{{ RELAY_RECOMMENDED_MIN }} recommended</span>
        </template>
      </p>
      <div class="relays-panel__actions">
        <button
          type="button"
          class="relays-panel__action"
          title="Probe every relay now"
          :disabled="probing || !customRelays.length"
          @click="handleProbe"
        >
          <RefreshCw :class="{ 'relays-panel__spin': probing }" :stroke-width="2" aria-hidden="true" />
          Probe
        </button>
        <button
          type="button"
          class="relays-panel__action"
          title="Reset to the default relays"
          @click="handleResetDefaults"
        >
          <RotateCcw :stroke-width="2" aria-hidden="true" />
          Reset
        </button>
      </div>
    </div>

    <div v-if="failingRows.length" class="relays-panel__warning" role="status">
      <TriangleAlert :stroke-width="2" aria-hidden="true" />
      <div class="relays-panel__warning-copy">
        <p class="relays-panel__warning-title">{{ failingLabel }}</p>
        <p class="relays-panel__warning-text">
          Sends still go to every relay, so messages may not sync. Probe again or replace these
          nodes.
        </p>
      </div>
      <button
        type="button"
        class="relays-panel__warning-action"
        :disabled="probing"
        @click="handleProbe"
      >
        Probe
      </button>
    </div>

    <div v-if="rows.length" class="relays-panel__grid">
      <RelayCard
        v-for="row in rows"
        :key="row.url"
        :relay="row"
        :index="row.index"
        @remove="handleRemove"
      />
    </div>
    <p v-else class="relays-panel__empty">No relays configured.</p>

    <form class="relays-panel__add" @submit.prevent="handleAdd">
      <input
        v-model="newRelayUrl"
        type="url"
        class="relays-panel__field"
        placeholder="https://relay.example.com"
        aria-label="Relay URL"
        spellcheck="false"
      />
      <button
        type="submit"
        class="relays-panel__add-button"
        :disabled="!newRelayUrl.trim() || adding"
      >
        <LoaderCircle v-if="adding" class="relays-panel__spin" :stroke-width="2" aria-hidden="true" />
        <Plus v-else :stroke-width="2" aria-hidden="true" />
        Add
      </button>
    </form>

    <p v-if="errorKey === 'invalid'" class="relays-panel__error" role="alert">
      Enter a valid Rabta node URL (https://…)
    </p>
    <p v-else-if="errorKey === 'duplicate'" class="relays-panel__error" role="alert">
      This relay is already in the list.
    </p>

    <RouterLink to="/stats" class="relays-panel__analytics">
      Detailed relay analytics
      <ArrowUpRight :stroke-width="2" aria-hidden="true" />
    </RouterLink>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

.relays-panel {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  min-width: 0;
}

.relays-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 2);
}

.relays-panel__count {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.relays-panel__count-sep {
  margin-inline: 4px;
  color: var(--app-muted-2);
}

.relays-panel__count-recommended {
  color: var(--app-warning);
}

.relays-panel__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing);
}

.relays-panel__action,
.relays-panel__warning-action,
.relays-panel__add-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 calc(var(--spacing) * 2.5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.relays-panel__action svg,
.relays-panel__warning-action svg,
.relays-panel__add-button svg,
.relays-panel__analytics svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.relays-panel__action:active,
.relays-panel__warning-action:active,
.relays-panel__add-button:active {
  scale: 0.98;
}

.relays-panel__action:disabled,
.relays-panel__warning-action:disabled,
.relays-panel__add-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.relays-panel__warning {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  border: 1px solid color-mix(in oklab, var(--app-warning) 30%, transparent);
  border-radius: var(--app-radius-md);
  background-color: var(--app-warning-soft);
}

.relays-panel__warning > svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--app-warning);
}

.relays-panel__warning-copy {
  flex: 1;
  min-width: 0;
}

.relays-panel__warning-title {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--app-warning-strong);
}

.relays-panel__warning-text {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 1.5;
  color: var(--app-text-soft);
}

.relays-panel__warning-action {
  flex-shrink: 0;
  border-color: color-mix(in oklab, var(--app-warning) 35%, transparent);
  color: var(--app-warning-strong);
}

.relays-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: calc(var(--spacing) * 2.5);
  min-width: 0;
}

.relays-panel__empty {
  margin: 0;
  padding-block: calc(var(--spacing) * 4);
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-muted);
}

.relays-panel__add {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  min-width: 0;
}

.relays-panel__field {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding-inline: calc(var(--spacing) * 3);
  border: 1px dashed var(--app-border-quiet);
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
}

.relays-panel__field::placeholder {
  color: var(--app-muted-2);
}

.relays-panel__field:focus {
  border-style: solid;
  border-color: var(--app-border-strong);
  outline: none;
}

.relays-panel__add-button {
  flex-shrink: 0;
  color: var(--app-text-soft);
  background-color: var(--app-surface-tint);
}

.relays-panel__error {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-danger);
}

.relays-panel__analytics {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  min-height: 44px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted);
  text-decoration: none;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.relays-panel__spin {
  animation: var(--animate-spin);
}

@keyframes relays-panel-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.relays-panel__head,
.relays-panel__warning,
.relays-panel__grid,
.relays-panel__add,
.relays-panel__analytics {
  animation: relays-panel-fade-in var(--app-dur-base) var(--app-ease-out) both;
}

@media (hover: hover) {
  .relays-panel__action:hover,
  .relays-panel__add-button:hover {
    color: var(--app-text);
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised-tint);
  }

  .relays-panel__warning-action:hover {
    color: var(--app-warning);
    border-color: color-mix(in oklab, var(--app-warning) 55%, transparent);
  }

  .relays-panel__analytics:hover {
    color: var(--app-text);
  }
}

.relays-panel__action:focus-visible,
.relays-panel__warning-action:focus-visible,
.relays-panel__add-button:focus-visible,
.relays-panel__analytics:focus-visible,
.relays-panel__field:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

@media (max-width: 30rem) {
  .relays-panel__field {
    height: 44px;
  }

  .relays-panel__grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .relays-panel__head,
  .relays-panel__warning,
  .relays-panel__grid,
  .relays-panel__add,
  .relays-panel__analytics {
    animation: none;
  }
}

[data-theme="light"] .relays-panel__count {
  color: var(--app-muted);
}

[data-theme="light"] .relays-panel__count-recommended,
[data-theme="light"] .relays-panel__warning > svg {
  color: var(--app-warning-strong);
}

[data-theme="light"] .relays-panel__warning-title,
[data-theme="light"] .relays-panel__warning-action {
  color: var(--app-warning-strong);
}

[data-theme="light"] .relays-panel__field {
  border-color: var(--app-border-quiet);
}

[data-theme="light"] .relays-panel__add-button {
  background-color: var(--app-surface-tint);
  color: var(--app-text-soft);
}
</style>
