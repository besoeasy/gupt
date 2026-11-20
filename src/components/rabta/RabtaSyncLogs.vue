<script setup>
import { computed } from "vue";
import { Terminal, Trash2 } from "@lucide/vue";

const props = defineProps({
  logs: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["clear"]);

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toTimeString().split(" ")[0];
}

function levelClass(level) {
  if (level === "error") return "rabta-sync-logs__danger";
  if (level === "warn") return "rabta-sync-logs__warning";
  return "rabta-sync-logs__muted";
}
</script>

<template>
  <div class="rabta-sync-logs__block">
    <div class="rabta-sync-logs__block-2">
      <div class="rabta-sync-logs__block-3">
        <Terminal class="rabta-sync-logs__terminal" :stroke-width="1.8" />
        <h3 class="rabta-sync-logs__heading-live-worker">Live Worker Sync Audit</h3>
        <span class="rabta-sync-logs__text">({{ logs.length }})</span>
      </div>

      <button
        v-if="logs.length"
        type="button"
        class="rabta-sync-logs__button-clear"
        @click="emit('clear')"
      >
        <Trash2 class="rabta-sync-logs__trash2" :stroke-width="2" />
        Clear
      </button>
    </div>

    <!-- Log records -->
    <div
      v-if="logs.length"
      class="rabta-sync-logs__block-4"
    >
      <div
        v-for="log in logs"
        :key="log.id"
        class="rabta-sync-logs__block-5"
      >
        <span class="rabta-sync-logs__text-2">{{ formatTime(log.timestamp) }}</span>
        <span
          class="rabta-sync-logs__text-3"
          :class="levelClass(log.level)"
        >
          {{ log.level }}
        </span>
        <span class="rabta-sync-logs__text-4">{{ log.message }}</span>
      </div>
    </div>

    <div
      v-else
      class="rabta-sync-logs__block-6"
    >
      Worker idle. Logs from cross-server sync operations will appear here in real time.
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {




















@media (hover:hover) {
.rabta-sync-logs__button-clear:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.rabta-sync-logs__button-clear:hover {
  color: var(--ui-zinc-200);
}
}

@layer gupt-components {
.rabta-sync-logs__block-2 {
  display: flex;
}
.rabta-sync-logs__block-3 {
  display: flex;
}
.rabta-sync-logs__block-5 {
  display: flex;
}
.rabta-sync-logs__button-clear {
  display: inline-flex;
}
.rabta-sync-logs__trash2 {
  height: calc(var(--spacing) * 3);
}
.rabta-sync-logs__terminal {
  height: calc(var(--spacing) * 4);
}
.rabta-sync-logs__button-clear {
  height: calc(var(--spacing) * 8);
}
.rabta-sync-logs__block-4 {
  max-height: calc(var(--spacing) * 56);
}
.rabta-sync-logs__trash2 {
  width: calc(var(--spacing) * 3);
}
.rabta-sync-logs__terminal {
  width: calc(var(--spacing) * 4);
}
.rabta-sync-logs__text-4 {
  min-width: 0;
}
.rabta-sync-logs__text-4 {
  flex: 1;
}
.rabta-sync-logs__text-2 {
  flex-shrink: 0;
}
.rabta-sync-logs__text-3 {
  flex-shrink: 0;
}
.rabta-sync-logs__button-clear {
  cursor: pointer;
}
.rabta-sync-logs__block-4 {
  scrollbar-width: thin;
}
.rabta-sync-logs__block-2 {
  align-items: center;
}
.rabta-sync-logs__block-3 {
  align-items: center;
}
.rabta-sync-logs__button-clear {
  align-items: center;
}
.rabta-sync-logs__block-5 {
  align-items: flex-start;
}
.rabta-sync-logs__block-2 {
  justify-content: space-between;
}
.rabta-sync-logs__button-clear {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-logs__block-3 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-logs__block-5 {
  gap: calc(var(--spacing) * 2);
}
:where(.rabta-sync-logs__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.rabta-sync-logs__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
.rabta-sync-logs__block-4 {
  overflow-y: auto;
}
.rabta-sync-logs__block-5 {
  border-radius: .25rem;
}
.rabta-sync-logs__text-3 {
  border-radius: .25rem;
}
.rabta-sync-logs__button-clear {
  border-radius: var(--radius-lg);
}
.rabta-sync-logs__block-6 {
  border-radius: var(--radius-lg);
}
.rabta-sync-logs__block {
  border-radius: var(--radius-xl);
}
.rabta-sync-logs__block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-logs__button-clear {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-logs__text-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-logs__block-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-logs__block-6 {
  --border-style: dashed;
  border-style: dashed;
}
.rabta-sync-logs__warning {
  border-color: #f99c0033;
}
.rabta-sync-logs__danger {
  border-color: #fb2c3633;
}
.rabta-sync-logs__muted {
  border-color: var(--ui-zinc-700);
}
.rabta-sync-logs__button-clear {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-logs__block-6 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-logs__block {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-logs__warning {
  background-color: var(--app-warning-soft);
}
.rabta-sync-logs__danger {
  background-color: var(--app-danger-soft);
}
.rabta-sync-logs__muted {
  background-color: var(--ui-zinc-800);
}
.rabta-sync-logs__block {
  background-color: var(--ui-zinc-900);
}
.rabta-sync-logs__button-clear {
  background-color: var(--ui-zinc-900);
}
.rabta-sync-logs__block-5 {
  background-color: var(--ui-zinc-950);
}
.rabta-sync-logs__block {
  padding: calc(var(--spacing) * 4);
}
.rabta-sync-logs__text-3 {
  padding-inline: var(--spacing);
}
.rabta-sync-logs__button-clear {
  padding-inline: calc(var(--spacing) * 2.5);
}
.rabta-sync-logs__block-5 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.rabta-sync-logs__block-5 {
  padding-block: calc(var(--spacing) * 1.5);
}
.rabta-sync-logs__block-6 {
  padding-block: calc(var(--spacing) * 6);
}
.rabta-sync-logs__block-4 {
  padding-right: var(--spacing);
}
.rabta-sync-logs__block-6 {
  text-align: center;
}
.rabta-sync-logs__text {
  font-family: var(--font-mono);
}
.rabta-sync-logs__block-4 {
  font-family: var(--font-mono);
}
.rabta-sync-logs__block-6 {
  font-family: var(--font-mono);
}
.rabta-sync-logs__heading-live-worker {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.rabta-sync-logs__text {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-logs__block-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-logs__text-3 {
  font-size: 9px;
}
.rabta-sync-logs__button-clear {
  font-size: 11px;
}
.rabta-sync-logs__block-4 {
  font-size: 11px;
}
.rabta-sync-logs__button-clear {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-sync-logs__heading-live-worker {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-logs__text-3 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-logs__heading-live-worker {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.rabta-sync-logs__text-3 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-sync-logs__text-4 {
  overflow-wrap: break-word;
}
.rabta-sync-logs__warning {
  color: var(--color-amber-400);
}
.rabta-sync-logs__danger {
  color: var(--color-red-400);
}
.rabta-sync-logs__heading-live-worker {
  color: var(--ui-zinc-100);
}
.rabta-sync-logs__block-5 {
  color: var(--ui-zinc-300);
}
.rabta-sync-logs__terminal {
  color: var(--ui-zinc-400);
}
.rabta-sync-logs__button-clear {
  color: var(--ui-zinc-400);
}
.rabta-sync-logs__muted {
  color: var(--ui-zinc-400);
}
.rabta-sync-logs__text {
  color: var(--ui-zinc-500);
}
.rabta-sync-logs__block-6 {
  color: var(--ui-zinc-500);
}
.rabta-sync-logs__text-2 {
  color: var(--ui-zinc-600);
}
.rabta-sync-logs__text-3 {
  text-transform: uppercase;
}
.rabta-sync-logs__text {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-sync-logs__text-2 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-sync-logs__button-clear {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-logs__button-clear:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
[data-theme="light"] .rabta-sync-logs__warning {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-sync-logs__danger {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-sync-logs__block-5 {
  color: var(--app-text-soft);
}
[data-theme="light"] .rabta-sync-logs__terminal {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-logs__button-clear {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-logs__muted {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-logs__text {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-logs__block-6 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-logs__text-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .rabta-sync-logs__button-clear:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-logs__warning {
  border-color: color-mix(in oklab,var(--color-amber-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-logs__danger {
  border-color: color-mix(in oklab,var(--color-red-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-logs__muted {
  border-color: color-mix(in oklab,var(--ui-zinc-700) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-logs__block-6 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-logs__block {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-logs__block {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-logs__button-clear {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-logs__block-5 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}
}
</style>
