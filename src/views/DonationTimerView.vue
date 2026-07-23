<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Heart, Zap, ArrowRight, ShieldCheck, Sparkles, TrendingUp } from "@lucide/vue";
import {
  getMonthlyStats,
  getCachedMonthlyStatsSync,
  calculateDynamicWaitSeconds,
  GOAL_SAT,
  MAX_WAIT_SEC,
} from "@/lib/funding";

const route = useRoute();
const router = useRouter();

const receivedSat = ref(0);
const goalSat = ref(GOAL_SAT);
const totalWaitSeconds = ref(20);
const timeLeft = ref(20);
const progressPct = ref(0);
const loadingStats = ref(true);

const targetPath = computed(() => {
  const target = route.query.target;
  if (typeof target === "string" && target.startsWith("/")) {
    return target;
  }
  return "/settings";
});

const targetName = computed(() => {
  if (targetPath.value.startsWith("/me")) return "Profile";
  if (targetPath.value.startsWith("/vault")) return "Vault";
  if (targetPath.value.startsWith("/share")) return "Share Note";
  return "Settings";
});

const fundedPct = computed(() => {
  if (!goalSat.value) return 0;
  return Math.min(100, Math.max(0, (receivedSat.value / goalSat.value) * 100));
});

const secondsSaved = computed(() => {
  return Math.max(0, MAX_WAIT_SEC - totalWaitSeconds.value);
});

let timerId = null;
let startTime = null;

function startCountdown(durationSec) {
  if (durationSec <= 0) {
    proceedToTarget();
    return;
  }

  totalWaitSeconds.value = durationSec;
  timeLeft.value = durationSec;
  startTime = Date.now();

  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    const now = Date.now();
    const elapsedMs = now - startTime;
    const elapsedSec = elapsedMs / 1000;

    const remaining = Math.max(0, durationSec - elapsedSec);
    timeLeft.value = Math.ceil(remaining);
    progressPct.value = Math.min(100, (elapsedMs / (durationSec * 1000)) * 100);

    if (remaining <= 0) {
      proceedToTarget();
    }
  }, 50);
}

function proceedToTarget() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  router.replace({ path: targetPath.value, query: { bypassTimer: "1" } });
}

function goToDonate() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  router.push("/donate");
}

onMounted(async () => {
  // 1. Try sync cached stats first
  const cached = getCachedMonthlyStatsSync();
  if (cached) {
    receivedSat.value = cached.receivedSat;
    goalSat.value = cached.goalSat || GOAL_SAT;
    loadingStats.value = false;
    const wait = calculateDynamicWaitSeconds(receivedSat.value, goalSat.value);
    startCountdown(wait);
  } else {
    // 2. Default to 20s while loading fresh stats
    startCountdown(MAX_WAIT_SEC);
  }

  // 3. Fetch fresh stats
  try {
    const stats = await getMonthlyStats();
    receivedSat.value = stats.receivedSat;
    goalSat.value = stats.goalSat || GOAL_SAT;
    loadingStats.value = false;

    const freshWait = calculateDynamicWaitSeconds(receivedSat.value, goalSat.value);
    // If stats updated to less wait time, recalculate
    if (freshWait < totalWaitSeconds.value) {
      startCountdown(freshWait);
    }
  } catch {
    loadingStats.value = false;
  }
});

onUnmounted(() => {
  if (timerId) {
    clearInterval(timerId);
  }
});
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text) flex flex-col items-center justify-center p-4 sm:p-6">
    <div
      class="w-full max-w-lg border border-(--app-border) bg-(--app-surface) shadow-xl rounded-3xl p-6 sm:p-8 space-y-6"
    >
      <!-- Header -->
      <div class="text-center space-y-3">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500">
          <Heart class="h-8 w-8" :stroke-width="2" fill="currentColor" />
        </div>
        <h1 class="text-xl font-bold text-(--app-text)">Community Funded Wait Timer</h1>
        <p class="text-xs sm:text-sm text-(--app-text-soft) leading-relaxed">
          GUPT is 100% free with zero ads. This wait timer is directly proportional to community Bitcoin donations!
        </p>
      </div>

      <!-- Engaging Community Funding Card -->
      <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-3">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5 font-semibold text-rose-400">
            <TrendingUp class="h-4 w-4 shrink-0" :stroke-width="2" />
            <span>Monthly Goal</span>
          </div>
          <span class="font-mono text-xs font-bold text-(--app-text) tabular-nums">
            {{ receivedSat.toLocaleString() }} / {{ goalSat.toLocaleString() }} sats
          </span>
        </div>

        <!-- Goal Progress Bar -->
        <div class="h-2 w-full overflow-hidden rounded-full bg-(--app-surface) border border-(--app-border)">
          <div
            class="h-full rounded-full bg-rose-500 transition-all duration-500"
            :style="{ width: `${Math.max(4, fundedPct)}%` }"
          />
        </div>

        <!-- Proportional Speedup Explanation -->
        <div class="flex items-start gap-2 pt-1 text-[11px] leading-snug text-(--app-text-soft)">
          <Sparkles class="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" :stroke-width="2" />
          <p v-if="secondsSaved > 0">
            Community donations are at <strong class="text-rose-400 font-bold">{{ fundedPct.toFixed(0) }}%</strong>!
            Your wait time was reduced by <strong class="text-emerald-400 font-bold">{{ secondsSaved }}s</strong> (from {{ MAX_WAIT_SEC }}s down to {{ totalWaitSeconds }}s).
          </p>
          <p v-else>
            Help us reach our goal of {{ goalSat.toLocaleString() }} sats to reduce wait time to <strong class="text-emerald-400 font-bold">0 seconds</strong> for everyone!
          </p>
        </div>
      </div>

      <!-- Live Timer & Countdown Progress Bar -->
      <div class="space-y-3 pt-1">
        <div class="flex items-center justify-between text-xs font-semibold text-(--app-muted)">
          <span class="flex items-center gap-1 text-emerald-400">
            <ShieldCheck class="h-4 w-4 shrink-0" :stroke-width="2" />
            <span>{{ fundedPct.toFixed(0) }}% Funded Speed</span>
          </span>
          <span class="font-mono text-sm text-rose-400 font-bold tabular-nums">
            {{ timeLeft }}s remaining
          </span>
        </div>

        <div class="h-3 w-full overflow-hidden rounded-full bg-(--app-surface-soft) border border-(--app-border)">
          <div
            class="h-full rounded-full bg-rose-500 transition-all duration-75 ease-linear"
            :style="{ width: `${progressPct}%` }"
          />
        </div>
      </div>

      <!-- Actions -->
      <div class="space-y-3 pt-2">
        <button
          type="button"
          class="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-3.5 text-sm font-bold text-white shadow-md hover:bg-rose-600 active:scale-[0.98] transition-all"
          @click="goToDonate"
        >
          <Zap class="h-4 w-4" :stroke-width="2.2" />
          <span>Donate Sats to Reduce Wait Time</span>
        </button>

        <button
          type="button"
          :disabled="timeLeft > 0"
          class="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-5 py-3 text-xs font-semibold text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          @click="proceedToTarget"
        >
          <span>{{ timeLeft > 0 ? `Continuing to ${targetName} in ${timeLeft}s...` : `Continue to ${targetName}` }}</span>
          <ArrowRight class="h-3.5 w-3.5" :stroke-width="2" />
        </button>
      </div>
    </div>
  </div>
</template>
