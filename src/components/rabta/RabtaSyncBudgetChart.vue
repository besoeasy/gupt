<script setup>
import { ref, computed, watch } from "vue";
import { ChartColumn, Zap, Activity, Clock, Layers, ShieldCheck } from "@/icons";

const props = defineProps({
  history: {
    type: Array,
    default: () => [],
  },
  currentBudgetUsed: {
    type: Number,
    default: 0,
  },
  maxBudget: {
    type: Number,
    default: 50,
  },
});

const MAX_SLOTS = 15;
const selectedIndex = ref(null);

// Always auto-select the latest round unless the user has explicitly tapped a specific round
watch(
  () => props.history.length,
  (newLen) => {
    if (newLen > 0) {
      selectedIndex.value = newLen - 1;
    }
  },
  { immediate: true },
);

const displaySlots = computed(() => {
  const items = props.history.slice(-MAX_SLOTS);
  const slots = [];
  const emptyCount = Math.max(0, MAX_SLOTS - items.length);

  // Fill leading empty ghost slots so the chart layout remains stable
  for (let i = 0; i < emptyCount; i++) {
    slots.push({ isPlaceholder: true, index: i });
  }

  items.forEach((item, i) => {
    const rawBudget = item.budgetUsed || 0;
    const max = item.maxBudget || props.maxBudget || 50;
    const pct = Math.min(100, Math.round((rawBudget / max) * 100));
    // Baseline height is 10% so 0-budget rounds remain selectable/visible
    const heightPct = rawBudget > 0 ? Math.max(16, pct) : 8;

    slots.push({
      isPlaceholder: false,
      historyIndex: items.length - 1 - (items.length - 1 - i), // actual index in items
      round: item.round,
      budgetUsed: rawBudget,
      maxBudget: max,
      budgetPct: pct,
      heightPct,
      eventsSynced: item.eventsSynced || 0,
      blobsSynced: item.blobsSynced || 0,
      durationMs: item.durationMs || 0,
      timestamp: item.timestamp || Date.now(),
    });
  });

  return slots;
});

const activeRound = computed(() => {
  if (!props.history.length) return null;
  const idx = selectedIndex.value != null ? selectedIndex.value : props.history.length - 1;
  const safeIdx = Math.max(0, Math.min(props.history.length - 1, idx));
  const item = props.history[safeIdx];
  if (!item) return null;

  const rawBudget = item.budgetUsed || 0;
  const max = item.maxBudget || props.maxBudget || 50;
  const pct = Math.min(100, Math.round((rawBudget / max) * 100));

  return {
    ...item,
    budgetUsed: rawBudget,
    maxBudget: max,
    budgetPct: pct,
  };
});

function selectSlot(slot) {
  if (slot.isPlaceholder) return;
  const items = props.history.slice(-MAX_SLOTS);
  const actualIdx = props.history.length - items.length + slot.historyIndex;
  selectedIndex.value = actualIdx;
}

function formatAgo(ts) {
  if (!ts) return "just now";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
</script>

<template>
  <section class="budget-chart">
    <header class="budget-chart__head">
      <div class="budget-chart__title">
        <ChartColumn class="budget-chart__icon" :stroke-width="1.8" aria-hidden="true" />
        <div>
          <div class="budget-chart__titleline">
            <h3 class="budget-chart__heading">Sync Budget Utilization</h3>
            <span v-if="history.length" class="budget-chart__rounds">
              {{ history.length }} {{ history.length === 1 ? "round" : "rounds" }}
            </span>
          </div>
          <p class="budget-chart__caption">50 units cap/run · text = 1 · blob = 10</p>
        </div>
      </div>

      <div
        class="budget-chart__pill"
        :class="{
          'budget-chart__pill--full': currentBudgetUsed >= maxBudget,
          'budget-chart__pill--live': currentBudgetUsed > 0 && currentBudgetUsed < maxBudget,
        }"
        :title="`Current sync round budget used: ${currentBudgetUsed} / ${maxBudget} units`"
      >
        <span class="budget-chart__pill-dot" aria-hidden="true" />
        <span class="budget-chart__pill-label">Budget</span>
        <span class="budget-chart__pill-value">{{ currentBudgetUsed }}/{{ maxBudget }}</span>
      </div>
    </header>

    <div v-if="history.length" class="budget-chart__body">
      <div class="budget-chart__strip">
        <div class="budget-chart__bars">
          <button
            v-for="(slot, i) in displaySlots"
            :key="i"
            type="button"
            :disabled="slot.isPlaceholder"
            class="budget-chart__bar-slot"
            :class="{ 'is-active': activeRound?.round === slot.round }"
            :title="
              slot.isPlaceholder
                ? 'Awaiting round'
                : `Round #${slot.round}: ${slot.budgetUsed}/${slot.maxBudget} budget (${slot.eventsSynced} events)`
            "
            @click="selectSlot(slot)"
          >
            <span class="budget-chart__track">
              <span
                v-if="!slot.isPlaceholder"
                class="budget-chart__bar"
                :class="{
                  'budget-chart__bar--full': slot.budgetUsed >= slot.maxBudget,
                  'budget-chart__bar--live': slot.budgetUsed > 0 && slot.budgetUsed < slot.maxBudget,
                  'budget-chart__bar--empty': slot.budgetUsed === 0,
                }"
                :style="{ height: `${slot.heightPct}%` }"
              />
              <span v-else class="budget-chart__bar budget-chart__bar--ghost" />
            </span>
            <span v-if="!slot.isPlaceholder" class="budget-chart__bar-label">{{ slot.round }}</span>
            <span v-else class="budget-chart__bar-label budget-chart__bar-label--ghost">·</span>
          </button>
        </div>
      </div>

      <div v-if="activeRound" class="budget-chart__inspect">
        <div class="budget-chart__inspect-head">
          <span class="budget-chart__inspect-round">Round #{{ activeRound.round }}</span>
          <span
            class="budget-chart__inspect-pct"
            :class="{
              'budget-chart__inspect-pct--full': activeRound.budgetUsed >= activeRound.maxBudget,
            }"
          >
            {{ activeRound.budgetPct }}% budget used
          </span>
        </div>

        <div class="budget-chart__meter">
          <div class="budget-chart__meter-head">
            <span class="budget-chart__meter-label">Sync budget</span>
            <span
              class="budget-chart__meter-value"
              :class="{
                'budget-chart__meter-value--full': activeRound.budgetUsed >= activeRound.maxBudget,
              }"
            >
              {{ activeRound.budgetUsed }} / {{ activeRound.maxBudget }} units
            </span>
          </div>
          <div class="budget-chart__meter-track">
            <div
              class="budget-chart__meter-fill"
              :class="{
                'budget-chart__meter-fill--full': activeRound.budgetUsed >= activeRound.maxBudget,
              }"
              :style="{ width: `${activeRound.budgetPct}%` }"
            />
          </div>
        </div>

        <div class="budget-chart__facts">
          <div class="budget-chart__fact">
            <span class="budget-chart__fact-label">Events</span>
            <span class="budget-chart__fact-value">+{{ activeRound.eventsSynced }} synced</span>
          </div>
          <div class="budget-chart__fact">
            <span class="budget-chart__fact-label">Blobs</span>
            <span class="budget-chart__fact-value">+{{ activeRound.blobsSynced }} blobs</span>
          </div>
          <div class="budget-chart__fact">
            <span class="budget-chart__fact-label">Status</span>
            <span
              class="budget-chart__fact-value"
              :class="{
                'budget-chart__fact-value--full': activeRound.budgetUsed >= activeRound.maxBudget,
              }"
            >
              {{
                activeRound.budgetUsed >= activeRound.maxBudget
                  ? "Cap reached (50)"
                  : activeRound.eventsSynced > 0
                    ? "Reconciled"
                    : "Zero diff"
              }}
            </span>
          </div>
          <div class="budget-chart__fact">
            <span class="budget-chart__fact-label">When</span>
            <span class="budget-chart__fact-value">
              <template v-if="activeRound.durationMs">{{ activeRound.durationMs }}ms · </template>
              {{ formatAgo(activeRound.timestamp) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="budget-chart__empty">
      <Activity class="budget-chart__empty-icon" :stroke-width="1.6" aria-hidden="true" />
      <p class="budget-chart__empty-title">Waiting for sync round telemetry…</p>
      <p class="budget-chart__empty-body">
        Budget utilization and event replication will graph here automatically as background sync
        cycles run.
      </p>
    </div>
  </section>
</template>

<style scoped>
/* Ledger pass: a measured chart on ruled paper. */

.budget-chart {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-rise 480ms var(--app-ease-emphasized) 90ms both;
}

.budget-chart__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-border);
}

.budget-chart__title {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-width: 0;
}

.budget-chart__icon {
  width: 14px;
  height: 14px;
  margin-top: 1px;
  color: var(--app-muted-2);
}

.budget-chart__titleline {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}

.budget-chart__heading {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-text);
}

.budget-chart__rounds {
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.budget-chart__caption {
  margin: 3px 0 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.budget-chart__pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.budget-chart__pill-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-border-strong);
}

.budget-chart__pill-label {
  color: var(--app-muted-2);
}

.budget-chart__pill-value {
  color: var(--app-muted);
  font-variant-numeric: tabular-nums;
}

.budget-chart__pill--live {
  border-color: color-mix(in oklab, var(--app-success) 30%, var(--app-border));
}

.budget-chart__pill--live .budget-chart__pill-dot {
  background: var(--app-success);
}

.budget-chart__pill--live .budget-chart__pill-value {
  color: var(--app-success);
}

.budget-chart__pill--full {
  border-color: color-mix(in oklab, var(--app-warning) 34%, var(--app-border));
  background: var(--app-warning-soft);
}

.budget-chart__pill--full .budget-chart__pill-dot {
  background: var(--app-warning);
  animation: ledger-dot-pulse 1.4s var(--app-ease-standard) infinite;
}

.budget-chart__pill--full .budget-chart__pill-value {
  color: var(--app-warning);
}

.budget-chart__strip {
  padding: 14px 10px 8px;
}

.budget-chart__bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  min-height: 96px;
}

.budget-chart__bar-slot {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 14px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.budget-chart__bar-slot:disabled {
  cursor: default;
}

.budget-chart__track {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 76px;
  border-bottom: 1px solid var(--app-border);
}

.budget-chart__bar {
  width: 100%;
  max-width: 16px;
  min-height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--app-muted-2);
  transform-origin: bottom;
  animation: budget-grow 480ms var(--app-ease-emphasized) both;
}

.budget-chart__bar--live {
  background: color-mix(in oklab, var(--app-success) 62%, var(--app-surface));
}

.budget-chart__bar--full {
  background: var(--app-warning);
}

.budget-chart__bar--empty {
  background: var(--app-border-strong);
}

.budget-chart__bar--ghost {
  background: var(--app-border);
}

.budget-chart__bar-slot.is-active .budget-chart__bar {
  background: var(--app-text);
}

.budget-chart__bar-slot.is-active .budget-chart__track {
  border-bottom-color: var(--app-text);
}

.budget-chart__bar-label {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.budget-chart__bar-label--ghost {
  color: var(--app-border-strong);
}

.budget-chart__bar-slot.is-active .budget-chart__bar-label {
  color: var(--app-text);
}

.budget-chart__inspect {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding: 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface-soft);
}

.budget-chart__inspect-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-2);
}

.budget-chart__inspect-round {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--app-text);
}

.budget-chart__inspect-pct {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-success);
}

.budget-chart__inspect-pct--full {
  color: var(--app-warning);
}

.budget-chart__meter {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.budget-chart__meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-2);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
}

.budget-chart__meter-label {
  color: var(--app-muted-2);
  text-transform: uppercase;
}

.budget-chart__meter-value {
  color: var(--app-success);
  font-variant-numeric: tabular-nums;
}

.budget-chart__meter-value--full {
  color: var(--app-warning);
}

.budget-chart__meter-track {
  height: 4px;
  border-radius: 2px;
  background: var(--app-surface-inset-strong);
  overflow: hidden;
}

.budget-chart__meter-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--app-success);
  transition: width var(--app-dur-slow) var(--app-ease-emphasized);
}

.budget-chart__meter-fill--full {
  background: var(--app-warning);
}

.budget-chart__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: var(--app-border);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  overflow: hidden;
}

.budget-chart__fact {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  background: var(--app-surface);
}

.budget-chart__fact-label {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.budget-chart__fact-value {
  font-size: 10.5px;
  color: var(--app-text-soft);
  font-variant-numeric: tabular-nums;
}

.budget-chart__fact-value--full {
  color: var(--app-warning);
}

.budget-chart__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-6) var(--app-space-5);
  text-align: center;
}

.budget-chart__empty-icon {
  width: 16px;
  height: 16px;
  color: var(--app-muted-2);
}

.budget-chart__empty-title {
  margin: 0;
  font-size: var(--app-text-meta);
  font-weight: 500;
  color: var(--app-text);
}

.budget-chart__empty-body {
  max-width: 42ch;
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--app-muted-2);
}

@keyframes budget-grow {
  from {
    transform: scaleY(0);
    opacity: 0.4;
  }
  to {
    transform: scaleY(1);
    opacity: 1;
  }
}

@media (min-width: 40rem) {
  .budget-chart__facts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .budget-chart__strip {
    padding-inline: 16px;
  }
}

@media (max-width: 30rem) {
  .budget-chart__bars {
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .budget-chart__bars::-webkit-scrollbar {
    display: none;
  }

  .budget-chart__bar-slot {
    flex: 0 0 16px;
  }
}

@media (hover: hover) {
  .budget-chart__bar-slot:not(:disabled):hover .budget-chart__bar {
    background: var(--app-text-soft);
  }

  .budget-chart__bar-slot:not(:disabled):hover .budget-chart__bar-label {
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .budget-chart__bar-slot {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .budget-chart,
  .budget-chart__bar,
  .budget-chart__pill--full .budget-chart__pill-dot {
    animation: none;
  }

  .budget-chart__meter-fill {
    transition: none;
  }
}
</style>
