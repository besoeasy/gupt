<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

import { useRelaySummary } from "@/composables/useRelaySummary";
import { useReplicationStore } from "@/stores/replication";

const emit = defineEmits(["navigate"]);

const replicationStore = useReplicationStore();
const { relayCount, healthyCount, unhealthyCount, suggestionCount, loaded } = useRelaySummary();

const now = ref(Date.now());
let tickTimer = null;

const syncTone = computed(() => {
  if (typeof document !== "undefined" && document.hidden) return "idle";
  if (!replicationStore.active) return "idle";
  const latest = (replicationStore.history || []).at(-1);
  if (latest && !latest.ok) return "warn";
  return "ok";
});

const syncLabel = computed(() => {
  if (syncTone.value === "idle") {
    return typeof document !== "undefined" && document.hidden ? "Paused" : "Idle";
  }
  return syncTone.value === "warn" ? "Retrying" : "Live";
});

const lastAgo = computed(() => {
  const ts = Number(replicationStore.lastTickAt) || 0;
  if (!ts) return "not yet";
  const diff = Math.max(0, Math.floor((now.value - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
});

const relaySub = computed(() => {
  if (!loaded.value) return "checking health…";
  if (unhealthyCount.value > 0) {
    return `${unhealthyCount.value} failing`;
  }
  return relayCount.value ? "all responding" : "none configured";
});
const suggestedSub = computed(() => {
  if (!loaded.value) return "checking hints…";
  if (!suggestionCount.value) return "none from your relays";
  return "verified, ready to add";
});

onMounted(() => {
  tickTimer = setInterval(() => {
    now.value = Date.now();
  }, 10_000);
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<template>
  <div class="settings-status-strip__block">
    <button
      type="button"
      class="settings-status-strip__button-go-to"
      aria-label="Go to sync settings"
      @click="emit('navigate', 'sync')"
    >
      <span class="settings-status-strip__text-sync">Sync</span>
      <span
        class="settings-status-strip__text"
      >
        <span
          class="settings-status-strip__text-2"
          :class="{
            'settings-status-strip__text--success': syncTone === 'ok',
            'settings-status-strip__text--warning': syncTone === 'warn',
            'settings-status-strip__text--muted': syncTone === 'idle',
          }"
          aria-hidden="true"
        />
        {{ syncLabel }}
      </span>
      <span class="settings-status-strip__text-last-tick">
        last tick {{ lastAgo }}
      </span>
    </button>

    <button
      type="button"
      class="settings-status-strip__button-go-to-2"
      aria-label="Go to relay settings"
      @click="emit('navigate', 'relays')"
    >
      <span class="settings-status-strip__text-relays">Relays</span>
      <span class="settings-status-strip__text-3">
        <span :class="unhealthyCount ? 'settings-status-strip__text--warning-2' : 'settings-status-strip__text--variant-2'">
          {{ healthyCount }} / {{ relayCount }}
        </span>
        <span class="settings-status-strip__text-healthy"> healthy</span>
      </span>
      <span class="settings-status-strip__text-4">{{ relaySub }}</span>
    </button>

    <button
      type="button"
      class="settings-status-strip__button-go-to-3"
      aria-label="Go to suggested relays"
      @click="emit('navigate', 'relays')"
    >
      <span class="settings-status-strip__text-suggested">
        Suggested
      </span>
      <span class="settings-status-strip__text-5">
        {{ suggestionCount }}
        <span class="settings-status-strip__text-verified">verified</span>
      </span>
      <span class="settings-status-strip__text-6">{{
        suggestedSub
      }}</span>
    </button>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.settings-status-strip__button-go-to {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-status-strip__button-go-to-2 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-status-strip__button-go-to-3 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-status-strip__button-go-to {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-status-strip__button-go-to-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-status-strip__button-go-to-3 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@media (hover:hover) {
.settings-status-strip__button-go-to:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-status-strip__button-go-to-2:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-status-strip__button-go-to-3:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-status-strip__button-go-to:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.settings-status-strip__button-go-to-2:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.settings-status-strip__button-go-to-3:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.settings-status-strip__button-go-to:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 50%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.settings-status-strip__button-go-to-2:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 50%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.settings-status-strip__button-go-to-3:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 50%,transparent);
}
}
}

@media (min-width:40rem) {
.settings-status-strip__button-go-to-3 {
  grid-column: span 1/span 1;
}
}

@media (min-width:40rem) {
.settings-status-strip__block {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
}

@layer gupt-components {
.settings-status-strip__button-go-to-3 {
  grid-column: span 2/span 2;
}
.settings-status-strip__text-last-tick {
  margin-top: calc(var(--spacing) * .5);
}
.settings-status-strip__text-4 {
  margin-top: calc(var(--spacing) * .5);
}
.settings-status-strip__text-6 {
  margin-top: calc(var(--spacing) * .5);
}
.settings-status-strip__text {
  margin-top: var(--spacing);
}
.settings-status-strip__text-3 {
  margin-top: var(--spacing);
}
.settings-status-strip__text-5 {
  margin-top: var(--spacing);
}
.settings-status-strip__button-go-to {
  display: flex;
}
.settings-status-strip__text {
  display: flex;
}
.settings-status-strip__button-go-to-2 {
  display: flex;
}
.settings-status-strip__button-go-to-3 {
  display: flex;
}
.settings-status-strip__block {
  display: grid;
}
.settings-status-strip__text-2 {
  height: calc(var(--spacing) * 1.5);
}
.settings-status-strip__text-2 {
  width: calc(var(--spacing) * 1.5);
}
.settings-status-strip__block {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
.settings-status-strip__button-go-to {
  flex-direction: column;
}
.settings-status-strip__button-go-to-2 {
  flex-direction: column;
}
.settings-status-strip__button-go-to-3 {
  flex-direction: column;
}
.settings-status-strip__text {
  align-items: center;
}
.settings-status-strip__button-go-to {
  align-items: flex-start;
}
.settings-status-strip__button-go-to-2 {
  align-items: flex-start;
}
.settings-status-strip__button-go-to-3 {
  align-items: flex-start;
}
.settings-status-strip__button-go-to {
  justify-content: center;
}
.settings-status-strip__button-go-to-2 {
  justify-content: center;
}
.settings-status-strip__button-go-to-3 {
  justify-content: center;
}
.settings-status-strip__text {
  gap: calc(var(--spacing) * 1.5);
}
.settings-status-strip__block {
  gap: calc(var(--spacing) * 2);
}
.settings-status-strip__text-2 {
  border-radius: 3.40282e38px;
}
.settings-status-strip__button-go-to {
  border-radius: var(--radius-xl);
}
.settings-status-strip__button-go-to-2 {
  border-radius: var(--radius-xl);
}
.settings-status-strip__button-go-to-3 {
  border-radius: var(--radius-xl);
}
.settings-status-strip__button-go-to {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-status-strip__button-go-to-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-status-strip__button-go-to-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-status-strip__button-go-to {
  border-color: var(--ui-zinc-800);
}
.settings-status-strip__button-go-to-2 {
  border-color: var(--ui-zinc-800);
}
.settings-status-strip__button-go-to-3 {
  border-color: var(--ui-zinc-800);
}
.settings-status-strip__text--warning {
  background-color: var(--color-amber-400);
}
.settings-status-strip__text--success {
  background-color: var(--color-emerald-400);
}
.settings-status-strip__text--muted {
  background-color: var(--ui-zinc-600);
}
.settings-status-strip__button-go-to {
  background-color: var(--ui-zinc-950);
}
.settings-status-strip__button-go-to-2 {
  background-color: var(--ui-zinc-950);
}
.settings-status-strip__button-go-to-3 {
  background-color: var(--ui-zinc-950);
}
.settings-status-strip__button-go-to {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-status-strip__button-go-to-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-status-strip__button-go-to-3 {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-status-strip__button-go-to {
  padding-block: calc(var(--spacing) * 2.5);
}
.settings-status-strip__button-go-to-2 {
  padding-block: calc(var(--spacing) * 2.5);
}
.settings-status-strip__button-go-to-3 {
  padding-block: calc(var(--spacing) * 2.5);
}
.settings-status-strip__button-go-to {
  text-align: left;
}
.settings-status-strip__button-go-to-2 {
  text-align: left;
}
.settings-status-strip__button-go-to-3 {
  text-align: left;
}
.settings-status-strip__text-sync {
  font-family: var(--font-mono);
}
.settings-status-strip__text-last-tick {
  font-family: var(--font-mono);
}
.settings-status-strip__text-relays {
  font-family: var(--font-mono);
}
.settings-status-strip__text-4 {
  font-family: var(--font-mono);
}
.settings-status-strip__text-suggested {
  font-family: var(--font-mono);
}
.settings-status-strip__text-6 {
  font-family: var(--font-mono);
}
.settings-status-strip__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.settings-status-strip__text-3 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.settings-status-strip__text-5 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.settings-status-strip__text-sync {
  font-size: 9px;
}
.settings-status-strip__text-relays {
  font-size: 9px;
}
.settings-status-strip__text-suggested {
  font-size: 9px;
}
.settings-status-strip__text-last-tick {
  font-size: 10px;
}
.settings-status-strip__text-healthy {
  font-size: 10px;
}
.settings-status-strip__text-4 {
  font-size: 10px;
}
.settings-status-strip__text-verified {
  font-size: 10px;
}
.settings-status-strip__text-6 {
  font-size: 10px;
}
.settings-status-strip__text-healthy {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-status-strip__text-verified {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-status-strip__text {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.settings-status-strip__text-3 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.settings-status-strip__text-5 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.settings-status-strip__text-sync {
  --tracking: .16em;
  letter-spacing: .16em;
}
.settings-status-strip__text-relays {
  --tracking: .16em;
  letter-spacing: .16em;
}
.settings-status-strip__text-suggested {
  --tracking: .16em;
  letter-spacing: .16em;
}
.settings-status-strip__text {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.settings-status-strip__text-3 {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.settings-status-strip__text-5 {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.settings-status-strip__text--warning-2 {
  color: var(--color-amber-400);
}
.settings-status-strip__text {
  color: var(--ui-zinc-100);
}
.settings-status-strip__text--variant-2 {
  color: var(--ui-zinc-100);
}
.settings-status-strip__text-5 {
  color: var(--ui-zinc-100);
}
.settings-status-strip__text-last-tick {
  color: var(--ui-zinc-500);
}
.settings-status-strip__text-healthy {
  color: var(--ui-zinc-500);
}
.settings-status-strip__text-4 {
  color: var(--ui-zinc-500);
}
.settings-status-strip__text-verified {
  color: var(--ui-zinc-500);
}
.settings-status-strip__text-6 {
  color: var(--ui-zinc-500);
}
.settings-status-strip__text-sync {
  color: var(--ui-zinc-600);
}
.settings-status-strip__text-relays {
  color: var(--ui-zinc-600);
}
.settings-status-strip__text-suggested {
  color: var(--ui-zinc-600);
}
.settings-status-strip__text-sync {
  text-transform: uppercase;
}
.settings-status-strip__text-relays {
  text-transform: uppercase;
}
.settings-status-strip__text-suggested {
  text-transform: uppercase;
}
.settings-status-strip__text-last-tick {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.settings-status-strip__text-3 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.settings-status-strip__text-4 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.settings-status-strip__text-5 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.settings-status-strip__text-6 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.settings-status-strip__text--success {
  --shadow: 0 0 6px var(--shadow-color,#34d3998c);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 0 6px var(--shadow-color,#34d3998c);
}
.settings-status-strip__button-go-to {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-status-strip__button-go-to-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-status-strip__button-go-to-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-status-strip__button-go-to {
  --duration: .2s;
  transition-duration: .2s;
}
.settings-status-strip__button-go-to-2 {
  --duration: .2s;
  transition-duration: .2s;
}
.settings-status-strip__button-go-to-3 {
  --duration: .2s;
  transition-duration: .2s;
}
.settings-status-strip__button-go-to:active {
  scale: .99;
}
.settings-status-strip__button-go-to-2:active {
  scale: .99;
}
.settings-status-strip__button-go-to-3:active {
  scale: .99;
}
[data-theme="light"] .settings-status-strip__text--warning-2 {
  color: var(--app-warning);
}
[data-theme="light"] .settings-status-strip__text-last-tick {
  color: var(--app-muted);
}
[data-theme="light"] .settings-status-strip__text-healthy {
  color: var(--app-muted);
}
[data-theme="light"] .settings-status-strip__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .settings-status-strip__text-verified {
  color: var(--app-muted);
}
[data-theme="light"] .settings-status-strip__text-6 {
  color: var(--app-muted);
}
[data-theme="light"] .settings-status-strip__text-sync {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-status-strip__text-relays {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-status-strip__text-suggested {
  color: var(--app-text-soft);
}
}
}
</style>
