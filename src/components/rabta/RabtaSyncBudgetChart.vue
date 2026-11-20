<script setup>
import { ref, computed, watch } from "vue";
import { ChartColumn, Zap, Activity, Clock, Layers, ShieldCheck } from "@lucide/vue";

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
  <section
    class="rabta-sync-budget-chart__section"
  >
    <!-- Header -->
    <div class="rabta-sync-budget-chart__block">
      <div class="rabta-sync-budget-chart__block-2">
        <div
          class="rabta-sync-budget-chart__block-3"
        >
          <ChartColumn class="rabta-sync-budget-chart__chart-column" :stroke-width="2" />
        </div>
        <div class="rabta-sync-budget-chart__block-4">
          <div class="rabta-sync-budget-chart__block-5">
            <h3 class="rabta-sync-budget-chart__heading-sync-budget">
              Sync Budget Utilization
            </h3>
            <span
              v-if="history.length"
              class="rabta-sync-budget-chart__text"
            >
              {{ history.length }} {{ history.length === 1 ? "round" : "rounds" }}
            </span>
          </div>
          <p class="rabta-sync-budget-chart__text-2">
            50 units cap/run · text = 1 · blob = 10
          </p>
        </div>
      </div>

      <!-- Current budget indicator pill -->
      <div
        class="rabta-sync-budget-chart__block-6"
        :title="`Current sync round budget used: ${currentBudgetUsed} / ${maxBudget} units`"
      >
        <span
          class="rabta-sync-budget-chart__text-3"
          :class="
            currentBudgetUsed >= maxBudget
              ? 'rabta-sync-budget-chart__text--pulse'
              : currentBudgetUsed > 0
                ? 'rabta-sync-budget-chart__text--success'
                : 'rabta-sync-budget-chart__text--muted'
          "
        />
        <span class="rabta-sync-budget-chart__text-budget">Budget</span>
        <span
          class="rabta-sync-budget-chart__text-4"
          :class="
            currentBudgetUsed >= maxBudget
              ? 'rabta-sync-budget-chart__text--warning'
              : currentBudgetUsed > 0
                ? 'rabta-sync-budget-chart__text--success-2'
                : 'rabta-sync-budget-chart__text--muted-2'
          "
        >
          {{ currentBudgetUsed }}/{{ maxBudget }}
        </span>
      </div>
    </div>

    <!-- Active Chart Area -->
    <div v-if="history.length" class="rabta-sync-budget-chart__block-7">
      <!-- Interactive Bar Chart Strip -->
      <div class="rabta-sync-budget-chart__block-8">
        <div class="rabta-sync-budget-chart__block-9">
          <button
            v-for="(slot, i) in displaySlots"
            :key="i"
            type="button"
            :disabled="slot.isPlaceholder"
            class="rabta-sync-budget-chart__button"
            @click="selectSlot(slot)"
            :title="
              slot.isPlaceholder
                ? 'Awaiting round'
                : `Round #${slot.round}: ${slot.budgetUsed}/${slot.maxBudget} budget (${slot.eventsSynced} events)`
            "
          >
            <!-- Bar Element -->
            <div
              v-if="!slot.isPlaceholder"
              class="rabta-sync-budget-chart__block-10"
              :style="{ height: `${slot.heightPct}%` }"
              :class="[
                slot.budgetUsed >= slot.maxBudget
                  ? 'rabta-sync-budget-chart__block--warning'
                  : slot.budgetUsed > 0
                    ? 'rabta-sync-budget-chart__block--success'
                    : 'rabta-sync-budget-chart__block--variant-3',
                activeRound?.round === slot.round
                  ? 'rabta-sync-budget-chart__block--variant-4'
                  : '',
              ]"
            />
            <!-- Placeholder Bar -->
            <div
              v-else
              class="rabta-sync-budget-chart__block-11"
            />

            <!-- Bottom Sub-label -->
            <span
              v-if="!slot.isPlaceholder"
              class="rabta-sync-budget-chart__text-5"
              :class="
                activeRound?.round === slot.round
                  ? 'rabta-sync-budget-chart__text--variant-1'
                  : 'rabta-sync-budget-chart__text--muted-3'
              "
            >
              {{ slot.round }}
            </span>
            <span v-else class="rabta-sync-budget-chart__text-6">·</span>
          </button>
        </div>
      </div>

      <!-- Inspector Detail Strip (Mobile-first, touch-friendly) -->
      <div
        v-if="activeRound"
        class="rabta-sync-budget-chart__block-12"
      >
        <div class="rabta-sync-budget-chart__block-13">
          <div class="rabta-sync-budget-chart__block-14">
            <span class="rabta-sync-budget-chart__text-7">Round #{{ activeRound.round }}</span>
            <span
              class="rabta-sync-budget-chart__text-8"
              :class="
                activeRound.budgetUsed >= activeRound.maxBudget
                  ? 'rabta-sync-budget-chart__text--warning-2'
                  : 'rabta-sync-budget-chart__text--success-3'
              "
            >
              {{ activeRound.budgetPct }}% Budget Used
            </span>
          </div>

          <div class="rabta-sync-budget-chart__block-15">
            <span v-if="activeRound.durationMs">{{ activeRound.durationMs }}ms</span>
            <span>·</span>
            <span>{{ formatAgo(activeRound.timestamp) }}</span>
          </div>
        </div>

        <!-- Budget Utilization Progress Bar -->
        <div class="rabta-sync-budget-chart__block-16">
          <div class="rabta-sync-budget-chart__block-17">
            <span class="rabta-sync-budget-chart__text-sync-budget">Sync Budget:</span>
            <span
              class="rabta-sync-budget-chart__text-9"
              :class="
                activeRound.budgetUsed >= activeRound.maxBudget
                  ? 'rabta-sync-budget-chart__text--warning-3'
                  : 'rabta-sync-budget-chart__text--success-4'
              "
            >
              {{ activeRound.budgetUsed }} / {{ activeRound.maxBudget }} units
            </span>
          </div>
          <div class="rabta-sync-budget-chart__block-18">
            <div
              class="rabta-sync-budget-chart__block-19"
              :style="{ width: `${activeRound.budgetPct}%` }"
              :class="
                activeRound.budgetUsed >= activeRound.maxBudget
                  ? 'rabta-sync-budget-chart__block--warning-2'
                  : 'rabta-sync-budget-chart__block--success-2'
              "
            />
          </div>
        </div>

        <!-- Secondary telemetry row -->
        <div class="rabta-sync-budget-chart__block-20">
          <div class="rabta-sync-budget-chart__block-21">
            <span class="rabta-sync-budget-chart__text-events">Events:</span>
            <span class="rabta-sync-budget-chart__text-10">+{{ activeRound.eventsSynced }} synced</span>
          </div>
          <div class="rabta-sync-budget-chart__block-22">
            <span class="rabta-sync-budget-chart__text-blobs">Blobs:</span>
            <span class="rabta-sync-budget-chart__text-11">+{{ activeRound.blobsSynced }} blobs</span>
          </div>
          <div class="rabta-sync-budget-chart__block-23">
            <span class="rabta-sync-budget-chart__text-status">Status:</span>
            <span
              class="rabta-sync-budget-chart__text-12"
              :class="
                activeRound.budgetUsed >= activeRound.maxBudget
                  ? 'rabta-sync-budget-chart__text--warning-4'
                  : 'rabta-sync-budget-chart__text--success-5'
              "
            >
              {{
                activeRound.budgetUsed >= activeRound.maxBudget
                  ? "Cap Reached (50)"
                  : activeRound.eventsSynced > 0
                    ? "Reconciled"
                    : "Zero Diff"
              }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="rabta-sync-budget-chart__block-24"
    >
      <div
        class="rabta-sync-budget-chart__block-25"
      >
        <Activity class="rabta-sync-budget-chart__activity" :stroke-width="1.8" />
      </div>
      <p class="rabta-sync-budget-chart__text-13">
        Waiting for sync round telemetry…
      </p>
      <p class="rabta-sync-budget-chart__text-14">
        Budget utilization and event replication will graph here automatically as background sync cycles run.
      </p>
    </div>
  </section>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {






































@media (hover:hover) {
.rabta-sync-budget-chart__block--warning:is(:where(.rabta-sync-budget-chart__button):hover *) {
  background-color: var(--color-amber-300);
}
}

@media (hover:hover) {
.rabta-sync-budget-chart__block--success:is(:where(.rabta-sync-budget-chart__button):hover *) {
  background-color: var(--color-emerald-300);
}
}

@media (hover:hover) {
.rabta-sync-budget-chart__block--variant-3:is(:where(.rabta-sync-budget-chart__button):hover *) {
  background-color: var(--ui-zinc-600);
}
}

@media (hover:hover) {
.rabta-sync-budget-chart__text--muted-3:is(:where(.rabta-sync-budget-chart__button):hover *) {
  color: var(--ui-zinc-400);
}
}

@media (min-width:40rem) {
.rabta-sync-budget-chart__block-23 {
  grid-column: span 1/span 1;
}
}

@media (min-width:40rem) {
.rabta-sync-budget-chart__block-20 {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.rabta-sync-budget-chart__block-9 {
  gap: calc(var(--spacing) * 1.5);
}
}

@media (min-width:40rem) {
.rabta-sync-budget-chart__block-8 {
  padding: calc(var(--spacing) * 2.5);
}
}

@media (min-width:40rem) {
.rabta-sync-budget-chart__heading-sync-budget {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
}

@media (min-width:40rem) {
.rabta-sync-budget-chart__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
}

@layer gupt-components {
.rabta-sync-budget-chart__button {
  position: relative;
}
.rabta-sync-budget-chart__block-23 {
  grid-column: span 2/span 2;
}
.rabta-sync-budget-chart__text-5 {
  margin-top: var(--spacing);
}
.rabta-sync-budget-chart__text-6 {
  margin-top: var(--spacing);
}
.rabta-sync-budget-chart__block {
  display: flex;
}
.rabta-sync-budget-chart__block-2 {
  display: flex;
}
.rabta-sync-budget-chart__block-3 {
  display: flex;
}
.rabta-sync-budget-chart__block-5 {
  display: flex;
}
.rabta-sync-budget-chart__block-6 {
  display: flex;
}
.rabta-sync-budget-chart__block-9 {
  display: flex;
}
.rabta-sync-budget-chart__button {
  display: flex;
}
.rabta-sync-budget-chart__block-13 {
  display: flex;
}
.rabta-sync-budget-chart__block-14 {
  display: flex;
}
.rabta-sync-budget-chart__block-15 {
  display: flex;
}
.rabta-sync-budget-chart__block-17 {
  display: flex;
}
.rabta-sync-budget-chart__block-21 {
  display: flex;
}
.rabta-sync-budget-chart__block-22 {
  display: flex;
}
.rabta-sync-budget-chart__block-23 {
  display: flex;
}
.rabta-sync-budget-chart__block-24 {
  display: flex;
}
.rabta-sync-budget-chart__block-25 {
  display: flex;
}
.rabta-sync-budget-chart__block-20 {
  display: grid;
}
.rabta-sync-budget-chart__text-3 {
  height: calc(var(--spacing) * 1.5);
}
.rabta-sync-budget-chart__block-18 {
  height: calc(var(--spacing) * 1.5);
}
.rabta-sync-budget-chart__block-11 {
  height: calc(var(--spacing) * 2);
}
.rabta-sync-budget-chart__chart-column {
  height: calc(var(--spacing) * 4);
}
.rabta-sync-budget-chart__activity {
  height: calc(var(--spacing) * 4);
}
.rabta-sync-budget-chart__block-3 {
  height: calc(var(--spacing) * 7);
}
.rabta-sync-budget-chart__block-25 {
  height: calc(var(--spacing) * 9);
}
.rabta-sync-budget-chart__block-9 {
  height: calc(var(--spacing) * 20);
}
.rabta-sync-budget-chart__button {
  height: 100%;
}
.rabta-sync-budget-chart__block-19 {
  height: 100%;
}
.rabta-sync-budget-chart__button {
  /* 44px minimum touch target (formerly min-h-[44px]) */
  min-height: 44px;
}
.rabta-sync-budget-chart__text-3 {
  width: calc(var(--spacing) * 1.5);
}
.rabta-sync-budget-chart__chart-column {
  width: calc(var(--spacing) * 4);
}
.rabta-sync-budget-chart__activity {
  width: calc(var(--spacing) * 4);
}
.rabta-sync-budget-chart__block-3 {
  width: calc(var(--spacing) * 7);
}
.rabta-sync-budget-chart__block-25 {
  width: calc(var(--spacing) * 9);
}
.rabta-sync-budget-chart__block-9 {
  width: 100%;
}
.rabta-sync-budget-chart__block-10 {
  width: 100%;
}
.rabta-sync-budget-chart__block-11 {
  width: 100%;
}
.rabta-sync-budget-chart__block-18 {
  width: 100%;
}
.rabta-sync-budget-chart__block-10 {
  max-width: 20px;
}
.rabta-sync-budget-chart__block-11 {
  max-width: 20px;
}
.rabta-sync-budget-chart__text-14 {
  max-width: var(--container-sm);
}
.rabta-sync-budget-chart__block-2 {
  min-width: 0;
}
.rabta-sync-budget-chart__block-4 {
  min-width: 0;
}
.rabta-sync-budget-chart__button {
  flex: 1;
}
.rabta-sync-budget-chart__block-3 {
  flex-shrink: 0;
}
.rabta-sync-budget-chart__text--pulse {
  animation: var(--animate-pulse);
}
.rabta-sync-budget-chart__button {
  cursor: pointer;
}
.rabta-sync-budget-chart__block-20 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
.rabta-sync-budget-chart__button {
  flex-direction: column;
}
.rabta-sync-budget-chart__block-24 {
  flex-direction: column;
}
.rabta-sync-budget-chart__block-13 {
  flex-wrap: wrap;
}
.rabta-sync-budget-chart__block {
  align-items: center;
}
.rabta-sync-budget-chart__block-2 {
  align-items: center;
}
.rabta-sync-budget-chart__block-3 {
  align-items: center;
}
.rabta-sync-budget-chart__block-5 {
  align-items: center;
}
.rabta-sync-budget-chart__block-6 {
  align-items: center;
}
.rabta-sync-budget-chart__button {
  align-items: center;
}
.rabta-sync-budget-chart__block-13 {
  align-items: center;
}
.rabta-sync-budget-chart__block-14 {
  align-items: center;
}
.rabta-sync-budget-chart__block-15 {
  align-items: center;
}
.rabta-sync-budget-chart__block-17 {
  align-items: center;
}
.rabta-sync-budget-chart__block-21 {
  align-items: center;
}
.rabta-sync-budget-chart__block-22 {
  align-items: center;
}
.rabta-sync-budget-chart__block-23 {
  align-items: center;
}
.rabta-sync-budget-chart__block-24 {
  align-items: center;
}
.rabta-sync-budget-chart__block-25 {
  align-items: center;
}
.rabta-sync-budget-chart__block-9 {
  align-items: flex-end;
}
.rabta-sync-budget-chart__block {
  justify-content: space-between;
}
.rabta-sync-budget-chart__block-9 {
  justify-content: space-between;
}
.rabta-sync-budget-chart__block-13 {
  justify-content: space-between;
}
.rabta-sync-budget-chart__block-17 {
  justify-content: space-between;
}
.rabta-sync-budget-chart__block-3 {
  justify-content: center;
}
.rabta-sync-budget-chart__block-24 {
  justify-content: center;
}
.rabta-sync-budget-chart__block-25 {
  justify-content: center;
}
.rabta-sync-budget-chart__button {
  justify-content: flex-end;
}
.rabta-sync-budget-chart__block-9 {
  gap: calc(var(--spacing) * .5);
}
.rabta-sync-budget-chart__block-13 {
  gap: var(--spacing);
}
.rabta-sync-budget-chart__block-6 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-budget-chart__block-21 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-budget-chart__block-22 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-budget-chart__block-23 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-sync-budget-chart__block {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-budget-chart__block-5 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-budget-chart__block-14 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-budget-chart__block-15 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-budget-chart__block-20 {
  gap: calc(var(--spacing) * 2);
}
.rabta-sync-budget-chart__block-2 {
  gap: calc(var(--spacing) * 2.5);
}
:where(.rabta-sync-budget-chart__block-16>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.rabta-sync-budget-chart__block-12>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.rabta-sync-budget-chart__block-24>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.rabta-sync-budget-chart__block-7>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.rabta-sync-budget-chart__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3.5) * calc(1 - 0));
}
.rabta-sync-budget-chart__heading-sync-budget {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-budget-chart__text-2 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-budget-chart__text-12 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-sync-budget-chart__block-8 {
  overflow: hidden;
}
.rabta-sync-budget-chart__block-18 {
  overflow: hidden;
}
.rabta-sync-budget-chart__text {
  border-radius: .25rem;
}
.rabta-sync-budget-chart__button {
  border-radius: .25rem;
}
.rabta-sync-budget-chart__text-8 {
  border-radius: .25rem;
}
.rabta-sync-budget-chart__text-3 {
  border-radius: 3.40282e38px;
}
.rabta-sync-budget-chart__block-18 {
  border-radius: 3.40282e38px;
}
.rabta-sync-budget-chart__block-19 {
  border-radius: 3.40282e38px;
}
.rabta-sync-budget-chart__block-3 {
  border-radius: var(--radius-lg);
}
.rabta-sync-budget-chart__block-6 {
  border-radius: var(--radius-lg);
}
.rabta-sync-budget-chart__block-8 {
  border-radius: var(--radius-lg);
}
.rabta-sync-budget-chart__block-12 {
  border-radius: var(--radius-lg);
}
.rabta-sync-budget-chart__block-24 {
  border-radius: var(--radius-lg);
}
.rabta-sync-budget-chart__block-25 {
  border-radius: var(--radius-lg);
}
.rabta-sync-budget-chart__section {
  border-radius: var(--radius-xl);
}
.rabta-sync-budget-chart__block-10 {
  border-top-left-radius: .25rem;
  border-top-right-radius: .25rem;
}
.rabta-sync-budget-chart__block-11 {
  border-top-left-radius: .25rem;
  border-top-right-radius: .25rem;
}
.rabta-sync-budget-chart__section {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-budget-chart__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-budget-chart__block-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-budget-chart__block-8 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-budget-chart__block-12 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-budget-chart__text-8 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-budget-chart__block-24 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-budget-chart__block-25 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-sync-budget-chart__block-11 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.rabta-sync-budget-chart__block-13 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.rabta-sync-budget-chart__block-11 {
  --border-style: dashed;
  border-style: dashed;
}
.rabta-sync-budget-chart__block-24 {
  --border-style: dashed;
  border-style: dashed;
}
.rabta-sync-budget-chart__text--warning-2 {
  border-color: #f99c004d;
}
.rabta-sync-budget-chart__text--success-3 {
  border-color: #00bb7f4d;
}
.rabta-sync-budget-chart__block-3 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__block-6 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__block-25 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__block-8 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__block-13 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__section {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__block-11 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__block-12 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__block-24 {
  border-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__text--pulse {
  background-color: var(--color-amber-400);
}
.rabta-sync-budget-chart__block--warning {
  background-color: var(--color-amber-400);
}
.rabta-sync-budget-chart__block--warning-2 {
  background-color: var(--color-amber-400);
}
.rabta-sync-budget-chart__text--warning-2 {
  background-color: var(--app-warning-soft);
}
.rabta-sync-budget-chart__text--success {
  background-color: var(--color-emerald-400);
}
.rabta-sync-budget-chart__block--success {
  background-color: var(--color-emerald-400);
}
.rabta-sync-budget-chart__block--success-2 {
  background-color: var(--color-emerald-400);
}
.rabta-sync-budget-chart__text--success-3 {
  background-color: #00bb7f1a;
}
.rabta-sync-budget-chart__text--muted {
  background-color: var(--ui-zinc-600);
}
.rabta-sync-budget-chart__block--variant-3 {
  background-color: var(--ui-zinc-700);
}
.rabta-sync-budget-chart__block-18 {
  background-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__text {
  background-color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__block-11 {
  background-color: var(--ui-zinc-900);
}
.rabta-sync-budget-chart__section {
  background-color: var(--ui-zinc-900);
}
.rabta-sync-budget-chart__block-12 {
  background-color: var(--ui-zinc-900);
}
.rabta-sync-budget-chart__block-25 {
  background-color: var(--ui-zinc-900);
}
.rabta-sync-budget-chart__block-24 {
  background-color: var(--ui-zinc-950);
}
.rabta-sync-budget-chart__block-3 {
  background-color: var(--ui-zinc-950);
}
.rabta-sync-budget-chart__block-6 {
  background-color: var(--ui-zinc-950);
}
.rabta-sync-budget-chart__block-8 {
  background-color: var(--ui-zinc-950);
}
.rabta-sync-budget-chart__block-8 {
  padding: calc(var(--spacing) * 2);
}
.rabta-sync-budget-chart__block-12 {
  padding: calc(var(--spacing) * 3);
}
.rabta-sync-budget-chart__section {
  padding: calc(var(--spacing) * 4);
}
.rabta-sync-budget-chart__text {
  padding-inline: calc(var(--spacing) * 1.5);
}
.rabta-sync-budget-chart__text-8 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.rabta-sync-budget-chart__block-6 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.rabta-sync-budget-chart__block-24 {
  padding-inline: calc(var(--spacing) * 4);
}
.rabta-sync-budget-chart__text {
  padding-block: calc(var(--spacing) * .5);
}
.rabta-sync-budget-chart__block-6 {
  padding-block: var(--spacing);
}
.rabta-sync-budget-chart__block-24 {
  padding-block: calc(var(--spacing) * 6);
}
.rabta-sync-budget-chart__block-20 {
  padding-top: var(--spacing);
}
.rabta-sync-budget-chart__block-13 {
  padding-bottom: calc(var(--spacing) * 2);
}
.rabta-sync-budget-chart__block-24 {
  text-align: center;
}
.rabta-sync-budget-chart__text {
  font-family: var(--font-mono);
}
.rabta-sync-budget-chart__text-2 {
  font-family: var(--font-mono);
}
.rabta-sync-budget-chart__block-6 {
  font-family: var(--font-mono);
}
.rabta-sync-budget-chart__text-5 {
  font-family: var(--font-mono);
}
.rabta-sync-budget-chart__text-6 {
  font-family: var(--font-mono);
}
.rabta-sync-budget-chart__block-12 {
  font-family: var(--font-mono);
}
.rabta-sync-budget-chart__text-13 {
  font-family: var(--font-mono);
}
.rabta-sync-budget-chart__text-14 {
  font-family: var(--font-mono);
}
.rabta-sync-budget-chart__heading-sync-budget {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-budget-chart__block-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-budget-chart__block-12 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-budget-chart__text-13 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-sync-budget-chart__text-5 {
  font-size: 9px;
}
.rabta-sync-budget-chart__text-6 {
  font-size: 9px;
}
.rabta-sync-budget-chart__text {
  font-size: 10px;
}
.rabta-sync-budget-chart__text-2 {
  font-size: 10px;
}
.rabta-sync-budget-chart__text-budget {
  font-size: 10px;
}
.rabta-sync-budget-chart__text-8 {
  font-size: 10px;
}
.rabta-sync-budget-chart__block-15 {
  font-size: 11px;
}
.rabta-sync-budget-chart__block-17 {
  font-size: 11px;
}
.rabta-sync-budget-chart__block-20 {
  font-size: 11px;
}
.rabta-sync-budget-chart__text-14 {
  font-size: 11px;
}
.rabta-sync-budget-chart__heading-sync-budget {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-budget-chart__text-4 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-budget-chart__text--variant-1 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-budget-chart__text-7 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-budget-chart__text-8 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-budget-chart__text-9 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-budget-chart__text-10 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-budget-chart__text-11 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-budget-chart__text-12 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-sync-budget-chart__heading-sync-budget {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.rabta-sync-budget-chart__text--warning {
  color: var(--color-amber-400);
}
.rabta-sync-budget-chart__text--warning-2 {
  color: var(--color-amber-400);
}
.rabta-sync-budget-chart__text--warning-3 {
  color: var(--color-amber-400);
}
.rabta-sync-budget-chart__text--warning-4 {
  color: var(--color-amber-400);
}
.rabta-sync-budget-chart__block-3 {
  color: var(--color-emerald-400);
}
.rabta-sync-budget-chart__text--success-2 {
  color: var(--color-emerald-400);
}
.rabta-sync-budget-chart__text--success-3 {
  color: var(--color-emerald-400);
}
.rabta-sync-budget-chart__text--success-4 {
  color: var(--color-emerald-400);
}
.rabta-sync-budget-chart__text--success-5 {
  color: var(--color-emerald-400);
}
.rabta-sync-budget-chart__heading-sync-budget {
  color: var(--ui-zinc-100);
}
.rabta-sync-budget-chart__text-7 {
  color: var(--ui-zinc-100);
}
.rabta-sync-budget-chart__text--variant-1 {
  color: var(--ui-zinc-200);
}
.rabta-sync-budget-chart__text-10 {
  color: var(--ui-zinc-200);
}
.rabta-sync-budget-chart__text-11 {
  color: var(--ui-zinc-200);
}
.rabta-sync-budget-chart__block-6 {
  color: var(--ui-zinc-300);
}
.rabta-sync-budget-chart__text {
  color: var(--ui-zinc-400);
}
.rabta-sync-budget-chart__text--muted-2 {
  color: var(--ui-zinc-400);
}
.rabta-sync-budget-chart__text-sync-budget {
  color: var(--ui-zinc-400);
}
.rabta-sync-budget-chart__block-20 {
  color: var(--ui-zinc-400);
}
.rabta-sync-budget-chart__text-13 {
  color: var(--ui-zinc-400);
}
.rabta-sync-budget-chart__text-2 {
  color: var(--ui-zinc-500);
}
.rabta-sync-budget-chart__text-budget {
  color: var(--ui-zinc-500);
}
.rabta-sync-budget-chart__block-15 {
  color: var(--ui-zinc-500);
}
.rabta-sync-budget-chart__text-events {
  color: var(--ui-zinc-500);
}
.rabta-sync-budget-chart__text-blobs {
  color: var(--ui-zinc-500);
}
.rabta-sync-budget-chart__text-status {
  color: var(--ui-zinc-500);
}
.rabta-sync-budget-chart__block-25 {
  color: var(--ui-zinc-500);
}
.rabta-sync-budget-chart__text--muted-3 {
  color: var(--ui-zinc-600);
}
.rabta-sync-budget-chart__text-14 {
  color: var(--ui-zinc-600);
}
.rabta-sync-budget-chart__text-6 {
  color: var(--ui-zinc-800);
}
.rabta-sync-budget-chart__text-budget {
  text-transform: uppercase;
}
.rabta-sync-budget-chart__text {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-sync-budget-chart__block-6 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-sync-budget-chart__text-5 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-sync-budget-chart__block-15 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-sync-budget-chart__block-17 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-sync-budget-chart__block-20 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-sync-budget-chart__block--success {
  --shadow: 0 0 6px var(--shadow-color,#34d3994d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 0 6px var(--shadow-color,#34d3994d);
}
.rabta-sync-budget-chart__block--warning {
  --shadow: 0 0 6px var(--shadow-color,#fbbf2459);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 0 6px var(--shadow-color,#fbbf2459);
}
.rabta-sync-budget-chart__block--variant-4 {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.rabta-sync-budget-chart__block--variant-4 {
  --ring-color: var(--color-white);
}
.rabta-sync-budget-chart__block--variant-4 {
  --ring-offset-width: 1px;
  --ring-offset-shadow: var(--ring-inset,) 0 0 0 1px var(--ring-offset-color,#fff);
}
.rabta-sync-budget-chart__block--variant-4 {
  --ring-offset-color: var(--ui-zinc-950);
}
.rabta-sync-budget-chart__section {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-budget-chart__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-budget-chart__block-10 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-budget-chart__block-12 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-budget-chart__block-19 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-budget-chart__text-5 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-sync-budget-chart__button {
  --duration: .15s;
  transition-duration: .15s;
}
.rabta-sync-budget-chart__section {
  --duration: .2s;
  transition-duration: .2s;
}
.rabta-sync-budget-chart__block-10 {
  --duration: .2s;
  transition-duration: .2s;
}
.rabta-sync-budget-chart__block-19 {
  --duration: .3s;
  transition-duration: .3s;
}
.rabta-sync-budget-chart__button:focus {
  --outline-style: none;
  outline-style: none;
}
.rabta-sync-budget-chart__button:disabled {
  cursor: default;
}
[data-theme="light"] .rabta-sync-budget-chart__text--warning {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-sync-budget-chart__text--warning-2 {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-sync-budget-chart__text--warning-3 {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-sync-budget-chart__text--warning-4 {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-sync-budget-chart__block-3 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-budget-chart__text--success-2 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-budget-chart__text--success-3 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-budget-chart__text--success-4 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-budget-chart__text--success-5 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-sync-budget-chart__block-6 {
  color: var(--app-text-soft);
}
[data-theme="light"] .rabta-sync-budget-chart__text {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__text--muted-2 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__text-sync-budget {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__block-20 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__text-13 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__text-budget {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__block-15 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__text-events {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__text-blobs {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__text-status {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__block-25 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-sync-budget-chart__text--muted-3 {
  color: var(--app-text-soft);
}
[data-theme="light"] .rabta-sync-budget-chart__text-14 {
  color: var(--app-text-soft);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__text--warning-2 {
  border-color: color-mix(in oklab,var(--color-amber-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__text--success-3 {
  border-color: color-mix(in oklab,var(--color-emerald-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-8 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-13 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__section {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-11 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-12 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-24 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__text--success-3 {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block--variant-3 {
  background-color: color-mix(in oklab,var(--ui-zinc-700) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__text {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__section {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-12 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-25 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-24 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-3 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-6 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-sync-budget-chart__block-8 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}
}
</style>
