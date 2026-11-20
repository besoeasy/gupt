<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RefreshCw } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { useIdentityStore } from "@/stores/identity";
import { useReplicationStore } from "@/stores/replication";

const identityStore = useIdentityStore();
const replicationStore = useReplicationStore();

const now = ref(Date.now());
const syncing = ref(false);
const message = ref("");
const error = ref("");
let timer = null;

const statusLabel = computed(() => {
  if (!replicationStore.active) return "Idle";
  if (typeof document !== "undefined" && document.hidden) return "Paused";
  return "Active";
});

const lastAgo = computed(() => {
  const ts = replicationStore.lastTickAt;
  if (!ts) return "never";
  const diff = Math.max(0, Math.floor((now.value - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
});

const dots = computed(() => {
  const history = replicationStore.history || [];
  return Array.from({ length: 5 }, (_, index) => {
    const entry = history[index];
    if (!entry) return "empty";
    return entry.ok ? "ok" : "err";
  });
});

const durabilityAgo = computed(() => {
  const ts = replicationStore.durability?.checkedAt;
  if (!ts) return "never";
  const diff = Math.max(0, Math.floor((now.value - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
});

const durabilityMissing = computed(() => Number(replicationStore.durability?.missingEvents) || 0);
const durabilityChecked = computed(() => Number(replicationStore.durability?.events) || 0);

const busy = computed(() => syncing.value || replicationStore.active);

const lastTickFailed = computed(() => {
  const history = replicationStore.history || [];
  const latest = history[history.length - 1];
  return Boolean(latest && !latest.ok);
});

async function handleSync() {
  if (syncing.value) return;
  syncing.value = true;
  message.value = "";
  error.value = "";
  try {
    await replicationStore.triggerSyncNow(identityStore);
    message.value = "Relay sync finished.";
  } catch (e) {
    error.value = e.message || "Sync failed.";
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="settings-sync-panel__block">
    <div class="settings-sync-panel__block-2">
      <span
        class="settings-sync-panel__text"
      >
        <span
          class="settings-sync-panel__text-2"
          :class="replicationStore.active ? 'settings-sync-panel__text--success' : 'settings-sync-panel__text--muted'"
        />
        {{ statusLabel }} &middot; {{ lastAgo }}
      </span>
    </div>

    <div class="settings-sync-panel__block-3">
      <div class="settings-sync-panel__block-4">
        <div class="settings-sync-panel__block-5">
          <p class="settings-sync-panel__text-recent-relay">
            Recent relay ticks
          </p>
          <p class="settings-sync-panel__text-3">Last five sync attempts on relays.</p>
        </div>
        <span class="settings-sync-panel__text-4">
          <span
            v-for="(dot, i) in dots"
            :key="i"
            class="settings-sync-panel__text-5"
            :class="{
              'settings-sync-panel__text--success-2': dot === 'ok',
              'settings-sync-panel__text--danger': dot === 'err',
              'settings-sync-panel__text--selected': dot === 'empty',
            }"
          />
        </span>
        <span
          v-if="busy"
          class="settings-sync-panel__text-6"
          aria-live="polite"
        >
          <RefreshCw class="settings-sync-panel__refresh-cw" :stroke-width="2" />
          Syncing…
        </span>
        <button
          v-else
          type="button"
          class="settings-sync-panel__button"
          :class="
            lastTickFailed
              ? 'settings-sync-panel__button--warning'
              : 'settings-sync-panel__button--variant-2'
          "
          @click="handleSync"
        >
          <RefreshCw class="settings-sync-panel__refresh-cw-2" :stroke-width="2" />
          {{ lastTickFailed ? "Retry" : "Sync now" }}
        </button>
      </div>

      <div v-if="replicationStore.durability" class="settings-sync-panel__block-6">
        <div class="settings-sync-panel__block-7">
          <p class="settings-sync-panel__text-relay-copies">Relay copies</p>
          <p class="settings-sync-panel__text-7">
            Newest vault events verified on relays &middot; {{ durabilityAgo }}.
          </p>
        </div>
        <span
          class="settings-sync-panel__text-8"
          :class="durabilityMissing ? 'settings-sync-panel__text--danger-2' : 'settings-sync-panel__text--success-3'"
          :title="`${durabilityChecked} event heads checked`"
        >
          {{
            durabilityMissing
              ? `${durabilityMissing} lost`
              : `${replicationStore.durability.liveCopies} copies`
          }}
        </span>
      </div>
    </div>

    <div v-if="message || error" class="settings-sync-panel__block-8">
      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {










@media (hover:hover) {
.settings-sync-panel__button--variant-2:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-sync-panel__button--warning:hover {
  background-color: #f99c0026;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.settings-sync-panel__button--warning:hover {
  background-color: color-mix(in oklab,var(--color-amber-500) 15%,transparent);
}
}
}

@media (hover:hover) {
.settings-sync-panel__button--variant-2:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.settings-sync-panel__button--variant-2:hover {
  color: var(--color-white);
}
}

@layer gupt-components {
.settings-sync-panel__text-3 {
  margin-top: calc(var(--spacing) * .5);
}
.settings-sync-panel__text-7 {
  margin-top: calc(var(--spacing) * .5);
}
.settings-sync-panel__block-2 {
  display: flex;
}
.settings-sync-panel__block-4 {
  display: flex;
}
.settings-sync-panel__text-4 {
  display: flex;
}
.settings-sync-panel__block-6 {
  display: flex;
}
.settings-sync-panel__text {
  display: inline-flex;
}
.settings-sync-panel__text-6 {
  display: inline-flex;
}
.settings-sync-panel__button {
  display: inline-flex;
}
.settings-sync-panel__text-2 {
  height: calc(var(--spacing) * 1.5);
}
.settings-sync-panel__text-5 {
  height: calc(var(--spacing) * 1.5);
}
.settings-sync-panel__refresh-cw {
  height: calc(var(--spacing) * 3);
}
.settings-sync-panel__refresh-cw-2 {
  height: calc(var(--spacing) * 3);
}
.settings-sync-panel__button {
  height: calc(var(--spacing) * 7);
}
.settings-sync-panel__text-2 {
  width: calc(var(--spacing) * 1.5);
}
.settings-sync-panel__text-5 {
  width: calc(var(--spacing) * 1.5);
}
.settings-sync-panel__refresh-cw {
  width: calc(var(--spacing) * 3);
}
.settings-sync-panel__refresh-cw-2 {
  width: calc(var(--spacing) * 3);
}
.settings-sync-panel__block-5 {
  min-width: 0;
}
.settings-sync-panel__block-7 {
  min-width: 0;
}
.settings-sync-panel__block-5 {
  flex: 1;
}
.settings-sync-panel__block-7 {
  flex: 1;
}
.settings-sync-panel__text-4 {
  flex-shrink: 0;
}
.settings-sync-panel__text-6 {
  flex-shrink: 0;
}
.settings-sync-panel__button {
  flex-shrink: 0;
}
.settings-sync-panel__text-8 {
  flex-shrink: 0;
}
.settings-sync-panel__refresh-cw {
  animation: var(--animate-spin);
}
.settings-sync-panel__button {
  cursor: pointer;
}
.settings-sync-panel__block-2 {
  align-items: center;
}
.settings-sync-panel__text {
  align-items: center;
}
.settings-sync-panel__block-4 {
  align-items: center;
}
.settings-sync-panel__text-4 {
  align-items: center;
}
.settings-sync-panel__text-6 {
  align-items: center;
}
.settings-sync-panel__button {
  align-items: center;
}
.settings-sync-panel__block-6 {
  align-items: center;
}
.settings-sync-panel__block-2 {
  justify-content: flex-end;
}
.settings-sync-panel__text-4 {
  gap: var(--spacing);
}
.settings-sync-panel__text {
  gap: calc(var(--spacing) * 1.5);
}
.settings-sync-panel__text-6 {
  gap: calc(var(--spacing) * 1.5);
}
.settings-sync-panel__button {
  gap: calc(var(--spacing) * 1.5);
}
.settings-sync-panel__block-2 {
  gap: calc(var(--spacing) * 3);
}
.settings-sync-panel__block-4 {
  gap: calc(var(--spacing) * 3);
}
.settings-sync-panel__block-6 {
  gap: calc(var(--spacing) * 3);
}
:where(.settings-sync-panel__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.settings-sync-panel__block-8>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.settings-sync-panel__block-3>:not(:last-child)) {
  --divide-y-reverse: 0;
  border-bottom-style: var(--border-style,solid);
  border-top-style: var(--border-style,solid);
  border-top-width: calc(1px * 0);
  border-bottom-width: calc(1px * calc(1 - 0));
}
:where(.settings-sync-panel__block-3>:not(:last-child)) {
  border-color: var(--ui-zinc-800);
}
.settings-sync-panel__text-recent-relay {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.settings-sync-panel__text-3 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.settings-sync-panel__text-relay-copies {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.settings-sync-panel__text-7 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.settings-sync-panel__text-2 {
  border-radius: 3.40282e38px;
}
.settings-sync-panel__text-5 {
  border-radius: 3.40282e38px;
}
.settings-sync-panel__button {
  border-radius: var(--radius-md);
}
.settings-sync-panel__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-sync-panel__button--warning {
  border-color: #f99c004d;
}
.settings-sync-panel__button--variant-2 {
  border-color: var(--ui-zinc-800);
}
.settings-sync-panel__button--warning {
  background-color: var(--app-warning-soft);
}
.settings-sync-panel__text--success {
  background-color: var(--color-emerald-400);
}
.settings-sync-panel__text--success-2 {
  background-color: var(--color-emerald-400);
}
.settings-sync-panel__text--danger {
  background-color: var(--color-red-400);
}
.settings-sync-panel__text--muted {
  background-color: var(--ui-zinc-600);
}
.settings-sync-panel__text--selected {
  background-color: var(--ui-zinc-800);
}
.settings-sync-panel__button--variant-2 {
  background-color: var(--ui-zinc-900);
}
.settings-sync-panel__block-2 {
  padding-inline: var(--spacing);
}
.settings-sync-panel__button {
  padding-inline: calc(var(--spacing) * 2.5);
}
.settings-sync-panel__block-4 {
  padding-block: calc(var(--spacing) * 3.5);
}
.settings-sync-panel__block-6 {
  padding-block: calc(var(--spacing) * 3.5);
}
.settings-sync-panel__block-8 {
  padding-top: calc(var(--spacing) * 2);
}
.settings-sync-panel__text {
  font-family: var(--font-mono);
}
.settings-sync-panel__text-6 {
  font-family: var(--font-mono);
}
.settings-sync-panel__text-8 {
  font-family: var(--font-mono);
}
.settings-sync-panel__text-recent-relay {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.settings-sync-panel__text-relay-copies {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.settings-sync-panel__text-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.settings-sync-panel__text-7 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.settings-sync-panel__text {
  font-size: 10px;
}
.settings-sync-panel__text-6 {
  font-size: 10px;
}
.settings-sync-panel__text-8 {
  font-size: 10px;
}
.settings-sync-panel__button {
  font-size: 11px;
}
.settings-sync-panel__text-recent-relay {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-sync-panel__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-sync-panel__text-relay-copies {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-sync-panel__text-recent-relay {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.settings-sync-panel__text-relay-copies {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.settings-sync-panel__button--warning {
  color: var(--color-amber-400);
}
.settings-sync-panel__text--success-3 {
  color: #00d294cc;
}
.settings-sync-panel__text--danger-2 {
  color: var(--color-red-400);
}
.settings-sync-panel__text-recent-relay {
  color: var(--ui-zinc-200);
}
.settings-sync-panel__text-relay-copies {
  color: var(--ui-zinc-200);
}
.settings-sync-panel__button--variant-2 {
  color: var(--ui-zinc-300);
}
.settings-sync-panel__text {
  color: var(--ui-zinc-500);
}
.settings-sync-panel__text-3 {
  color: var(--ui-zinc-500);
}
.settings-sync-panel__text-6 {
  color: var(--ui-zinc-500);
}
.settings-sync-panel__text-7 {
  color: var(--ui-zinc-500);
}
.settings-sync-panel__text {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.settings-sync-panel__text-8 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.settings-sync-panel__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
[data-theme="light"] .settings-sync-panel__button--warning {
  color: var(--app-warning);
}
[data-theme="light"] .settings-sync-panel__text--danger-2 {
  color: var(--app-danger);
}
[data-theme="light"] .settings-sync-panel__button--variant-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-sync-panel__text {
  color: var(--app-muted);
}
[data-theme="light"] .settings-sync-panel__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .settings-sync-panel__text-6 {
  color: var(--app-muted);
}
[data-theme="light"] .settings-sync-panel__text-7 {
  color: var(--app-muted);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
:where(.settings-sync-panel__block-3>:not(:last-child)) {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-sync-panel__button--warning {
  border-color: color-mix(in oklab,var(--color-amber-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-sync-panel__button--variant-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-sync-panel__text--success-3 {
  color: color-mix(in oklab,var(--color-emerald-400) 80%,transparent);
}
}
}
</style>
