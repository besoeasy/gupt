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

  // Show immediately from cache so there's no visible delay
  const cached = getCachedMonthlyStatsSync();
  if (cached && cached.receivedSat < GOAL_SAT) {
    receivedSat.value = cached.receivedSat;
    visible.value = true;
    setTimeout(() => {
      animatedPct.value = pct.value;
    }, 350);
  } else if (!cached) {
    // No cache yet — show with 0% optimistically while we fetch
    visible.value = true;
    setTimeout(() => {
      animatedPct.value = pct.value;
    }, 350);
  }

  // Refresh in the background and update/hide accordingly
  const stats = await getMonthlyStats();
  if (stats.receivedSat >= GOAL_SAT) {
    visible.value = false;
  } else {
    receivedSat.value = stats.receivedSat;
    if (!visible.value) visible.value = true;
    animatedPct.value = pct.value;
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
    <div
      v-if="visible"
      ref="bannerEl"
      class="funding-banner shrink-0 w-full bg-black/90 backdrop-blur-xl overflow-hidden"
    >
      <!-- Content row -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-white/6">
        <!-- Pulsing heart -->
        <Heart
          class="w-3.5 h-3.5 shrink-0 text-rose-400 transition-transform duration-200 hover:scale-125"
          :stroke-width="2"
          fill="currentColor"
        />

        <span class="min-w-0 flex-1 text-xs text-zinc-400 truncate">
          gupt runs on donations — no ads, no subscriptions
        </span>

        <span class="text-xs font-semibold tabular-nums text-zinc-300 shrink-0">
          {{ pct.toFixed(0) }}% funded
        </span>

        <RouterLink
          to="/donate"
          class="group shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-(--ig-blue)/90 text-white transition-all duration-150 hover:bg-(--ig-blue) hover:scale-105 active:scale-95"
        >
          <Zap
            class="w-3 h-3 transition-transform duration-150 group-hover:rotate-12"
            :stroke-width="2.5"
          />
          Donate
        </RouterLink>

        <button
          @click="dismiss"
          class="shrink-0 p-0.5 text-zinc-600 transition-all duration-150 hover:text-zinc-300 hover:rotate-90"
          aria-label="Dismiss"
        >
          <X class="w-3 h-3" :stroke-width="2.5" />
        </button>
      </div>

      <!-- Progress bar track -->
      <div class="group h-0.75 w-full bg-white/6">
        <div
          class="h-full bg-linear-to-r from-(--ig-blue) to-violet-500 transition-all duration-700 ease-out group-hover:brightness-125"
          :style="{ width: animatedPct + '%' }"
        />
      </div>
    </div>
  </Transition>
</template>
