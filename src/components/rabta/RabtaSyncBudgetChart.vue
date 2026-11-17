<script setup>
import { ref, computed, watch } from "vue";
import { BarChart3, Zap, Activity, Clock, Layers, ShieldCheck } from "@lucide/vue";

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
    class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-3.5 transition-all duration-200"
  >
    <!-- Header -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2.5 min-w-0">
        <div
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/60 text-emerald-400"
        >
          <BarChart3 class="h-4 w-4" :stroke-width="2" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="truncate text-xs sm:text-sm font-semibold tracking-tight text-zinc-100">
              Sync Budget Utilization
            </h3>
            <span
              v-if="history.length"
              class="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 tabular-nums"
            >
              {{ history.length }} {{ history.length === 1 ? "round" : "rounds" }}
            </span>
          </div>
          <p class="truncate text-[10px] sm:text-xs text-zinc-500 font-mono">
            50 units cap/run · text = 1 · blob = 10
          </p>
        </div>
      </div>

      <!-- Current budget indicator pill -->
      <div
        class="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1 font-mono text-xs tabular-nums text-zinc-300"
        :title="`Current sync round budget used: ${currentBudgetUsed} / ${maxBudget} units`"
      >
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="
            currentBudgetUsed >= maxBudget
              ? 'bg-amber-400 animate-pulse'
              : currentBudgetUsed > 0
                ? 'bg-emerald-400'
                : 'bg-zinc-600'
          "
        />
        <span class="text-zinc-500 text-[10px] uppercase">Budget</span>
        <span
          class="font-semibold"
          :class="
            currentBudgetUsed >= maxBudget
              ? 'text-amber-400'
              : currentBudgetUsed > 0
                ? 'text-emerald-400'
                : 'text-zinc-400'
          "
        >
          {{ currentBudgetUsed }}/{{ maxBudget }}
        </span>
      </div>
    </div>

    <!-- Active Chart Area -->
    <div v-if="history.length" class="space-y-3">
      <!-- Interactive Bar Chart Strip -->
      <div class="rounded-lg border border-zinc-800/60 bg-zinc-950/60 p-2 sm:p-2.5 overflow-hidden">
        <div class="flex items-end justify-between gap-0.5 sm:gap-1.5 h-20 w-full">
          <button
            v-for="(slot, i) in displaySlots"
            :key="i"
            type="button"
            :disabled="slot.isPlaceholder"
            class="group relative flex min-h-[44px] flex-1 flex-col items-center justify-end h-full cursor-pointer rounded transition-all duration-150 focus:outline-none disabled:cursor-default"
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
              class="w-full max-w-[20px] rounded-t transition-all duration-200"
              :style="{ height: `${slot.heightPct}%` }"
              :class="[
                slot.budgetUsed >= slot.maxBudget
                  ? 'bg-amber-400 group-hover:bg-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.35)]'
                  : slot.budgetUsed > 0
                    ? 'bg-emerald-400 group-hover:bg-emerald-300 shadow-[0_0_6px_rgba(52,211,153,0.3)]'
                    : 'bg-zinc-700/60 group-hover:bg-zinc-600',
                activeRound?.round === slot.round
                  ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-950'
                  : '',
              ]"
            />
            <!-- Placeholder Bar -->
            <div
              v-else
              class="w-full max-w-[20px] h-2 rounded-t bg-zinc-900 border-t border-dashed border-zinc-800/80"
            />

            <!-- Bottom Sub-label -->
            <span
              v-if="!slot.isPlaceholder"
              class="mt-1 font-mono text-[9px] tabular-nums transition-colors"
              :class="
                activeRound?.round === slot.round
                  ? 'text-zinc-200 font-semibold'
                  : 'text-zinc-600 group-hover:text-zinc-400'
              "
            >
              {{ slot.round }}
            </span>
            <span v-else class="mt-1 font-mono text-[9px] text-zinc-800">·</span>
          </button>
        </div>
      </div>

      <!-- Inspector Detail Strip (Mobile-first, touch-friendly) -->
      <div
        v-if="activeRound"
        class="rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-3 space-y-2 font-mono text-xs transition-all"
      >
        <div class="flex flex-wrap items-center justify-between gap-1 border-b border-zinc-800/60 pb-2">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-zinc-100">Round #{{ activeRound.round }}</span>
            <span
              class="rounded px-1.5 py-0.2 text-[10px] font-semibold border"
              :class="
                activeRound.budgetUsed >= activeRound.maxBudget
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
              "
            >
              {{ activeRound.budgetPct }}% Budget Used
            </span>
          </div>

          <div class="flex items-center gap-2 text-[11px] text-zinc-500 tabular-nums">
            <span v-if="activeRound.durationMs">{{ activeRound.durationMs }}ms</span>
            <span>·</span>
            <span>{{ formatAgo(activeRound.timestamp) }}</span>
          </div>
        </div>

        <!-- Budget Utilization Progress Bar -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px] tabular-nums">
            <span class="text-zinc-400">Sync Budget:</span>
            <span
              class="font-semibold"
              :class="
                activeRound.budgetUsed >= activeRound.maxBudget
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              "
            >
              {{ activeRound.budgetUsed }} / {{ activeRound.maxBudget }} units
            </span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              class="h-full rounded-full transition-all duration-300"
              :style="{ width: `${activeRound.budgetPct}%` }"
              :class="
                activeRound.budgetUsed >= activeRound.maxBudget
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              "
            />
          </div>
        </div>

        <!-- Secondary telemetry row -->
        <div class="grid grid-cols-2 gap-2 pt-1 text-[11px] tabular-nums text-zinc-400 sm:grid-cols-3">
          <div class="flex items-center gap-1.5">
            <span class="text-zinc-500">Events:</span>
            <span class="font-semibold text-zinc-200">+{{ activeRound.eventsSynced }} synced</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-zinc-500">Blobs:</span>
            <span class="font-semibold text-zinc-200">+{{ activeRound.blobsSynced }} blobs</span>
          </div>
          <div class="col-span-2 sm:col-span-1 flex items-center gap-1.5">
            <span class="text-zinc-500">Status:</span>
            <span
              class="font-semibold truncate"
              :class="
                activeRound.budgetUsed >= activeRound.maxBudget
                  ? 'text-amber-400'
                  : 'text-emerald-400'
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
      class="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800/80 bg-zinc-950/40 py-6 px-4 text-center space-y-2"
    >
      <div
        class="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-500"
      >
        <Activity class="h-4 w-4" :stroke-width="1.8" />
      </div>
      <p class="font-mono text-xs text-zinc-400">
        Waiting for sync round telemetry…
      </p>
      <p class="font-mono text-[11px] text-zinc-600 max-w-sm">
        Budget utilization and event replication will graph here automatically as background sync cycles run.
      </p>
    </div>
  </section>
</template>
