<script setup>
import { ref, computed, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { X } from "lucide-vue-next";
import {
  checkRecentFunding,
  isFundingBannerDismissed,
  dismissFundingBanner,
  getMonthlyStats,
  GOAL_SAT,
} from "@/lib/funding";

const visible = ref(false);
const receivedSat = ref(0);
const animatedPct = ref(0);

const pct = computed(() => Math.min(100, (receivedSat.value / GOAL_SAT) * 100));

function dismiss() {
  dismissFundingBanner();
  visible.value = false;
}

onMounted(async () => {
  if (isFundingBannerDismissed()) return;
  const funded = await checkRecentFunding();
  if (!funded) {
    // load stats then show so bar can animate in
    const stats = await getMonthlyStats();
    receivedSat.value = stats.receivedSat;
    visible.value = true;
    // delay so the enter transition completes first, then animate bar
    setTimeout(() => { animatedPct.value = pct.value; }, 350);
  }
});
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div v-if="visible" class="w-full bg-amber-500/10 text-amber-200 px-4 py-2.5 text-sm">
      <div class="max-w-4xl mx-auto space-y-1.5">
        <div class="flex items-center gap-3">
          <span class="flex-1 text-xs text-amber-200/80">
            gupt is community funded —
            <RouterLink
              to="/donate"
              class="font-medium text-amber-300 hover:text-amber-100 transition-colors underline underline-offset-2"
            >support the project</RouterLink>
          </span>
          <span class="text-xs tabular-nums text-amber-300/70 shrink-0">
            {{ pct.toFixed(0) }}% of monthly goal
          </span>
          <button
            @click="dismiss"
            class="shrink-0 p-1 rounded text-amber-400/60 hover:text-amber-300 transition-colors"
            aria-label="Dismiss"
          >
            <X class="w-3.5 h-3.5" :stroke-width="2" />
          </button>
        </div>

        <!-- animated progress bar -->
        <div class="h-0.5 w-full bg-amber-900/40 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full bg-amber-400 transition-all duration-1000 ease-out"
            :style="`width:${animatedPct}%`"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>
