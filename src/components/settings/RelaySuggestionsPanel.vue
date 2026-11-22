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
  <div class="relay-suggestions-panel__block">
    <div v-if="!collapsed" class="relay-suggestions-panel__block-2">
      <div class="relay-suggestions-panel__block-3">
        <p class="relay-suggestions-panel__text-suggested-relays">
          Suggested relays
          <template v-if="rows.length">
            <span class="relay-suggestions-panel__text">·</span>
            <span class="relay-suggestions-panel__text-2">{{ countLabel }}</span>
          </template>
        </p>
        <p class="relay-suggestions-panel__text-3">
          Shared by people on the relays you already use. Only verified nodes appear here.
        </p>
      </div>

      <button
        type="button"
        class="relay-suggestions-panel__button-fetch-and"
        :disabled="refreshing"
        title="Fetch and verify suggestions again"
        @click="load({ force: true })"
      >
        <RefreshCw
          class="relay-suggestions-panel__refresh-cw"
          :class="refreshing ? 'relay-suggestions-panel__refresh-cw--spin' : ''"
          :stroke-width="2"
          aria-hidden="true"
        />
        Refresh
      </button>
    </div>

    <Transition
      enter-active-class="relay-suggestions-panel__enter-active-class"
      enter-from-class="relay-suggestions-panel__enter-from-class"
      enter-to-class="relay-suggestions-panel__enter-to-class"
      leave-active-class="relay-suggestions-panel__leave-active-class"
    >
      <p
        v-if="addedLabel"
        class="relay-suggestions-panel__status"
        role="status"
        aria-live="polite"
      >
        {{ addedLabel }}
      </p>
    </Transition>

    <div v-if="!collapsed && loading" class="relay-suggestions-panel__block-4" aria-hidden="true">
      <div
        v-for="index in 2"
        :key="index"
        class="relay-suggestions-panel__block-5"
      />
    </div>

    <div v-else-if="rows.length" class="relay-suggestions-panel__block-6">
      <div
        v-for="row in rows"
        :key="row.url"
        class="relay-suggestions-panel__block-7"
      >
        <div class="relay-suggestions-panel__block-8">
          <span
            class="relay-suggestions-panel__text-verified-rabta"
            title="Verified Rabta v1 node"
          >
            <ShieldCheck class="relay-suggestions-panel__shield-check" :stroke-width="2" aria-hidden="true" />
          </span>

          <div class="relay-suggestions-panel__block-9">
            <p class="relay-suggestions-panel__text-4" :title="row.url">
              {{ row.label }}
            </p>

            <div
              class="relay-suggestions-panel__block-10"
            >
              <span
                class="relay-suggestions-panel__text-5"
                :class="
                  row.contactCount > 0
                    ? 'relay-suggestions-panel__text--success'
                    : 'relay-suggestions-panel__text--muted'
                "
              >
                <Users class="relay-suggestions-panel__users" :stroke-width="2.5" aria-hidden="true" />
                {{ trustLabel(row) }}
              </span>
              <span class="relay-suggestions-panel__text-verified">Verified</span>
              <span
                v-if="row.mode === 'sync_disabled'"
                class="relay-suggestions-panel__text-this-relay"
                title="This relay paused peer sync until its battery regenerates"
              >
                sync-off
              </span>
              <span v-if="row.latencyMs > 0" class="relay-suggestions-panel__text-ms">{{ row.latencyMs }}ms</span>
              <span v-if="row.nodeId" class="relay-suggestions-panel__text-node" :title="row.nodeId">
                node {{ row.nodeId.slice(0, 8) }}
              </span>
            </div>

            <p
              v-if="row.note"
              class="relay-suggestions-panel__text-6"
              :title="row.note"
            >
              “{{ row.note }}”
            </p>
            <p
              v-if="row.contactCount === 0"
              class="relay-suggestions-panel__text-7"
            >
              No one you know vouches for this node — adding it shares your IP with its operator.
            </p>
          </div>

          <div class="relay-suggestions-panel__block-11">
            <button
              type="button"
              class="relay-suggestions-panel__button-add"
              :aria-label="`Add relay ${row.label}`"
              @click="handleAdd(row)"
            >
              <Plus class="relay-suggestions-panel__plus" :stroke-width="2.5" aria-hidden="true" />
              Add
            </button>
            <button
              type="button"
              class="relay-suggestions-panel__button-ignore"
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
      class="relay-suggestions-panel__text-8"
    >
      <LoaderCircle class="relay-suggestions-panel__loader-circle" :stroke-width="2" aria-hidden="true" />
      Couldn't reach your relays for suggestions. They'll retry on Refresh.
    </p>

    <div v-else-if="!collapsed" class="relay-suggestions-panel__block-12">
      <Check class="relay-suggestions-panel__check" :stroke-width="2" aria-hidden="true" />
      <p class="relay-suggestions-panel__text-9">
        No relay suggestions yet. Hints appear here when people on your relays share one.
      </p>
    </div>

    <div v-if="collapsed && failed" class="relay-suggestions-panel__compact">
      <span class="relay-suggestions-panel__text-none">
        Couldn't reach your relays for suggestions
      </span>
      <button
        type="button"
        class="relay-suggestions-panel__button-fetch-and"
        :disabled="refreshing"
        title="Fetch and verify suggestions again"
        @click="load({ force: true })"
      >
        <RefreshCw
          class="relay-suggestions-panel__refresh-cw"
          :class="refreshing ? 'relay-suggestions-panel__refresh-cw--spin' : ''"
          :stroke-width="2"
          aria-hidden="true"
        />
        Refresh
      </button>
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.relay-suggestions-panel__block-7:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__block-7:hover {
  border-color: color-mix(in oklab,var(--ui-zinc-700) 80%,transparent);
}
}
}

@media (hover:hover) {
.relay-suggestions-panel__button-add:hover {
  background-color: #00bb7f40;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__button-add:hover {
  background-color: color-mix(in oklab,var(--color-emerald-500) 25%,transparent);
}
}
}

@media (hover:hover) {
.relay-suggestions-panel__button-fetch-and:hover {
  background-color: #ffffff0d;
}
}

@media (hover:hover) {
.relay-suggestions-panel__button-ignore:hover {
  background-color: #ffffff0d;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__button-fetch-and:hover {
  background-color: color-mix(in oklab,var(--color-white) 5%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__button-ignore:hover {
  background-color: color-mix(in oklab,var(--color-white) 5%,transparent);
}
}
}

@media (hover:hover) {
.relay-suggestions-panel__button-fetch-and:hover {
  color: var(--ui-zinc-300);
}
}

@media (hover:hover) {
.relay-suggestions-panel__button-ignore:hover {
  color: var(--ui-zinc-300);
}
}

@media (min-width:40rem) {
.relay-suggestions-panel__button-fetch-and {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.relay-suggestions-panel__button-add {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.relay-suggestions-panel__button-ignore {
  min-height: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.relay-suggestions-panel__text-verified-rabta {
  margin-top: calc(var(--spacing) * .5);
}
.relay-suggestions-panel__text-3 {
  margin-top: var(--spacing);
}
.relay-suggestions-panel__block-10 {
  margin-top: var(--spacing);
}
.relay-suggestions-panel__text-6 {
  margin-top: var(--spacing);
}
.relay-suggestions-panel__text-7 {
  margin-top: var(--spacing);
}
.relay-suggestions-panel__text-6 {
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  display: -webkit-box;
  overflow: hidden;
}
.relay-suggestions-panel__block-2 {
  display: flex;
}
.relay-suggestions-panel__block-8 {
  display: flex;
}
.relay-suggestions-panel__text-verified-rabta {
  display: flex;
}
.relay-suggestions-panel__block-10 {
  display: flex;
}
.relay-suggestions-panel__block-11 {
  display: flex;
}
.relay-suggestions-panel__text-8 {
  display: flex;
}
.relay-suggestions-panel__block-12 {
  display: flex;
}
.relay-suggestions-panel__button-fetch-and {
  display: inline-flex;
}
.relay-suggestions-panel__text-5 {
  display: inline-flex;
}
.relay-suggestions-panel__button-add {
  display: inline-flex;
}
.relay-suggestions-panel__button-ignore {
  display: inline-flex;
}
.relay-suggestions-panel__users {
  height: calc(var(--spacing) * 2.5);
}
.relay-suggestions-panel__refresh-cw {
  height: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__plus {
  height: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__loader-circle {
  height: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__check {
  height: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__shield-check {
  height: calc(var(--spacing) * 3.5);
}
.relay-suggestions-panel__text-verified-rabta {
  height: calc(var(--spacing) * 6);
}
.relay-suggestions-panel__block-5 {
  height: calc(var(--spacing) * 16);
}
.relay-suggestions-panel__button-fetch-and {
  min-height: calc(var(--spacing) * 11);
}
.relay-suggestions-panel__button-add {
  min-height: calc(var(--spacing) * 11);
}
.relay-suggestions-panel__button-ignore {
  min-height: calc(var(--spacing) * 11);
}
.relay-suggestions-panel__users {
  width: calc(var(--spacing) * 2.5);
}
.relay-suggestions-panel__refresh-cw {
  width: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__plus {
  width: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__loader-circle {
  width: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__check {
  width: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__shield-check {
  width: calc(var(--spacing) * 3.5);
}
.relay-suggestions-panel__text-verified-rabta {
  width: calc(var(--spacing) * 6);
}
.relay-suggestions-panel__block-3 {
  min-width: 0;
}
.relay-suggestions-panel__block-9 {
  min-width: 0;
}
.relay-suggestions-panel__block-10 {
  min-width: 0;
}
.relay-suggestions-panel__block-9 {
  flex: 1;
}
.relay-suggestions-panel__text-verified-rabta {
  flex-shrink: 0;
}
.relay-suggestions-panel__block-11 {
  flex-shrink: 0;
}
.relay-suggestions-panel__check {
  flex-shrink: 0;
}
.relay-suggestions-panel__enter-from-class {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.relay-suggestions-panel__enter-to-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.relay-suggestions-panel__block-5 {
  animation: var(--animate-pulse);
}
.relay-suggestions-panel__refresh-cw--spin {
  animation: var(--animate-spin);
}
.relay-suggestions-panel__button-fetch-and {
  cursor: pointer;
}
.relay-suggestions-panel__button-add {
  cursor: pointer;
}
.relay-suggestions-panel__button-ignore {
  cursor: pointer;
}
.relay-suggestions-panel__block-2 {
  flex-wrap: wrap;
}
.relay-suggestions-panel__block-10 {
  flex-wrap: wrap;
}
.relay-suggestions-panel__block-2 {
  align-items: center;
}
.relay-suggestions-panel__button-fetch-and {
  align-items: center;
}
.relay-suggestions-panel__text-verified-rabta {
  align-items: center;
}
.relay-suggestions-panel__block-10 {
  align-items: center;
}
.relay-suggestions-panel__text-5 {
  align-items: center;
}
.relay-suggestions-panel__block-11 {
  align-items: center;
}
.relay-suggestions-panel__button-add {
  align-items: center;
}
.relay-suggestions-panel__button-ignore {
  align-items: center;
}
.relay-suggestions-panel__text-8 {
  align-items: center;
}
.relay-suggestions-panel__block-12 {
  align-items: center;
}
.relay-suggestions-panel__block-8 {
  align-items: flex-start;
}
.relay-suggestions-panel__block-2 {
  justify-content: space-between;
}
.relay-suggestions-panel__text-verified-rabta {
  justify-content: center;
}
.relay-suggestions-panel__button-add {
  justify-content: center;
}
.relay-suggestions-panel__button-ignore {
  justify-content: center;
}
.relay-suggestions-panel__button-fetch-and {
  gap: var(--spacing);
}
.relay-suggestions-panel__text-5 {
  gap: var(--spacing);
}
.relay-suggestions-panel__block-11 {
  gap: var(--spacing);
}
.relay-suggestions-panel__button-add {
  gap: var(--spacing);
}
.relay-suggestions-panel__text-8 {
  gap: calc(var(--spacing) * 1.5);
}
.relay-suggestions-panel__block-2 {
  gap: calc(var(--spacing) * 2);
}
.relay-suggestions-panel__block-12 {
  gap: calc(var(--spacing) * 2);
}
.relay-suggestions-panel__block-8 {
  gap: calc(var(--spacing) * 2.5);
}
:where(.relay-suggestions-panel__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.relay-suggestions-panel__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.relay-suggestions-panel__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
.relay-suggestions-panel__block-10 {
  column-gap: calc(var(--spacing) * 2);
}
.relay-suggestions-panel__block-10 {
  row-gap: var(--spacing);
}
.relay-suggestions-panel__text-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.relay-suggestions-panel__text-node {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.relay-suggestions-panel__text-5 {
  border-radius: .25rem;
}
.relay-suggestions-panel__text-verified {
  border-radius: .25rem;
}
.relay-suggestions-panel__text-this-relay {
  border-radius: .25rem;
}
.relay-suggestions-panel__button-fetch-and {
  border-radius: var(--radius-lg);
}
.relay-suggestions-panel__text-verified-rabta {
  border-radius: var(--radius-lg);
}
.relay-suggestions-panel__button-add {
  border-radius: var(--radius-lg);
}
.relay-suggestions-panel__button-ignore {
  border-radius: var(--radius-lg);
}
.relay-suggestions-panel__block-5 {
  border-radius: var(--radius-xl);
}
.relay-suggestions-panel__block-7 {
  border-radius: var(--radius-xl);
}
.relay-suggestions-panel__block-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.relay-suggestions-panel__block-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.relay-suggestions-panel__block {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.relay-suggestions-panel__block {
  border-color: var(--app-border-faint);
}
.relay-suggestions-panel__block-5 {
  border-color: var(--app-border-faint);
}
.relay-suggestions-panel__block-7 {
  border-color: var(--ui-zinc-800);
}
.relay-suggestions-panel__text-verified-rabta {
  background-color: #00bb7f1a;
}
.relay-suggestions-panel__text--success {
  background-color: #00bb7f1a;
}
.relay-suggestions-panel__button-add {
  background-color: #00bb7f26;
}
.relay-suggestions-panel__text-this-relay {
  background-color: #edb2001a;
}
.relay-suggestions-panel__text--muted {
  background-color: var(--ui-zinc-800);
}
.relay-suggestions-panel__text-verified {
  background-color: var(--ui-zinc-800);
}
.relay-suggestions-panel__block-5 {
  background-color: var(--app-surface-tint-soft);
}
.relay-suggestions-panel__block-7 {
  background-color: var(--app-surface-inset);
}
.relay-suggestions-panel__block-2 {
  padding-inline: var(--spacing);
}
.relay-suggestions-panel__status {
  padding-inline: var(--spacing);
}
.relay-suggestions-panel__text-8 {
  padding-inline: var(--spacing);
}
.relay-suggestions-panel__block-12 {
  padding-inline: var(--spacing);
}
.relay-suggestions-panel__text-5 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.relay-suggestions-panel__text-verified {
  padding-inline: calc(var(--spacing) * 1.5);
}
.relay-suggestions-panel__text-this-relay {
  padding-inline: calc(var(--spacing) * 1.5);
}
.relay-suggestions-panel__button-fetch-and {
  padding-inline: calc(var(--spacing) * 2);
}
.relay-suggestions-panel__button-ignore {
  padding-inline: calc(var(--spacing) * 2);
}
.relay-suggestions-panel__button-add {
  padding-inline: calc(var(--spacing) * 2.5);
}
.relay-suggestions-panel__block-7 {
  padding-inline: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__text-5 {
  padding-block: calc(var(--spacing) * .5);
}
.relay-suggestions-panel__text-verified {
  padding-block: calc(var(--spacing) * .5);
}
.relay-suggestions-panel__text-this-relay {
  padding-block: calc(var(--spacing) * .5);
}
.relay-suggestions-panel__block-7 {
  padding-block: calc(var(--spacing) * 2.5);
}
.relay-suggestions-panel__text-8 {
  padding-block: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__block-12 {
  padding-block: calc(var(--spacing) * 3);
}
.relay-suggestions-panel__block {
  padding-top: calc(var(--spacing) * 4);
}
.relay-suggestions-panel__text-suggested-relays {
  font-family: var(--font-mono);
}
.relay-suggestions-panel__button-fetch-and {
  font-family: var(--font-mono);
}
.relay-suggestions-panel__status {
  font-family: var(--font-mono);
}
.relay-suggestions-panel__text-4 {
  font-family: var(--font-mono);
}
.relay-suggestions-panel__block-10 {
  font-family: var(--font-mono);
}
.relay-suggestions-panel__button-add {
  font-family: var(--font-mono);
}
.relay-suggestions-panel__button-ignore {
  font-family: var(--font-mono);
}
.relay-suggestions-panel__text-8 {
  font-family: var(--font-mono);
}
.relay-suggestions-panel__text-9 {
  font-family: var(--font-mono);
}
.relay-suggestions-panel__text-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.relay-suggestions-panel__text-suggested-relays {
  font-size: 10px;
}
.relay-suggestions-panel__text-3 {
  font-size: 10px;
}
.relay-suggestions-panel__button-fetch-and {
  font-size: 10px;
}
.relay-suggestions-panel__status {
  font-size: 10px;
}
.relay-suggestions-panel__block-10 {
  font-size: 10px;
}
.relay-suggestions-panel__text-6 {
  font-size: 10px;
}
.relay-suggestions-panel__text-7 {
  font-size: 10px;
}
.relay-suggestions-panel__button-add {
  font-size: 10px;
}
.relay-suggestions-panel__button-ignore {
  font-size: 10px;
}
.relay-suggestions-panel__text-8 {
  font-size: 10px;
}
.relay-suggestions-panel__text-9 {
  font-size: 10px;
}
.relay-suggestions-panel__text-3 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.relay-suggestions-panel__text-6 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.relay-suggestions-panel__text-7 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.relay-suggestions-panel__text-9 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.relay-suggestions-panel__button-add {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.relay-suggestions-panel__text-suggested-relays {
  --tracking: .16em;
  letter-spacing: .16em;
}
.relay-suggestions-panel__text-7 {
  color: #f99c00b3;
}
.relay-suggestions-panel__button-add {
  color: var(--color-emerald-300);
}
.relay-suggestions-panel__status {
  color: var(--color-emerald-400);
}
.relay-suggestions-panel__text-verified-rabta {
  color: var(--color-emerald-400);
}
.relay-suggestions-panel__text--success {
  color: var(--color-emerald-400);
}
.relay-suggestions-panel__text-this-relay {
  color: var(--color-yellow-400);
}
.relay-suggestions-panel__text-4 {
  color: var(--ui-zinc-200);
}
.relay-suggestions-panel__text--muted {
  color: var(--ui-zinc-400);
}
.relay-suggestions-panel__text-verified {
  color: var(--ui-zinc-400);
}
.relay-suggestions-panel__text-2 {
  color: var(--ui-zinc-500);
}
.relay-suggestions-panel__button-fetch-and {
  color: var(--ui-zinc-500);
}
.relay-suggestions-panel__text-ms {
  color: var(--ui-zinc-500);
}
.relay-suggestions-panel__text-6 {
  color: var(--ui-zinc-500);
}
.relay-suggestions-panel__button-ignore {
  color: var(--ui-zinc-500);
}
.relay-suggestions-panel__text-suggested-relays {
  color: var(--ui-zinc-600);
}
.relay-suggestions-panel__text-3 {
  color: var(--ui-zinc-600);
}
.relay-suggestions-panel__text-node {
  color: var(--ui-zinc-600);
}
.relay-suggestions-panel__text-8 {
  color: var(--ui-zinc-600);
}
.relay-suggestions-panel__text-9 {
  color: var(--ui-zinc-600);
}
.relay-suggestions-panel__text {
  color: var(--ui-zinc-700);
}
.relay-suggestions-panel__check {
  color: var(--ui-zinc-700);
}
.relay-suggestions-panel__text-suggested-relays {
  text-transform: uppercase;
}
.relay-suggestions-panel__text-suggested-relays {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.relay-suggestions-panel__block-10 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.relay-suggestions-panel__enter-from-class {
  opacity: 0;
}
.relay-suggestions-panel__enter-to-class {
  opacity: 1;
}
.relay-suggestions-panel__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-suggestions-panel__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-suggestions-panel__button-fetch-and {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-suggestions-panel__block-7 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-suggestions-panel__button-add {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-suggestions-panel__button-ignore {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-suggestions-panel__enter-active-class {
  --duration: .2s;
  transition-duration: .2s;
}
.relay-suggestions-panel__leave-active-class {
  --duration: .2s;
  transition-duration: .2s;
}
.relay-suggestions-panel__block-7 {
  --duration: .2s;
  transition-duration: .2s;
}
.relay-suggestions-panel__leave-active-class {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.relay-suggestions-panel__enter-active-class {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.relay-suggestions-panel__button-fetch-and:active {
  scale: .98;
}
.relay-suggestions-panel__button-add:active {
  scale: .98;
}
.relay-suggestions-panel__button-ignore:active {
  scale: .98;
}
[data-theme="light"] .relay-suggestions-panel__button-add {
  color: var(--app-success);
}
[data-theme="light"] .relay-suggestions-panel__status {
  color: var(--app-success);
}
[data-theme="light"] .relay-suggestions-panel__text-verified-rabta {
  color: var(--app-success);
}
[data-theme="light"] .relay-suggestions-panel__text--success {
  color: var(--app-success);
}
[data-theme="light"] .relay-suggestions-panel__text--muted {
  color: var(--app-muted);
}
[data-theme="light"] .relay-suggestions-panel__text-verified {
  color: var(--app-muted);
}
[data-theme="light"] .relay-suggestions-panel__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .relay-suggestions-panel__button-fetch-and {
  color: var(--app-muted);
}
[data-theme="light"] .relay-suggestions-panel__text-ms {
  color: var(--app-muted);
}
[data-theme="light"] .relay-suggestions-panel__text-6 {
  color: var(--app-muted);
}
[data-theme="light"] .relay-suggestions-panel__button-ignore {
  color: var(--app-muted);
}
[data-theme="light"] .relay-suggestions-panel__text-suggested-relays {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-suggestions-panel__text-3 {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-suggestions-panel__text-node {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-suggestions-panel__text-8 {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-suggestions-panel__text-9 {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-suggestions-panel__button-fetch-and:hover {
  background-color: var(--app-surface-hover) !important;
}
[data-theme="light"] .relay-suggestions-panel__button-ignore:hover {
  background-color: var(--app-surface-hover) !important;
}
[data-theme="light"] .relay-suggestions-panel__button-fetch-and:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .relay-suggestions-panel__button-ignore:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {

@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__block-7 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__text-verified-rabta {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__text--success {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__button-add {
  background-color: color-mix(in oklab,var(--color-emerald-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__text-this-relay {
  background-color: color-mix(in oklab,var(--color-yellow-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__text--muted {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__text-verified {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-suggestions-panel__text-7 {
  color: color-mix(in oklab,var(--color-amber-500) 70%,transparent);
}
}
}

@layer gupt-components {
.relay-suggestions-panel__compact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 2);
}

.relay-suggestions-panel__text-none {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ui-zinc-500);
}

[data-theme="light"] .relay-suggestions-panel__text-none {
  color: var(--app-muted);
}
}
</style>
