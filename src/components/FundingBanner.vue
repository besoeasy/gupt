<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount, nextTick } from "vue";
import { RouterLink } from "vue-router";
import { X } from "lucide-vue-next";
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
      class="funding-banner shrink-0 w-full border-b border-white/7 bg-black/90 px-3 py-1.5 backdrop-blur-xl"
    >
      <div class="flex items-center gap-2">
        <span class="relative flex h-1.5 w-1.5 shrink-0">
          <span class="absolute inline-flex h-full w-full rounded-full bg-(--ig-blue)/45 animate-ping" />
          <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-(--ig-blue)" />
        </span>

        <span class="min-w-0 flex-1 text-xs text-zinc-400 truncate">
          gupt runs on donations — no ads, no subscriptions · {{ pct.toFixed(0) }}% of this month's costs covered
        </span>

        <RouterLink
          to="/donate"
          class="shrink-0 rounded px-2 py-0.5 text-xs font-medium bg-(--ig-blue) text-white transition-opacity hover:opacity-80"
        >
          Donate
        </RouterLink>

        <button
          @click="dismiss"
          class="shrink-0 p-0.5 text-zinc-600 transition-colors hover:text-zinc-300"
          aria-label="Dismiss"
        >
          <X class="w-3 h-3" :stroke-width="2.5" />
        </button>
      </div>
    </div>
  </Transition>
</template>
