<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount, nextTick } from "vue";
import { RouterLink } from "vue-router";
import { Heart, X, Zap } from "@lucide/vue";
import {
  isFundingBannerDismissed,
  dismissFundingBanner,
  getMonthlyStats,
  getCachedMonthlyStatsSync,
  GOAL_SAT,
} from "@/lib/funding";

const props = defineProps({
  blocked: { type: Boolean, default: false },
});

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
      v-if="visible && !props.blocked"
      ref="bannerEl"
      class="flex shrink-0 items-center gap-3 border-b border-rose-500/25 bg-(--app-surface-raised) px-4 py-2.5 transition-colors [data-theme='light']:bg-rose-50/80 [data-theme='light']:border-rose-200"
    >
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400"
      >
        <Heart class="h-4 w-4" :stroke-width="2.2" fill="currentColor" aria-hidden="true" />
      </div>

      <div class="min-w-0 flex-1 space-y-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p class="text-xs font-bold text-(--app-text) sm:text-sm">
            Gupt is 100% free & community-funded
          </p>
          <span class="hidden text-xs text-(--app-muted-2) sm:inline">•</span>
          <p class="text-xs text-(--app-muted)">
            No ads or subscriptions ·
            <strong class="font-semibold text-rose-400">{{ pct.toFixed(0) }}%</strong> funded
          </p>
        </div>

        <div class="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-(--app-border)">
          <div
            class="h-full rounded-full bg-rose-500 transition-all duration-500"
            :style="{ width: `${Math.max(4, pct)}%` }"
          />
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <RouterLink
          to="/donate"
          class="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-rose-600 active:scale-95 sm:px-4 sm:py-2 sm:text-sm"
          aria-label="Support Gupt"
        >
          <Zap class="h-3.5 w-3.5 sm:h-4 sm:w-4" :stroke-width="2.2" aria-hidden="true" />
          <span>Support Gupt</span>
        </RouterLink>
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-xl text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          aria-label="Dismiss banner"
          @click="dismiss"
        >
          <X class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Transition>
</template>
