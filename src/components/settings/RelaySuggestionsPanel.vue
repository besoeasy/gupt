<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Check, LoaderCircle, Plus, RefreshCw, ShieldCheck, Users } from "@/icons";

import { addCustomRelay } from "@/lib/relay";
import {
  ignoreRelayHint,
  loadRelaySuggestions,
  readCachedRelaySuggestions,
} from "@/lib/relayHints";

const rows = ref([]);
const loading = ref(true);
const refreshing = ref(false);
const failed = ref(false);
const addedLabel = ref("");
let addedTimer = null;

const countLabel = computed(() =>
  rows.value.length === 1 ? "1 relay" : `${rows.value.length} relays`,
);

/** Nothing to show: the panel renders nothing at all until it has rows. */
const collapsed = computed(
  () => !loading.value && !rows.value.length && !addedLabel.value,
);

function flashAdded(label) {
  addedLabel.value = `${label} added`;
  if (addedTimer) clearTimeout(addedTimer);
  addedTimer = setTimeout(() => {
    addedLabel.value = "";
    addedTimer = null;
  }, 4000);
}

function apply(next) {
  rows.value = Array.isArray(next) ? next : [];
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("gupt:relay-hints-changed"));
  }
}

async function load({ force = false } = {}) {
  failed.value = false;
  if (force) refreshing.value = true;
  try {
    apply(await loadRelaySuggestions({ force }));
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

onMounted(async () => {
  // Cached rows paint instantly; the verification pass follows.
  try {
    const cached = await readCachedRelaySuggestions();
    if (cached.length) {
      apply(cached);
      loading.value = false;
    }
  } catch {
    // keep the skeleton until the network pass answers
  }
  await load();
});

function handleAdd(row) {
  const added = addCustomRelay(row.url);
  rows.value = rows.value.filter((entry) => entry.url !== row.url);
  if (added) flashAdded(row.label);
}

function handleIgnore(row) {
  ignoreRelayHint(row.url);
  rows.value = rows.value.filter((entry) => entry.url !== row.url);
  // The summary and status strip read the hints cache, so tell them the
  // suggestion is gone.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("gupt:relay-hints-changed"));
  }
}

function trustLabel(row) {
  if (row.contactCount > 0) {
    return row.contactCount === 1 ? "Known contact" : `${row.contactCount} known contacts`;
  }
  return row.authorCount === 1 ? "1 author" : `${row.authorCount} authors`;
}

onUnmounted(() => {
  if (addedTimer) clearTimeout(addedTimer);
});
</script>

<template>
  <div class="relay-suggestions-panel">
    <div v-if="!collapsed" class="relay-suggestions-panel__header">
      <div class="relay-suggestions-panel__heading">
        <p class="relay-suggestions-panel__title">
          Suggested relays
          <template v-if="rows.length">
            <span class="relay-suggestions-panel__heading-sep">·</span>
            <span class="relay-suggestions-panel__heading-count">{{ countLabel }}</span>
          </template>
        </p>
        <p class="relay-suggestions-panel__lede">
          Shared by people on the relays you already use. Only verified nodes appear here.
        </p>
      </div>

      <button
        type="button"
        class="relay-suggestions-panel__refresh"
        :disabled="refreshing"
        title="Fetch and verify suggestions again"
        @click="load({ force: true })"
      >
        <RefreshCw
          class="relay-suggestions-panel__refresh-icon"
          :class="refreshing ? 'relay-suggestions-panel__refresh-icon--spin' : ''"
          :stroke-width="2"
          aria-hidden="true"
        />
        Refresh
      </button>
    </div>

    <Transition
      enter-active-class="relay-suggestions-panel__fade-enter-active"
      enter-from-class="relay-suggestions-panel__fade-enter-from"
      enter-to-class="relay-suggestions-panel__fade-enter-to"
      leave-active-class="relay-suggestions-panel__fade-leave-active"
    >
      <p
        v-if="addedLabel"
        class="relay-suggestions-panel__toast"
        role="status"
        aria-live="polite"
      >
        {{ addedLabel }}
      </p>
    </Transition>

    <div v-if="!collapsed && loading" class="relay-suggestions-panel__skeletons" aria-hidden="true">
      <div
        v-for="index in 2"
        :key="index"
        class="relay-suggestions-panel__skeleton"
      />
    </div>

    <div v-else-if="rows.length" class="relay-suggestions-panel__list">
      <div
        v-for="row in rows"
        :key="row.url"
        class="relay-suggestions-panel__row"
      >
        <div class="relay-suggestions-panel__row-main">
          <span
            class="relay-suggestions-panel__verified-badge"
            title="Verified Rabta v1 node"
          >
            <ShieldCheck class="relay-suggestions-panel__shield-check" :stroke-width="2" aria-hidden="true" />
          </span>

          <div class="relay-suggestions-panel__row-body">
            <p class="relay-suggestions-panel__label" :title="row.url">
              {{ row.label }}
            </p>

            <div
              class="relay-suggestions-panel__meta"
            >
              <span
                class="relay-suggestions-panel__trust"
                :class="
                  row.contactCount > 0
                    ? 'relay-suggestions-panel__trust--success'
                    : 'relay-suggestions-panel__trust--muted'
                "
              >
                <Users class="relay-suggestions-panel__users" :stroke-width="2.5" aria-hidden="true" />
                {{ trustLabel(row) }}
              </span>
              <span class="relay-suggestions-panel__verified">Verified</span>
              <span
                v-if="row.mode === 'sync_disabled'"
                class="relay-suggestions-panel__sync-off"
                title="This relay paused peer sync until its battery regenerates"
              >
                sync-off
              </span>
              <span v-if="row.latencyMs > 0" class="relay-suggestions-panel__latency">{{ row.latencyMs }}ms</span>
              <span v-if="row.nodeId" class="relay-suggestions-panel__node" :title="row.nodeId">
                node {{ row.nodeId.slice(0, 8) }}
              </span>
            </div>

            <p
              v-if="row.note"
              class="relay-suggestions-panel__note"
              :title="row.note"
            >
              “{{ row.note }}”
            </p>
            <p
              v-if="row.contactCount === 0"
              class="relay-suggestions-panel__warning"
            >
              No one you know vouches for this node — adding it shares your IP with its operator.
            </p>
          </div>

          <div class="relay-suggestions-panel__row-actions">
            <button
              type="button"
              class="relay-suggestions-panel__add"
              :aria-label="`Add relay ${row.label}`"
              @click="handleAdd(row)"
            >
              <Plus class="relay-suggestions-panel__plus" :stroke-width="2.5" aria-hidden="true" />
              Add
            </button>
            <button
              type="button"
              class="relay-suggestions-panel__ignore"
              :aria-label="`Ignore relay ${row.label}`"
              @click="handleIgnore(row)"
            >
              Ignore
            </button>
          </div>
        </div>
      </div>
    </div>

    <p
      v-else-if="!collapsed && failed"
      class="relay-suggestions-panel__error"
    >
      <LoaderCircle class="relay-suggestions-panel__loader-circle" :stroke-width="2" aria-hidden="true" />
      Couldn't reach your relays for suggestions. They'll retry on Refresh.
    </p>

    <div v-else-if="!collapsed" class="relay-suggestions-panel__empty">
      <Check class="relay-suggestions-panel__check" :stroke-width="2" aria-hidden="true" />
      <p class="relay-suggestions-panel__empty-text">
        No relay suggestions yet. Hints appear here when people on your relays share one.
      </p>
    </div>

    <div v-if="collapsed && failed" class="relay-suggestions-panel__compact">
      <span class="relay-suggestions-panel__compact-text">
        Couldn't reach your relays for suggestions
      </span>
      <button
        type="button"
        class="relay-suggestions-panel__refresh"
        :disabled="refreshing"
        title="Fetch and verify suggestions again"
        @click="load({ force: true })"
      >
        <RefreshCw
          class="relay-suggestions-panel__refresh-icon"
          :class="refreshing ? 'relay-suggestions-panel__refresh-icon--spin' : ''"
          :stroke-width="2"
          aria-hidden="true"
        />
        Refresh
      </button>
    </div>
  </div>
</template>

<style scoped>
@media (hover: hover) {
  .relay-suggestions-panel__row:hover {
    border-color: color-mix(in oklab,var(--app-border-strong) 80%,transparent);
  }
  .relay-suggestions-panel__add:hover {
    background-color: color-mix(in oklab,var(--app-success) 25%,transparent);
  }
  .relay-suggestions-panel__refresh:hover {
    background-color: color-mix(in oklab, var(--app-text) 5%, transparent);
    color: var(--app-text-soft);
  }
  .relay-suggestions-panel__ignore:hover {
    background-color: color-mix(in oklab, var(--app-text) 5%, transparent);
    color: var(--app-text-soft);
  }
}
@media (min-width: 40rem) {
  .relay-suggestions-panel__refresh {
    min-height: 2rem;
  }
  .relay-suggestions-panel__add {
    min-height: 2rem;
  }
  .relay-suggestions-panel__ignore {
    min-height: 2rem;
  }
}
.relay-suggestions-panel__verified-badge {
  margin-top: 0.125rem;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: color-mix(in oklab,var(--app-success) 10%,transparent);
  width: 22px;
  height: 22px;
  border-radius: var(--app-radius-sm);
  background: var(--app-success-soft);
  color: var(--app-success);
}
.relay-suggestions-panel__lede {
  max-width: 64ch;
  margin-top: 6px;
  font-size: var(--app-text-meta);
  line-height: 1.55;
  color: var(--app-muted);
}
.relay-suggestions-panel__meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  column-gap: 8px;
  row-gap: 6px;
  margin-top: 6px;
  font-size: 9.5px;
}
.relay-suggestions-panel__note {
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  display: -webkit-box;
  overflow: hidden;
  margin-top: 6px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--app-muted);
}
.relay-suggestions-panel__warning {
  margin-top: 6px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--app-warning);
}
.relay-suggestions-panel__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding-inline: 0;
  padding-bottom: var(--app-space-4);
}
.relay-suggestions-panel__row-main {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
}
.relay-suggestions-panel__row-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}
.relay-suggestions-panel__error {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding-inline: 0.25rem;
  padding-block: 0.75rem;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted-2);
}
.relay-suggestions-panel__empty {
  display: flex;
  align-items: center;
  padding-block: 0.75rem;
  padding-inline: 0;
  gap: var(--app-space-2);
  color: var(--app-muted-2);
}
.relay-suggestions-panel__refresh {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-mono);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  min-height: 30px;
  padding-inline: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}
.relay-suggestions-panel__trust {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: .25rem;
  padding-inline: 0.375rem;
  padding-block: 0.125rem;
  background: var(--app-success-soft);
  color: var(--app-success);
}
.relay-suggestions-panel__add {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  font-family: var(--font-mono);
  font-weight: 500;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  background-color: color-mix(in oklab,var(--app-success) 15%,transparent);
  min-height: 28px;
  padding-inline: 10px;
  border: 1px solid var(--app-text);
  border-radius: var(--app-radius-sm);
  background: var(--app-text);
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-bg);
}
.relay-suggestions-panel__ignore {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  min-height: 28px;
  padding-inline: 8px;
  border: 1px solid transparent;
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}
.relay-suggestions-panel__users {
  height: 0.625rem;
  width: 0.625rem;
}
.relay-suggestions-panel__refresh-icon {
  height: 0.75rem;
  width: 0.75rem;
}
.relay-suggestions-panel__plus {
  height: 0.75rem;
  width: 0.75rem;
}
.relay-suggestions-panel__loader-circle {
  height: 0.75rem;
  width: 0.75rem;
}
.relay-suggestions-panel__check {
  height: 0.75rem;
  width: 0.75rem;
  flex-shrink: 0;
  color: var(--app-border-strong);
}
.relay-suggestions-panel__shield-check {
  height: 0.875rem;
  width: 0.875rem;
}
.relay-suggestions-panel__skeleton {
  height: 4rem;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-faint);
  background-color: var(--app-surface-tint-soft);
}
.relay-suggestions-panel__heading {
  min-width: 0;
}
.relay-suggestions-panel__row-body {
  min-width: 0;
  flex: 1;
}
.relay-suggestions-panel__fade-enter-from {
  translate: 0 -0.25rem;
  opacity: 0;
}
.relay-suggestions-panel__fade-enter-to {
  translate: 0 0;
  opacity: 1;
}
.relay-suggestions-panel__refresh-icon--spin {
  animation: spin 1s linear infinite;
}
:where(.relay-suggestions-panel>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.relay-suggestions-panel__skeletons>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.relay-suggestions-panel__list>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
.relay-suggestions-panel__label {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-family: var(--font-mono);
  line-height: 1.5;
  font-size: 12.5px;
  letter-spacing: 0.01em;
  color: var(--app-text);
}
.relay-suggestions-panel__node {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  color: var(--app-muted-2);
}
.relay-suggestions-panel__verified {
  border-radius: .25rem;
  padding-inline: 0.375rem;
  padding-block: 0.125rem;
  background-color: color-mix(in oklab,var(--app-surface-raised) 70%,transparent);
  background: var(--app-surface-soft);
  color: var(--app-muted);
}
.relay-suggestions-panel__sync-off {
  border-radius: .25rem;
  padding-inline: 0.375rem;
  padding-block: 0.125rem;
  color: var(--app-warning);
  background-color: color-mix(in oklab,var(--app-warning) 10%,transparent);
}
.relay-suggestions-panel__row {
  border-style: solid;
  border-width: 1px;
  background-color: var(--app-surface-inset);
  padding-inline: 0.75rem;
  padding-block: 0.625rem;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .2s;
  border-color: color-mix(in oklab,var(--app-surface-raised) 70%,transparent);
  padding: 14px;
  border: 0;
  border-radius: 0;
  background: transparent;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}
.relay-suggestions-panel {
  border-top-style: solid;
  border-top-width: 1px;
  border-color: var(--app-border-faint);
  padding-top: var(--app-space-5);
  border-top: 1px solid var(--app-border);
}
.relay-suggestions-panel__trust--success {
  color: var(--app-success);
  background-color: color-mix(in oklab,var(--app-success) 10%,transparent);
}
.relay-suggestions-panel__trust--muted {
  color: var(--app-text-soft);
  background-color: color-mix(in oklab,var(--app-surface-raised) 70%,transparent);
}
.relay-suggestions-panel__toast {
  padding-inline: 0.25rem;
  margin: var(--app-space-2) 0 0;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-success);
}
.relay-suggestions-panel__title {
  font-family: var(--font-mono);
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  color: var(--app-muted-2);
}
.relay-suggestions-panel__empty-text {
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.625;
  color: var(--app-muted-2);
}
.relay-suggestions-panel__heading-count {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}
.relay-suggestions-panel__latency {
  color: var(--app-muted);
}
.relay-suggestions-panel__heading-sep {
  color: var(--app-border-strong);
}
.relay-suggestions-panel__fade-enter-active {
  transition-property: all;
  transition-duration: .2s;
  transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
}
.relay-suggestions-panel__fade-leave-active {
  transition-property: all;
  transition-duration: .2s;
  transition-timing-function: var(--app-ease-in);
}
.relay-suggestions-panel__refresh:active {
  scale: .98;
}
.relay-suggestions-panel__add:active {
  scale: .98;
}
.relay-suggestions-panel__ignore:active {
  scale: .98;
}
[data-theme="light"] .relay-suggestions-panel__add {
  color: var(--app-success);
}
[data-theme="light"] .relay-suggestions-panel__trust--muted {
  color: var(--app-muted);
}
[data-theme="light"] .relay-suggestions-panel__heading-count {
  color: var(--app-muted);
}
[data-theme="light"] .relay-suggestions-panel__ignore {
  color: var(--app-muted);
}
[data-theme="light"] .relay-suggestions-panel__title {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-suggestions-panel__lede {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-suggestions-panel__node {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-suggestions-panel__error {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-suggestions-panel__empty-text {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-suggestions-panel__refresh:hover {
  background-color: var(--app-surface-hover);
  color: var(--app-text);
}
[data-theme="light"] .relay-suggestions-panel__ignore:hover {
  background-color: var(--app-surface-hover);
  color: var(--app-text);
}
.relay-suggestions-panel__compact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-top: var(--app-space-2);
}
.relay-suggestions-panel__compact-text {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted);
}
.relay-suggestions-panel__list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-fade 320ms var(--app-ease-standard) both;
}
.relay-suggestions-panel__list > :not(:last-child) {
  margin-block-end: 0;
}
.relay-suggestions-panel__row + .relay-suggestions-panel__row {
  border-top: 1px solid var(--app-border);
}
.relay-suggestions-panel__verified-badge svg {
  width: 12px;
  height: 12px;
}
.relay-suggestions-panel__trust, .relay-suggestions-panel__verified, .relay-suggestions-panel__sync-off, .relay-suggestions-panel__latency, .relay-suggestions-panel__node {
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9.5px;
  letter-spacing: 0.02em;
}
.relay-suggestions-panel__error, .relay-suggestions-panel__empty-text, .relay-suggestions-panel__toast, .relay-suggestions-panel__compact-text {
  font-size: var(--app-text-meta);
  line-height: 1.5;
  color: var(--app-muted);
}
@media (hover: hover) {
  .relay-suggestions-panel__row:hover {
    background: var(--app-surface-soft);
  }
  .relay-suggestions-panel__refresh:hover {
    border-color: var(--app-border-strong);
    background: var(--app-surface-soft);
    color: var(--app-text);
  }
  .relay-suggestions-panel__add:hover {
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    border-color: var(--app-text);
    color: var(--app-bg);
  }
  .relay-suggestions-panel__ignore:hover {
    color: var(--app-text);
  }
}
@media (pointer: coarse) {
  .relay-suggestions-panel__refresh, .relay-suggestions-panel__add, .relay-suggestions-panel__ignore {
    min-height: var(--app-touch-h);
  }
}
@media (prefers-reduced-motion: reduce) {
  .relay-suggestions-panel__list {
    animation: none;
  }
  .relay-suggestions-panel__row, .relay-suggestions-panel__refresh, .relay-suggestions-panel__add, .relay-suggestions-panel__ignore {
    transition: none;
  }
}
</style>
