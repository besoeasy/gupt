<script setup>
import { computed } from "vue";
import { Terminal, Trash2 } from "@/icons";

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
  if (level === "error") return "mesh-logs__level--error";
  if (level === "warn") return "mesh-logs__level--warning";
  return "mesh-logs__level--info";
}
</script>

<template>
  <section class="mesh-logs">
    <header class="mesh-logs__head">
      <div class="mesh-logs__title">
        <Terminal class="mesh-logs__icon" :stroke-width="1.8" aria-hidden="true" />
        <h3 class="mesh-logs__heading">Live worker sync audit</h3>
        <span class="mesh-logs__count">{{ logs.length }}</span>
      </div>

      <button v-if="logs.length" type="button" class="mesh-logs__clear" @click="emit('clear')">
        <Trash2 class="mesh-logs__clear-icon" :stroke-width="1.9" aria-hidden="true" />
        Clear
      </button>
    </header>

    <div v-if="logs.length" class="mesh-logs__list">
      <div v-for="log in logs" :key="log.id" class="mesh-logs__row">
        <span class="mesh-logs__time">{{ formatTime(log.timestamp) }}</span>
        <span class="mesh-logs__level" :class="levelClass(log.level)">{{ log.level }}</span>
        <span class="mesh-logs__message">{{ log.message }}</span>
      </div>
    </div>

    <p v-else class="mesh-logs__empty">
      Worker idle. Logs from cross-server sync operations will appear here in real time.
    </p>
  </section>
</template>

<style scoped>
/* Ledger pass: the worker audit is a monospace ledger sheet. */

.mesh-logs {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}

.mesh-logs__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
}

.mesh-logs__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.mesh-logs__icon {
  width: 13px;
  height: 13px;
  color: var(--app-muted-2);
}

.mesh-logs__heading {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-text);
}

.mesh-logs__count {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.mesh-logs__clear {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.mesh-logs__clear-icon {
  width: 11px;
  height: 11px;
}

.mesh-logs__list {
  max-height: 260px;
  overflow-y: auto;
}

.mesh-logs__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 14px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  line-height: 1.6;
  color: var(--app-muted);
}

.mesh-logs__row + .mesh-logs__row {
  border-top: 1px solid color-mix(in oklab, var(--app-border) 60%, transparent);
}

.mesh-logs__time {
  flex-shrink: 0;
  font-size: 9px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.mesh-logs__level {
  flex-shrink: 0;
  width: 38px;
  font-size: 8px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.mesh-logs__level--info {
  color: var(--app-muted-2);
}

.mesh-logs__level--warning {
  color: var(--app-warning);
}

.mesh-logs__level--error {
  color: var(--app-danger);
}

.mesh-logs__message {
  min-width: 0;
  color: var(--app-text-soft);
  overflow-wrap: anywhere;
}

.mesh-logs__empty {
  margin: 0;
  padding: 24px 14px;
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
  color: var(--app-muted-2);
}

@media (hover: hover) {
  .mesh-logs__clear:hover {
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .mesh-logs__clear {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mesh-logs__clear {
    transition: none;
  }
}
</style>
