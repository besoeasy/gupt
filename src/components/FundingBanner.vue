<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount, nextTick } from "vue";
import { RouterLink } from "vue-router";
import { Heart, X, Zap } from "lucide-vue-next";
import {
  isFundingBannerDismissed,
  dismissFundingBanner,
  getMonthlyStats,
  getCachedMonthlyStatsSync,
  GOAL_SAT,
} from "@/lib/funding";

const visible = ref(false);
const receivedSat = ref(0);
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

  const cached = getCachedMonthlyStatsSync();
  if (cached && cached.receivedSat < GOAL_SAT) {
    receivedSat.value = cached.receivedSat;
    visible.value = true;
  } else if (!cached) {
    visible.value = true;
  }

  const stats = await getMonthlyStats();
  if (stats.receivedSat >= GOAL_SAT) {
    visible.value = false;
  } else {
    receivedSat.value = stats.receivedSat;
    if (!visible.value) visible.value = true;
  }
});
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="visible"
      ref="bannerEl"
      class="flex shrink-0 items-center gap-2 border-b border-rose-500/35 bg-rose-500/15 px-3 py-2 shadow-[0_0_0_1px_rgba(244,63,94,0.15),inset_0_1px_0_rgba(255,255,255,0.06)] sm:gap-3 sm:px-4 sm:py-3.5 [data-theme='light']_&:bg-[rgb(251_113_133/0.1)] [data-theme='light']_&:border-[rgb(251_113_133/0.25)] [&_p]:[data-theme='light']:text-[rgb(136_19_55)] [&_a]:[data-theme='light']:text-white [&_button]:[data-theme='light']:text-[rgb(190_18_60/0.7)] hover:[&_button]:[data-theme='light']:text-[rgb(136_19_55)] hover:[&_button]:[data-theme='light']:bg-[rgb(251_113_133/0.15)]"
    >
      <div
        class="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/20 ring-2 ring-rose-400/30 sm:flex sm:h-9 sm:w-9"
      >
        <Heart
          class="h-3.5 w-3.5 text-rose-400 sm:h-4 sm:w-4"
          :stroke-width="2"
          fill="currentColor"
          aria-hidden="true"
        />
      </div>

      <div class="min-w-0 flex-1">
        <p class="truncate text-xs font-semibold text-rose-50 sm:text-sm">
          Gupt runs on donations · No ads, no subscriptions ·
          {{ pct.toFixed(0) }}% funded this month
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1 sm:gap-2">
        <RouterLink
          to="/donate"
          class="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-2.5 py-1.5 text-xs font-bold text-white shadow-md shadow-rose-500/25 transition-all hover:bg-rose-400 active:scale-95 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
          aria-label="Donate"
        >
          <Zap class="h-3.5 w-3.5 sm:h-4 sm:w-4" :stroke-width="2.2" aria-hidden="true" />
          <span class="hidden sm:inline">Donate</span>
        </RouterLink>
        <button
          type="button"
          class="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-300 transition-colors hover:bg-rose-500/20 hover:text-rose-100 sm:h-9 sm:w-9"
          aria-label="Dismiss"
          @click="dismiss"
        >
          <X class="h-4 w-4 sm:h-5 sm:w-5" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Transition>
</template>
