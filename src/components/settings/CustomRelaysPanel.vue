<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Check, Copy, Globe, LoaderCircle, Plus, RefreshCw, RotateCcw, TriangleAlert } from "@/icons";
import { copyToClipboard } from "@/lib/clipboard";
import { useIdentityStore } from "@/stores/identity";
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
const identityStore = useIdentityStore();
const copiedPolicy = ref(false);
let copiedPolicyTimer = null;

const policyEnv = computed(() => {
  const pubkey = identityStore.pubkeyHex;
  if (!pubkey) return "";
  return `POLICY='${JSON.stringify({ rules: [{ owner: [`ed25519:${pubkey}`] }, { labels: [pubkey] }] })}'`;
});

const selfHostCommand = computed(() => {
  if (!policyEnv.value) return "";
  return [
    "docker run -d \\",
    "  --name rabta \\",
    "  -p 127.0.0.1:3232:3232 \\",
    "  -v rabta-data:/data \\",
    "  --restart unless-stopped \\",
    "  -e STORAGE=20GB \\",
    `  -e ${policyEnv.value} \\`,
    "  ghcr.io/rabta-protocol/rabta:latest",
  ].join("\n");
});

function copyPolicyCommand() {
  if (!selfHostCommand.value) return;
  copiedPolicy.value = true;
  clearTimeout(copiedPolicyTimer);
  copiedPolicyTimer = setTimeout(() => (copiedPolicy.value = false), 2000);
  void copyToClipboard(selfHostCommand.value).catch(() => {
    copiedPolicy.value = false;
  });
}

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
      connectRate: traffic?.connectSuccessRate ?? null,
      stats: traffic,
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
  void identityStore.init();
  if (typeof window !== "undefined") {
    window.addEventListener("gupt:relays-changed", handleRelaysChanged);
  }
});

onUnmounted(() => {
  clearTimeout(copiedPolicyTimer);
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

    <div class="relays-panel__add-block">
      <div class="relays-panel__add-copy">
        <p class="relays-panel__add-title">Add a relay</p>
        <p class="relays-panel__add-hint">
          Any Rabta node URL — for example https://rabta.example.com.
          <a
            class="relays-panel__link"
            href="https://github.com/besoeasy/rabta"
            target="_blank"
            rel="noopener noreferrer"
          >Run your own relay</a>.
        </p>
      </div>
      <form class="relays-panel__add" @submit.prevent="handleAdd">
        <Globe class="relays-panel__add-icon" :stroke-width="1.8" aria-hidden="true" />
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
          :aria-label="adding ? 'Adding relay' : 'Add relay'"
          :disabled="!newRelayUrl.trim() || adding"
        >
          <LoaderCircle v-if="adding" class="relays-panel__spin" :stroke-width="2" aria-hidden="true" />
          <Plus v-else :stroke-width="2" aria-hidden="true" />
          Add
        </button>
      </form>
    </div>

    <p v-if="errorKey === 'invalid'" class="relays-panel__error" role="alert">
      Enter a valid Rabta node URL (https://…)
    </p>
    <p v-else-if="errorKey === 'duplicate'" class="relays-panel__error" role="alert">
      This relay is already in the list.
    </p>

    <div v-if="selfHostCommand" class="relays-panel__selfhost">
      <div class="relays-panel__selfhost-head">
        <div class="relays-panel__selfhost-copy">
          <p class="relays-panel__selfhost-title">Run your own relay</p>
          <p class="relays-panel__selfhost-hint">
            Prefilled with a POLICY filter that prioritises your Gupt account.
          </p>
        </div>
        <button
          type="button"
          class="relays-panel__action"
          :aria-label="copiedPolicy ? 'Copied command' : 'Copy command'"
          @click="copyPolicyCommand"
        >
          <Check v-if="copiedPolicy" :stroke-width="2" aria-hidden="true" />
          <Copy v-else :stroke-width="1.9" aria-hidden="true" />
          {{ copiedPolicy ? "Copied" : "Copy" }}
        </button>
      </div>
      <pre class="relays-panel__code"><code>{{ selfHostCommand }}</code></pre>
    </div>
  </div>
</template>

<style scoped>

.relays-panel {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  min-width: 0;
}

.relays-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
}

.relays-panel__count {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
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
  gap: var(--app-space-2);
}

.relays-panel__action,
.relays-panel__warning-action,
.relays-panel__add-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 var(--app-space-3);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-swift);
}

.relays-panel__action svg,
.relays-panel__warning-action svg,
.relays-panel__add-button svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.relays-panel__action:active,
.relays-panel__warning-action:active,
.relays-panel__add-button:active {
  scale: 0.97;
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
  gap: var(--app-space-3);
  padding: var(--app-space-4);
  border: 1px solid color-mix(in oklab, var(--app-warning) 30%, var(--app-border));
  border-radius: var(--app-radius-md);
  background-color: var(--app-warning-soft);
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
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
  font-size: var(--app-text-meta);
  font-weight: 600;
  color: var(--app-warning-strong);
}

.relays-panel__warning-text {
  margin: 3px 0 0;
  font-size: var(--app-text-meta);
  line-height: var(--app-leading-body);
  color: var(--app-text-soft);
}

.relays-panel__warning-action {
  flex-shrink: 0;
  border-color: color-mix(in oklab, var(--app-warning) 35%, transparent);
  color: var(--app-warning-strong);
}

.relays-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--app-space-4);
  min-width: 0;
}

.relays-panel__empty {
  margin: 0;
  padding-block: var(--app-space-6);
  text-align: center;
  font-size: var(--app-text-body);
  color: var(--app-muted);
}

.relays-panel__add-block {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding-top: var(--app-space-5);
  border-top: 1px solid var(--app-border);
}

.relays-panel__add-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.relays-panel__add-title {
  margin: 0;
  font-size: var(--app-text-body);
  font-weight: 500;
  color: var(--app-text);
}

.relays-panel__add-hint {
  margin: 0;
  font-size: 11.5px;
  line-height: var(--app-leading-body);
  color: var(--app-muted);
}

.relays-panel__add {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background-color: var(--app-surface-soft);
  transition:
    border-color var(--app-dur-base) var(--app-ease-standard),
    box-shadow var(--app-dur-base) var(--app-ease-standard),
    background-color var(--app-dur-base) var(--app-ease-standard);
}

.relays-panel__add:focus-within {
  border-color: var(--app-primary);
  background-color: var(--app-surface);
  box-shadow: var(--app-focus-ring);
}

.relays-panel__add-icon {
  width: 16px;
  height: 16px;
  margin-inline-start: 8px;
  flex-shrink: 0;
  color: var(--app-muted-2);
}

.relays-panel__field {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding-inline: 6px;
  border: 0;
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: var(--app-text-meta);
  color: var(--app-text);
}

.relays-panel__field::placeholder {
  color: var(--app-muted-2);
}

.relays-panel__field:focus {
  outline: none;
}

.relays-panel__add-button {
  flex-shrink: 0;
  min-height: 34px;
  padding-inline: var(--app-space-4);
  border: 0;
  border-radius: calc(var(--app-radius-sm) - 2px);
  background-color: var(--app-primary);
  color: var(--app-bg);
  font-weight: 500;
}

.relays-panel__add-button:disabled {
  background-color: var(--app-surface-raised-tint);
  color: var(--app-muted);
  cursor: default;
}

.relays-panel__error {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--app-danger);
}

.relays-panel__link {
  color: var(--app-primary);
  text-decoration: underline;
  text-decoration-color: color-mix(in oklab, var(--app-primary) 35%, transparent);
  text-underline-offset: 2px;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.relays-panel__selfhost {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding-top: var(--app-space-5);
  border-top: 1px solid var(--app-border);
}

.relays-panel__selfhost-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.relays-panel__selfhost-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.relays-panel__selfhost-title {
  margin: 0;
  font-size: var(--app-text-body);
  font-weight: 500;
  color: var(--app-text);
}

.relays-panel__selfhost-hint {
  margin: 0;
  font-size: 11.5px;
  line-height: var(--app-leading-body);
  color: var(--app-muted);
}

.relays-panel__code {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.8;
  color: var(--app-text-soft);
  overflow-x: auto;
  white-space: pre;
  tab-size: 2;
}

.relays-panel__code code {
  font: inherit;
}

.relays-panel__spin {
  animation: spin 1s linear infinite;
}

.relays-panel__head {
  animation: ledger-fade 320ms var(--app-ease-standard) both;
}

.relays-panel__grid {
  animation: ledger-fade 420ms var(--app-ease-standard) 60ms backwards;
}

@media (hover: hover) {
  .relays-panel__link:hover {
    color: var(--app-primary-strong);
  }

  .relays-panel__action:hover {
    color: var(--app-text);
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-soft);
  }

  .relays-panel__add-button:not(:disabled):hover {
    background-color: var(--app-primary-strong);
    box-shadow: var(--app-glow-primary);
  }

  .relays-panel__warning-action:hover {
    color: var(--app-warning-strong);
    border-color: color-mix(in oklab, var(--app-warning) 55%, transparent);
    background-color: color-mix(in oklab, var(--app-warning) 10%, transparent);
  }
}

.relays-panel__action:focus-visible,
.relays-panel__warning-action:focus-visible,
.relays-panel__add-button:focus-visible,
.relays-panel__field:focus-visible,
.relays-panel__link:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}

@media (pointer: coarse) {
  .relays-panel__action,
  .relays-panel__warning-action,
  .relays-panel__add-button {
    min-height: var(--app-touch-h);
  }
}

@media (max-width: 30rem) {
  .relays-panel__grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .relays-panel__head,
  .relays-panel__warning,
  .relays-panel__grid {
    animation: none;
  }
}


</style>
