<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount, nextTick } from "vue";
import { RouterLink } from "vue-router";
import { X } from "lucide-vue-next";
import {
  isFundingBannerDismissed,
  dismissFundingBanner,
  getMonthlyStats,
  GOAL_SAT,
} from "@/lib/funding";

const visible = ref(false);
const receivedSat = ref(0);
const animatedPct = ref(0);
const bannerEl = ref(null);

const pct = computed(() => Math.min(100, (receivedSat.value / GOAL_SAT) * 100));

function updateBannerHeight() {
  const h = bannerEl.value ? bannerEl.value.offsetHeight : 0;
  document.documentElement.style.setProperty("--funding-banner-h", `${h}px`);
}

watch(visible, async (v) => {
  if (v) {
    await nextTick();
    updateBannerHeight();
  } else {
    document.documentElement.style.setProperty("--funding-banner-h", "0px");
  }
});

onBeforeUnmount(() => {
  document.documentElement.style.setProperty("--funding-banner-h", "0px");
});

function dismiss() {
  dismissFundingBanner();
  visible.value = false;
}

onMounted(async () => {
  if (isFundingBannerDismissed()) return;
  const stats = await getMonthlyStats();
  if (stats.receivedSat < GOAL_SAT) {
    receivedSat.value = stats.receivedSat;
    visible.value = true;
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
    <div v-if="visible" ref="bannerEl" class="funding-banner shrink-0 w-full border-b border-amber-500/15 bg-linear-to-r from-amber-500/8 via-amber-500/10 to-orange-500/8 px-3 py-2 sm:px-4 sm:py-2">
      <div class="max-w-7xl mx-auto flex items-center gap-2 sm:gap-3">
        <!-- progress ring + text -->
        <RouterLink
          to="/donate"
          class="flex-1 min-w-0 flex items-center gap-2.5 sm:gap-3 group"
        >
          <!-- circular progress indicator -->
          <div class="relative shrink-0 w-6 h-6 sm:w-7 sm:h-7">
            <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke-width="3" class="stroke-amber-500/20" />
              <circle
                cx="18" cy="18" r="15" fill="none" stroke-width="3"
                stroke-linecap="round"
                class="stroke-amber-400 transition-all duration-1000 ease-out"
                :stroke-dasharray="`${animatedPct * 0.9425} 94.25`"
              />
            </svg>
            <span class="absolute inset-0 flex items-center justify-center text-[8px] sm:text-[9px] font-bold tabular-nums text-amber-300">
              {{ pct.toFixed(0) }}
            </span>
          </div>

          <span class="text-xs text-amber-200/70 truncate">
            <span class="hidden sm:inline">gupt is community funded — </span>
            <span class="font-medium text-amber-300 group-hover:text-amber-100 transition-colors">
              <span class="sm:hidden">Support gupt</span>
              <span class="hidden sm:inline">support the project</span>
            </span>
          </span>
        </RouterLink>

        <!-- desktop: monthly goal label -->
        <span class="hidden sm:inline text-[11px] tabular-nums text-amber-300/50 shrink-0">
          {{ pct.toFixed(0) }}% of monthly goal
        </span>

        <!-- dismiss -->
        <button
          @click="dismiss"
          class="shrink-0 p-1 rounded-full text-amber-400/40 hover:text-amber-300 hover:bg-amber-400/10 transition-colors"
          aria-label="Dismiss"
        >
          <X class="w-3.5 h-3.5" :stroke-width="2.5" />
        </button>
      </div>
    </div>
  </Transition>
</template>
