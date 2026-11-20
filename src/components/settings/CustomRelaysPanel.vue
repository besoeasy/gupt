<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowUpRight,
  ChevronDown,
  LoaderCircle,
  Plus,
  RotateCcw,
  RefreshCw,
  TriangleAlert,
} from "@lucide/vue";
import {
  getCustomRelays,
  addCustomRelay,
  removeCustomRelay,
  normalizeRelay,
  probeRelayConnections,
} from "@/lib/relay";
import { saveConfiguredRelays, DEFAULT_RELAYS } from "@/config/servers";
import { getRelayHealthSummary } from "@/lib/idb";
import { RELAY_RECOMMENDED_MIN } from "@/lib/relayNudge";
import { formatTrafficRate, tierBadgeClass, tierDotClass } from "@/lib/relay";

const customRelays = ref([]);
const newRelayUrl = ref("");
const adding = ref(false);
const probing = ref(false);
const errorKey = ref("");
const relayTrafficByUrl = ref({});
const expandedUrl = ref("");

function load() {
  customRelays.value = getCustomRelays();
  if (expandedUrl.value && !customRelays.value.includes(expandedUrl.value)) {
    expandedUrl.value = "";
  }
}

async function loadStats() {
  try {
    const health = await getRelayHealthSummary();
    const next = {};
    for (const row of health) {
      if (row?.relay) next[row.relay] = row;
    }
    relayTrafficByUrl.value = next;
  } catch {
    // stale data is fine
  }
}

function trafficFor(url) {
  return relayTrafficByUrl.value[String(url || "")] || null;
}

function rateTextClass(rate) {
  if (rate === null || rate === undefined) return "custom-relays-panel__muted";
  if (rate >= 80) return "custom-relays-panel__success";
  if (rate >= 50) return "custom-relays-panel__warning";
  return "custom-relays-panel__danger";
}

function tierLabel(tier) {
  if (tier === "good") return "Good";
  if (tier === "degraded") return "Degraded";
  if (tier === "poor") return "Poor";
  return "New";
}

function latencyFor(traffic) {
  if (!traffic) return null;
  const values = [traffic.avgPublishMs, traffic.avgQueryMs, traffic.avgConnectMs].filter(
    (value) => Number(value) > 0,
  );
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + Number(value), 0) / values.length);
}

function latencyTitle(traffic) {
  if (!traffic) return "";
  const parts = [];
  if (traffic.avgPublishMs) parts.push(`publish ${traffic.avgPublishMs} ms`);
  if (traffic.avgQueryMs) parts.push(`query ${traffic.avgQueryMs} ms`);
  if (traffic.avgConnectMs) parts.push(`connect ${traffic.avgConnectMs} ms`);
  return parts.join(" · ");
}

const rows = computed(() =>
  customRelays.value.map((url) => {
    const traffic = trafficFor(url);
    return {
      url,
      label: url.replace(/^https?:\/\//i, ""),
      traffic,
      tier: traffic?.tier || "unknown",
      latencyMs: latencyFor(traffic),
    };
  }),
);

const poorRelays = computed(() => rows.value.filter((row) => row.tier === "poor"));
const poorRelayNames = computed(() => poorRelays.value.map((row) => row.label).join(", "));

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

function toggleRow(url) {
  expandedUrl.value = expandedUrl.value === url ? "" : url;
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
  <div class="custom-relays-panel__block">
    <div class="custom-relays-panel__block-2">
      <p class="custom-relays-panel__text-configured">
        {{ customRelays.length }} configured
        <template v-if="customRelays.length < RELAY_RECOMMENDED_MIN">
          <span class="custom-relays-panel__text">·</span>
          <span class="custom-relays-panel__text-recommended">{{ RELAY_RECOMMENDED_MIN }} recommended</span>
        </template>
      </p>
      <div class="custom-relays-panel__block-3">
        <button
          type="button"
          class="custom-relays-panel__button-probe-every"
          title="Probe every relay now"
          :disabled="probing || !customRelays.length"
          @click="handleProbe"
        >
          <RefreshCw class="custom-relays-panel__refresh-cw" :class="probing ? 'custom-relays-panel__refresh-cw--spin' : ''" :stroke-width="2" />
          Probe
        </button>
        <button
          type="button"
          class="custom-relays-panel__button-reset-to"
          title="Reset to default relays"
          @click="handleResetDefaults"
        >
          <RotateCcw class="custom-relays-panel__rotate-ccw" :stroke-width="2" />
          Reset
        </button>
      </div>
    </div>

    <Transition
      enter-active-class="custom-relays-panel__enter-active-class"
      enter-from-class="custom-relays-panel__enter-from-class"
      enter-to-class="custom-relays-panel__enter-to-class"
      leave-active-class="custom-relays-panel__leave-active-class"
      leave-from-class="custom-relays-panel__leave-from-class"
      leave-to-class="custom-relays-panel__leave-to-class"
    >
      <div
        v-if="poorRelays.length"
        class="custom-relays-panel__status"
        role="status"
      >
        <div class="custom-relays-panel__block-4">
          <TriangleAlert class="custom-relays-panel__triangle-alert" :stroke-width="2" />
          <div class="custom-relays-panel__block-5">
            <p class="custom-relays-panel__text-2">
              {{ poorRelays.length }} configured
              {{ poorRelays.length === 1 ? "relay is" : "relays are" }} failing
            </p>
            <p class="custom-relays-panel__text-3">
              {{ poorRelayNames }}
            </p>
            <p class="custom-relays-panel__text-4">
              Sends still go to every relay, so messages may not sync. Probe again or replace these
              nodes.
            </p>
          </div>
          <button
            type="button"
            class="custom-relays-panel__button-probe"
            :disabled="probing"
            @click="handleProbe"
          >
            Probe
          </button>
        </div>
      </div>
    </Transition>

    <div v-if="rows.length" class="custom-relays-panel__block-6">
      <div v-for="row in rows" :key="row.url" class="custom-relays-panel__block-7">
        <button
          type="button"
          class="custom-relays-panel__button"
          :aria-expanded="expandedUrl === row.url"
          :aria-controls="`relay-detail-${row.url}`"
          @click="toggleRow(row.url)"
        >
          <span
            class="custom-relays-panel__text-5"
            :class="tierDotClass(row.tier)"
            :title="`Relay health: ${tierLabel(row.tier)}`"
          />

          <span class="custom-relays-panel__text-6">
            <span class="custom-relays-panel__text-7" :title="row.url">
              {{ row.label }}
            </span>
            <span
              class="custom-relays-panel__text-8"
            >
              <span class="custom-relays-panel__text-9" :class="tierBadgeClass(row.tier)">
                {{ tierLabel(row.tier) }}
              </span>
              <span
                v-if="row.traffic?.batteryMode === 'read_only'"
                class="custom-relays-panel__text-this-relay"
                title="This relay is out of battery: reads work, writes are refused"
              >
                read-only
              </span>
              <span
                v-else-if="row.traffic?.batteryMode === 'sync_disabled'"
                class="custom-relays-panel__text-this-relay-2"
                title="This relay paused peer sync until its battery regenerates"
              >
                sync-off
              </span>
              <span
                v-if="row.latencyMs !== null"
                class="custom-relays-panel__text-ms"
                :title="latencyTitle(row.traffic)"
              >
                {{ row.latencyMs }}ms
              </span>
            </span>
          </span>

          <ChevronDown
            class="custom-relays-panel__chevron-down"
            :class="expandedUrl === row.url ? 'custom-relays-panel__chevron-down--variant-1' : ''"
            :stroke-width="2"
            aria-hidden="true"
          />
        </button>

        <Transition
          enter-active-class="custom-relays-panel__enter-active-class-2"
          enter-from-class="custom-relays-panel__enter-from-class-2"
          enter-to-class="custom-relays-panel__enter-to-class-2"
          leave-active-class="custom-relays-panel__leave-active-class-2"
          leave-from-class="custom-relays-panel__leave-from-class-2"
          leave-to-class="custom-relays-panel__leave-to-class-2"
        >
          <div
            v-if="expandedUrl === row.url"
            :id="`relay-detail-${row.url}`"
            class="custom-relays-panel__block-8"
          >
            <div
              class="custom-relays-panel__block-9"
            >
              <span>
                pub
                <span :class="rateTextClass(row.traffic?.publishSuccessRate)">
                  {{ formatTrafficRate(row.traffic?.publishSuccessRate) }}
                </span>
              </span>
              <span>
                qry
                <span :class="rateTextClass(row.traffic?.querySuccessRate)">
                  {{ formatTrafficRate(row.traffic?.querySuccessRate) }}
                </span>
              </span>
              <span>
                con
                <span :class="rateTextClass(row.traffic?.connectSuccessRate)">
                  {{ formatTrafficRate(row.traffic?.connectSuccessRate) }}
                </span>
              </span>
              <span v-if="row.traffic?.syncPeers > 0" title="This relay mirrors its store">
                mirrors <span class="custom-relays-panel__text-10">{{ row.traffic.syncPeers }}</span>
              </span>
              <span v-else class="custom-relays-panel__text-no-mirror">no mirror peers</span>
            </div>

            <p
              v-if="row.traffic?.lastError"
              class="custom-relays-panel__text-last-error"
              :title="row.traffic.lastError"
            >
              Last error: {{ row.traffic.lastError }}
            </p>

            <div class="custom-relays-panel__block-10">
              <button
                type="button"
                class="custom-relays-panel__button-remove-relay"
                @click="handleRemove(row.url)"
              >
                Remove relay
              </button>
              <span class="custom-relays-panel__text-11">
                Removing stops all reads and writes to this node.
              </span>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <div v-else class="custom-relays-panel__block-no-relays">
      No relays configured.
    </div>

    <div class="custom-relays-panel__block-11">
      <input
        v-model="newRelayUrl"
        type="url"
        placeholder="https://relay.example.com"
        aria-label="Relay URL"
        spellcheck="false"
        class="custom-relays-panel__field-url"
        @keydown.enter="handleAdd"
      />
      <button
        type="button"
        :disabled="!newRelayUrl.trim() || adding"
        class="custom-relays-panel__button-add"
        @click="handleAdd"
      >
        <LoaderCircle v-if="adding" class="custom-relays-panel__loader-circle" :stroke-width="2" />
        <Plus v-else class="custom-relays-panel__plus" :stroke-width="2" />
        Add
      </button>
    </div>

    <p v-if="errorKey === 'invalid'" class="custom-relays-panel__text-12">
      Enter a valid Rabta node URL (https://...)
    </p>
    <p v-else-if="errorKey === 'duplicate'" class="custom-relays-panel__text-13">
      This relay is already in the list.
    </p>

    <RouterLink
      to="/stats"
      class="custom-relays-panel__router-link-detailed-relay"
    >
      Detailed relay analytics
      <ArrowUpRight class="custom-relays-panel__arrow-up-right" :stroke-width="2" />
    </RouterLink>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.custom-relays-panel__button-probe:hover {
  border-color: #fcbb0080;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__button-probe:hover {
  border-color: color-mix(in oklab,var(--color-amber-400) 50%,transparent);
}
}
}

@media (hover:hover) {
.custom-relays-panel__button-remove-relay:hover {
  border-color: #fb2c3666;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__button-remove-relay:hover {
  border-color: color-mix(in oklab,var(--color-red-500) 40%,transparent);
}
}
}

@media (hover:hover) {
.custom-relays-panel__button-add:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.custom-relays-panel__button-remove-relay:hover {
  background-color: var(--app-danger-soft);
}
}

@media (hover:hover) {
.custom-relays-panel__button-probe-every:hover {
  background-color: #ffffff0d;
}
}

@media (hover:hover) {
.custom-relays-panel__button-reset-to:hover {
  background-color: #ffffff0d;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__button-probe-every:hover {
  background-color: color-mix(in oklab,var(--color-white) 5%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__button-reset-to:hover {
  background-color: color-mix(in oklab,var(--color-white) 5%,transparent);
}
}
}

@media (hover:hover) {
.custom-relays-panel__button:hover {
  background-color: #ffffff08;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__button:hover {
  background-color: color-mix(in oklab,var(--color-white) 3%,transparent);
}
}
}

@media (hover:hover) {
.custom-relays-panel__button-add:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.custom-relays-panel__button-probe:hover {
  color: var(--color-amber-200);
}
}

@media (hover:hover) {
.custom-relays-panel__button-remove-relay:hover {
  color: var(--color-red-300);
}
}

@media (hover:hover) {
.custom-relays-panel__button-add:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.custom-relays-panel__button-probe-every:hover {
  color: var(--ui-zinc-300);
}
}

@media (hover:hover) {
.custom-relays-panel__button-reset-to:hover {
  color: var(--ui-zinc-300);
}
}

@media (hover:hover) {
.custom-relays-panel__router-link-detailed-relay:hover {
  color: var(--ui-zinc-300);
}
}

@media (min-width:40rem) {
.custom-relays-panel__field-url {
  height: calc(var(--spacing) * 9);
}
}

@media (min-width:40rem) {
.custom-relays-panel__button-add {
  height: calc(var(--spacing) * 9);
}
}

@media (min-width:40rem) {
.custom-relays-panel__button-probe-every {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.custom-relays-panel__button-reset-to {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.custom-relays-panel__button-remove-relay {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.custom-relays-panel__router-link-detailed-relay {
  min-height: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.custom-relays-panel__triangle-alert {
  margin-top: calc(var(--spacing) * .5);
}
.custom-relays-panel__block-6 {
  margin-top: var(--spacing);
}
.custom-relays-panel__text-8 {
  margin-top: var(--spacing);
}
.custom-relays-panel__router-link-detailed-relay {
  margin-top: var(--spacing);
}
.custom-relays-panel__text-last-error {
  margin-top: calc(var(--spacing) * 1.5);
}
.custom-relays-panel__block-10 {
  margin-top: calc(var(--spacing) * 2);
}
.custom-relays-panel__text-7 {
  display: block;
}
.custom-relays-panel__field-url {
  display: block;
}
.custom-relays-panel__block-2 {
  display: flex;
}
.custom-relays-panel__block-3 {
  display: flex;
}
.custom-relays-panel__block-4 {
  display: flex;
}
.custom-relays-panel__button {
  display: flex;
}
.custom-relays-panel__text-8 {
  display: flex;
}
.custom-relays-panel__block-9 {
  display: flex;
}
.custom-relays-panel__block-10 {
  display: flex;
}
.custom-relays-panel__block-11 {
  display: flex;
}
.custom-relays-panel__button-probe-every {
  display: inline-flex;
}
.custom-relays-panel__button-reset-to {
  display: inline-flex;
}
.custom-relays-panel__button-remove-relay {
  display: inline-flex;
}
.custom-relays-panel__button-add {
  display: inline-flex;
}
.custom-relays-panel__router-link-detailed-relay {
  display: inline-flex;
}
.custom-relays-panel__text-5 {
  height: calc(var(--spacing) * 1.5);
}
.custom-relays-panel__refresh-cw {
  height: calc(var(--spacing) * 3);
}
.custom-relays-panel__rotate-ccw {
  height: calc(var(--spacing) * 3);
}
.custom-relays-panel__arrow-up-right {
  height: calc(var(--spacing) * 3);
}
.custom-relays-panel__triangle-alert {
  height: calc(var(--spacing) * 3.5);
}
.custom-relays-panel__chevron-down {
  height: calc(var(--spacing) * 3.5);
}
.custom-relays-panel__loader-circle {
  height: calc(var(--spacing) * 3.5);
}
.custom-relays-panel__plus {
  height: calc(var(--spacing) * 3.5);
}
.custom-relays-panel__field-url {
  height: calc(var(--spacing) * 11);
}
.custom-relays-panel__button-add {
  height: calc(var(--spacing) * 11);
}
.custom-relays-panel__button-probe-every {
  min-height: calc(var(--spacing) * 11);
}
.custom-relays-panel__button-reset-to {
  min-height: calc(var(--spacing) * 11);
}
.custom-relays-panel__button {
  min-height: calc(var(--spacing) * 11);
}
.custom-relays-panel__button-remove-relay {
  min-height: calc(var(--spacing) * 11);
}
.custom-relays-panel__router-link-detailed-relay {
  min-height: calc(var(--spacing) * 11);
}
.custom-relays-panel__text-5 {
  width: calc(var(--spacing) * 1.5);
}
.custom-relays-panel__refresh-cw {
  width: calc(var(--spacing) * 3);
}
.custom-relays-panel__rotate-ccw {
  width: calc(var(--spacing) * 3);
}
.custom-relays-panel__arrow-up-right {
  width: calc(var(--spacing) * 3);
}
.custom-relays-panel__triangle-alert {
  width: calc(var(--spacing) * 3.5);
}
.custom-relays-panel__chevron-down {
  width: calc(var(--spacing) * 3.5);
}
.custom-relays-panel__loader-circle {
  width: calc(var(--spacing) * 3.5);
}
.custom-relays-panel__plus {
  width: calc(var(--spacing) * 3.5);
}
.custom-relays-panel__button {
  width: 100%;
}
.custom-relays-panel__block-5 {
  min-width: 0;
}
.custom-relays-panel__text-6 {
  min-width: 0;
}
.custom-relays-panel__text-8 {
  min-width: 0;
}
.custom-relays-panel__field-url {
  min-width: 0;
}
.custom-relays-panel__block-5 {
  flex: 1;
}
.custom-relays-panel__text-6 {
  flex: 1;
}
.custom-relays-panel__field-url {
  flex: 1;
}
.custom-relays-panel__triangle-alert {
  flex-shrink: 0;
}
.custom-relays-panel__button-probe {
  flex-shrink: 0;
}
.custom-relays-panel__text-5 {
  flex-shrink: 0;
}
.custom-relays-panel__text-9 {
  flex-shrink: 0;
}
.custom-relays-panel__text-this-relay {
  flex-shrink: 0;
}
.custom-relays-panel__text-this-relay-2 {
  flex-shrink: 0;
}
.custom-relays-panel__chevron-down {
  flex-shrink: 0;
}
.custom-relays-panel__button-add {
  flex-shrink: 0;
}
.custom-relays-panel__enter-from-class {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.custom-relays-panel__leave-to-class {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.custom-relays-panel__enter-from-class-2 {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.custom-relays-panel__leave-to-class-2 {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.custom-relays-panel__enter-to-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.custom-relays-panel__leave-from-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.custom-relays-panel__enter-to-class-2 {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.custom-relays-panel__leave-from-class-2 {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.custom-relays-panel__chevron-down--variant-1 {
  rotate: 180deg;
}
.custom-relays-panel__refresh-cw--spin {
  animation: var(--animate-spin);
}
.custom-relays-panel__loader-circle {
  animation: var(--animate-spin);
}
.custom-relays-panel__button-probe-every {
  cursor: pointer;
}
.custom-relays-panel__button-reset-to {
  cursor: pointer;
}
.custom-relays-panel__button-probe {
  cursor: pointer;
}
.custom-relays-panel__button {
  cursor: pointer;
}
.custom-relays-panel__button-remove-relay {
  cursor: pointer;
}
.custom-relays-panel__button-add {
  cursor: pointer;
}
.custom-relays-panel__block-2 {
  flex-wrap: wrap;
}
.custom-relays-panel__text-8 {
  flex-wrap: wrap;
}
.custom-relays-panel__block-9 {
  flex-wrap: wrap;
}
.custom-relays-panel__block-10 {
  flex-wrap: wrap;
}
.custom-relays-panel__block-2 {
  align-items: center;
}
.custom-relays-panel__block-3 {
  align-items: center;
}
.custom-relays-panel__button-probe-every {
  align-items: center;
}
.custom-relays-panel__button-reset-to {
  align-items: center;
}
.custom-relays-panel__button {
  align-items: center;
}
.custom-relays-panel__text-8 {
  align-items: center;
}
.custom-relays-panel__block-9 {
  align-items: center;
}
.custom-relays-panel__block-10 {
  align-items: center;
}
.custom-relays-panel__button-remove-relay {
  align-items: center;
}
.custom-relays-panel__block-11 {
  align-items: center;
}
.custom-relays-panel__button-add {
  align-items: center;
}
.custom-relays-panel__router-link-detailed-relay {
  align-items: center;
}
.custom-relays-panel__block-4 {
  align-items: flex-start;
}
.custom-relays-panel__block-2 {
  justify-content: space-between;
}
.custom-relays-panel__button-add {
  justify-content: center;
}
.custom-relays-panel__block-3 {
  gap: var(--spacing);
}
.custom-relays-panel__button-probe-every {
  gap: var(--spacing);
}
.custom-relays-panel__button-reset-to {
  gap: var(--spacing);
}
.custom-relays-panel__router-link-detailed-relay {
  gap: var(--spacing);
}
.custom-relays-panel__button-add {
  gap: calc(var(--spacing) * 1.5);
}
.custom-relays-panel__block-2 {
  gap: calc(var(--spacing) * 2);
}
.custom-relays-panel__block-10 {
  gap: calc(var(--spacing) * 2);
}
.custom-relays-panel__block-11 {
  gap: calc(var(--spacing) * 2);
}
.custom-relays-panel__block-4 {
  gap: calc(var(--spacing) * 2.5);
}
.custom-relays-panel__button {
  gap: calc(var(--spacing) * 2.5);
}
:where(.custom-relays-panel__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.custom-relays-panel__block-5>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
.custom-relays-panel__text-8 {
  column-gap: calc(var(--spacing) * 2);
}
.custom-relays-panel__block-9 {
  column-gap: calc(var(--spacing) * 3);
}
.custom-relays-panel__text-8 {
  row-gap: var(--spacing);
}
.custom-relays-panel__block-9 {
  row-gap: var(--spacing);
}
.custom-relays-panel__text-7 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.custom-relays-panel__text-last-error {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.custom-relays-panel__text-9 {
  border-radius: .25rem;
}
.custom-relays-panel__text-this-relay {
  border-radius: .25rem;
}
.custom-relays-panel__text-this-relay-2 {
  border-radius: .25rem;
}
.custom-relays-panel__text-5 {
  border-radius: 3.40282e38px;
}
.custom-relays-panel__button-probe-every {
  border-radius: var(--radius-lg);
}
.custom-relays-panel__button-reset-to {
  border-radius: var(--radius-lg);
}
.custom-relays-panel__button-remove-relay {
  border-radius: var(--radius-lg);
}
.custom-relays-panel__field-url {
  border-radius: var(--radius-lg);
}
.custom-relays-panel__button-add {
  border-radius: var(--radius-lg);
}
.custom-relays-panel__button-probe {
  border-radius: var(--radius-md);
}
.custom-relays-panel__status {
  border-radius: var(--radius-xl);
}
.custom-relays-panel__status {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.custom-relays-panel__button-probe {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.custom-relays-panel__button-remove-relay {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.custom-relays-panel__field-url {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.custom-relays-panel__button-add {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.custom-relays-panel__block-7 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.custom-relays-panel__field-url {
  --border-style: dashed;
  border-style: dashed;
}
.custom-relays-panel__status {
  border-color: #f99c0040;
}
.custom-relays-panel__button-probe {
  border-color: #f99c0040;
}
.custom-relays-panel__button-remove-relay {
  border-color: #fb2c3640;
}
.custom-relays-panel__field-url {
  border-color: var(--ui-zinc-800);
}
.custom-relays-panel__button-add {
  border-color: var(--ui-zinc-800);
}
.custom-relays-panel__block-7 {
  border-color: var(--app-border-faint);
}
.custom-relays-panel__status {
  background-color: #f99c0014;
}
.custom-relays-panel__text-this-relay {
  background-color: var(--app-danger-soft);
}
.custom-relays-panel__field-url {
  background-color: #0000;
}
.custom-relays-panel__text-this-relay-2 {
  background-color: #edb2001a;
}
.custom-relays-panel__button-add {
  background-color: var(--app-surface-tint);
}
.custom-relays-panel__button {
  padding-inline: var(--spacing);
}
.custom-relays-panel__block-no-relays {
  padding-inline: var(--spacing);
}
.custom-relays-panel__text-12 {
  padding-inline: var(--spacing);
}
.custom-relays-panel__text-13 {
  padding-inline: var(--spacing);
}
.custom-relays-panel__text-9 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.custom-relays-panel__text-this-relay {
  padding-inline: calc(var(--spacing) * 1.5);
}
.custom-relays-panel__text-this-relay-2 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.custom-relays-panel__button-probe-every {
  padding-inline: calc(var(--spacing) * 2);
}
.custom-relays-panel__button-reset-to {
  padding-inline: calc(var(--spacing) * 2);
}
.custom-relays-panel__button-probe {
  padding-inline: calc(var(--spacing) * 2);
}
.custom-relays-panel__button-remove-relay {
  padding-inline: calc(var(--spacing) * 2.5);
}
.custom-relays-panel__status {
  padding-inline: calc(var(--spacing) * 3);
}
.custom-relays-panel__field-url {
  padding-inline: calc(var(--spacing) * 3);
}
.custom-relays-panel__button-add {
  padding-inline: calc(var(--spacing) * 3);
}
.custom-relays-panel__text-9 {
  padding-block: calc(var(--spacing) * .5);
}
.custom-relays-panel__text-this-relay {
  padding-block: calc(var(--spacing) * .5);
}
.custom-relays-panel__text-this-relay-2 {
  padding-block: calc(var(--spacing) * .5);
}
.custom-relays-panel__button-probe {
  padding-block: var(--spacing);
}
.custom-relays-panel__status {
  padding-block: calc(var(--spacing) * 2.5);
}
.custom-relays-panel__button {
  padding-block: calc(var(--spacing) * 3);
}
.custom-relays-panel__block-no-relays {
  padding-block: calc(var(--spacing) * 5);
}
.custom-relays-panel__text-12 {
  padding-top: var(--spacing);
}
.custom-relays-panel__text-13 {
  padding-top: var(--spacing);
}
.custom-relays-panel__block-11 {
  padding-top: calc(var(--spacing) * 2);
}
.custom-relays-panel__block-8 {
  padding-right: var(--spacing);
}
.custom-relays-panel__block-8 {
  padding-bottom: calc(var(--spacing) * 3);
}
.custom-relays-panel__block-8 {
  padding-left: calc(var(--spacing) * 4);
}
.custom-relays-panel__block-no-relays {
  text-align: center;
}
.custom-relays-panel__button {
  text-align: left;
}
.custom-relays-panel__text-configured {
  font-family: var(--font-mono);
}
.custom-relays-panel__button-probe-every {
  font-family: var(--font-mono);
}
.custom-relays-panel__button-reset-to {
  font-family: var(--font-mono);
}
.custom-relays-panel__text-3 {
  font-family: var(--font-mono);
}
.custom-relays-panel__button-probe {
  font-family: var(--font-mono);
}
.custom-relays-panel__text-7 {
  font-family: var(--font-mono);
}
.custom-relays-panel__text-8 {
  font-family: var(--font-mono);
}
.custom-relays-panel__block-9 {
  font-family: var(--font-mono);
}
.custom-relays-panel__text-last-error {
  font-family: var(--font-mono);
}
.custom-relays-panel__button-remove-relay {
  font-family: var(--font-mono);
}
.custom-relays-panel__text-11 {
  font-family: var(--font-mono);
}
.custom-relays-panel__block-no-relays {
  font-family: var(--font-mono);
}
.custom-relays-panel__field-url {
  font-family: var(--font-mono);
}
.custom-relays-panel__router-link-detailed-relay {
  font-family: var(--font-mono);
}
.custom-relays-panel__text-7 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.custom-relays-panel__field-url {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.custom-relays-panel__text-configured {
  font-size: 10px;
}
.custom-relays-panel__button-probe-every {
  font-size: 10px;
}
.custom-relays-panel__button-reset-to {
  font-size: 10px;
}
.custom-relays-panel__text-3 {
  font-size: 10px;
}
.custom-relays-panel__text-4 {
  font-size: 10px;
}
.custom-relays-panel__button-probe {
  font-size: 10px;
}
.custom-relays-panel__text-8 {
  font-size: 10px;
}
.custom-relays-panel__block-9 {
  font-size: 10px;
}
.custom-relays-panel__text-last-error {
  font-size: 10px;
}
.custom-relays-panel__button-remove-relay {
  font-size: 10px;
}
.custom-relays-panel__text-11 {
  font-size: 10px;
}
.custom-relays-panel__router-link-detailed-relay {
  font-size: 10px;
}
.custom-relays-panel__text-2 {
  font-size: 11px;
}
.custom-relays-panel__block-no-relays {
  font-size: 11px;
}
.custom-relays-panel__button-add {
  font-size: 11px;
}
.custom-relays-panel__text-12 {
  font-size: 11px;
}
.custom-relays-panel__text-13 {
  font-size: 11px;
}
.custom-relays-panel__text-3 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.custom-relays-panel__text-4 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.custom-relays-panel__text-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.custom-relays-panel__button-add {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.custom-relays-panel__text-configured {
  --tracking: .16em;
  letter-spacing: .16em;
}
.custom-relays-panel__text-3 {
  word-break: break-all;
}
.custom-relays-panel__text-3 {
  color: #fee68599;
}
.custom-relays-panel__text-2 {
  color: var(--color-amber-300);
}
.custom-relays-panel__button-probe {
  color: var(--color-amber-300);
}
.custom-relays-panel__triangle-alert {
  color: var(--color-amber-400);
}
.custom-relays-panel__text-recommended {
  color: #fcbb00cc;
}
.custom-relays-panel__success {
  color: var(--color-emerald-400);
}
.custom-relays-panel__text-this-relay {
  color: var(--color-red-400);
}
.custom-relays-panel__button-remove-relay {
  color: var(--color-red-400);
}
.custom-relays-panel__text-12 {
  color: var(--color-red-400);
}
.custom-relays-panel__text-13 {
  color: var(--color-red-400);
}
.custom-relays-panel__danger {
  color: var(--color-red-400);
}
.custom-relays-panel__text-this-relay-2 {
  color: var(--color-yellow-400);
}
.custom-relays-panel__warning {
  color: var(--color-yellow-400);
}
.custom-relays-panel__field-url {
  color: var(--ui-zinc-100);
}
.custom-relays-panel__text-7 {
  color: var(--ui-zinc-200);
}
.custom-relays-panel__button-add {
  color: var(--ui-zinc-300);
}
.custom-relays-panel__text-10 {
  color: var(--ui-zinc-400);
}
.custom-relays-panel__button-probe-every {
  color: var(--ui-zinc-500);
}
.custom-relays-panel__button-reset-to {
  color: var(--ui-zinc-500);
}
.custom-relays-panel__text-4 {
  color: var(--ui-zinc-500);
}
.custom-relays-panel__text-ms {
  color: var(--ui-zinc-500);
}
.custom-relays-panel__router-link-detailed-relay {
  color: var(--ui-zinc-500);
}
.custom-relays-panel__text-configured {
  color: var(--ui-zinc-600);
}
.custom-relays-panel__chevron-down {
  color: var(--ui-zinc-600);
}
.custom-relays-panel__block-9 {
  color: var(--ui-zinc-600);
}
.custom-relays-panel__text-last-error {
  color: var(--ui-zinc-600);
}
.custom-relays-panel__block-no-relays {
  color: var(--ui-zinc-600);
}
.custom-relays-panel__muted {
  color: var(--ui-zinc-600);
}
.custom-relays-panel__text {
  color: var(--ui-zinc-700);
}
.custom-relays-panel__text-no-mirror {
  color: var(--ui-zinc-700);
}
.custom-relays-panel__text-11 {
  color: var(--ui-zinc-700);
}
.custom-relays-panel__text-configured {
  text-transform: uppercase;
}
.custom-relays-panel__text-configured {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.custom-relays-panel__text-8 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.custom-relays-panel__block-9 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.custom-relays-panel__enter-from-class {
  opacity: 0;
}
.custom-relays-panel__leave-to-class {
  opacity: 0;
}
.custom-relays-panel__enter-from-class-2 {
  opacity: 0;
}
.custom-relays-panel__leave-to-class-2 {
  opacity: 0;
}
.custom-relays-panel__enter-to-class {
  opacity: 1;
}
.custom-relays-panel__leave-from-class {
  opacity: 1;
}
.custom-relays-panel__enter-to-class-2 {
  opacity: 1;
}
.custom-relays-panel__leave-from-class-2 {
  opacity: 1;
}
.custom-relays-panel__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__enter-active-class-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__leave-active-class-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__button-probe-every {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__button-reset-to {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__button-probe {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__button-remove-relay {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__field-url {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__button-add {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__router-link-detailed-relay {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__chevron-down {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.custom-relays-panel__leave-active-class-2 {
  --duration: .15s;
  transition-duration: .15s;
}
.custom-relays-panel__leave-active-class {
  --duration: .2s;
  transition-duration: .2s;
}
.custom-relays-panel__button {
  --duration: .2s;
  transition-duration: .2s;
}
.custom-relays-panel__chevron-down {
  --duration: .2s;
  transition-duration: .2s;
}
.custom-relays-panel__enter-active-class-2 {
  --duration: .2s;
  transition-duration: .2s;
}
.custom-relays-panel__enter-active-class {
  --duration: .3s;
  transition-duration: .3s;
}
.custom-relays-panel__leave-active-class {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.custom-relays-panel__leave-active-class-2 {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.custom-relays-panel__enter-active-class {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.custom-relays-panel__enter-active-class-2 {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.custom-relays-panel__field-url::placeholder {
  color: var(--ui-zinc-600);
}
.custom-relays-panel__block-7:first-child {
  border-top-style: var(--border-style,solid);
  border-top-width: 0;
}
.custom-relays-panel__field-url:focus {
  border-color: var(--ui-zinc-600);
}
.custom-relays-panel__field-url:focus {
  --outline-style: none;
  outline-style: none;
}
.custom-relays-panel__button-probe-every:active {
  scale: .98;
}
.custom-relays-panel__button-reset-to:active {
  scale: .98;
}
.custom-relays-panel__button-probe:active {
  scale: .98;
}
.custom-relays-panel__button-remove-relay:active {
  scale: .98;
}
.custom-relays-panel__button-add:active {
  scale: .98;
}
.custom-relays-panel__button:active {
  background-color: #ffffff0d;
}
.custom-relays-panel__button-probe-every:disabled {
  opacity: .4;
}
.custom-relays-panel__button-probe:disabled {
  opacity: .4;
}
.custom-relays-panel__button-add:disabled {
  opacity: .4;
}
[data-theme="light"] .custom-relays-panel__text-2 {
  color: var(--app-warning-strong);
}
[data-theme="light"] .custom-relays-panel__button-probe {
  color: var(--app-warning-strong);
}
[data-theme="light"] .custom-relays-panel__triangle-alert {
  color: var(--app-warning);
}
[data-theme="light"] .custom-relays-panel__success {
  color: var(--app-success);
}
[data-theme="light"] .custom-relays-panel__text-this-relay {
  color: var(--app-danger);
}
[data-theme="light"] .custom-relays-panel__button-remove-relay {
  color: var(--app-danger);
}
[data-theme="light"] .custom-relays-panel__text-12 {
  color: var(--app-danger);
}
[data-theme="light"] .custom-relays-panel__text-13 {
  color: var(--app-danger);
}
[data-theme="light"] .custom-relays-panel__danger {
  color: var(--app-danger);
}
[data-theme="light"] .custom-relays-panel__button-add {
  color: var(--app-text-soft);
}
[data-theme="light"] .custom-relays-panel__text-10 {
  color: var(--app-muted);
}
[data-theme="light"] .custom-relays-panel__button-probe-every {
  color: var(--app-muted);
}
[data-theme="light"] .custom-relays-panel__button-reset-to {
  color: var(--app-muted);
}
[data-theme="light"] .custom-relays-panel__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .custom-relays-panel__text-ms {
  color: var(--app-muted);
}
[data-theme="light"] .custom-relays-panel__router-link-detailed-relay {
  color: var(--app-muted);
}
[data-theme="light"] .custom-relays-panel__text-configured {
  color: var(--app-text-soft);
}
[data-theme="light"] .custom-relays-panel__chevron-down {
  color: var(--app-text-soft);
}
[data-theme="light"] .custom-relays-panel__block-9 {
  color: var(--app-text-soft);
}
[data-theme="light"] .custom-relays-panel__text-last-error {
  color: var(--app-text-soft);
}
[data-theme="light"] .custom-relays-panel__block-no-relays {
  color: var(--app-text-soft);
}
[data-theme="light"] .custom-relays-panel__muted {
  color: var(--app-text-soft);
}
[data-theme="light"] .custom-relays-panel__button-probe-every:hover {
  background-color: var(--app-surface-hover) !important;
}
[data-theme="light"] .custom-relays-panel__button-reset-to:hover {
  background-color: var(--app-surface-hover) !important;
}
[data-theme="light"] .custom-relays-panel__button-probe-every:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .custom-relays-panel__button-reset-to:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .custom-relays-panel__router-link-detailed-relay:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__status {
  border-color: color-mix(in oklab,var(--color-amber-500) 25%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__button-probe {
  border-color: color-mix(in oklab,var(--color-amber-500) 25%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__button-remove-relay {
  border-color: color-mix(in oklab,var(--color-red-500) 25%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__status {
  background-color: color-mix(in oklab,var(--color-amber-500) 8%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__text-this-relay-2 {
  background-color: color-mix(in oklab,var(--color-yellow-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__text-3 {
  color: color-mix(in oklab,var(--color-amber-200) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__text-recommended {
  color: color-mix(in oklab,var(--color-amber-400) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.custom-relays-panel__button:active {
  background-color: color-mix(in oklab,var(--color-white) 5%,transparent);
}
}
}
</style>
