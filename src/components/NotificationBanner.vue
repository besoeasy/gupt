<script setup>
import { ref, onMounted, nextTick, watch, onBeforeUnmount } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { Bell, X, ArrowRight } from "lucide-vue-next";
import { shouldShowNtfyOnboarding, dismissNtfyOnboarding } from "@/lib/ntfyOnboarding";

const visible = ref(false);
const bannerEl = ref(null);
const route = useRoute();

function updateBannerHeight() {
  const h = bannerEl.value ? bannerEl.value.offsetHeight : 0;
  document.documentElement.style.setProperty("--notification-banner-h", `${h}px`);
}

watch(visible, async (v) => {
  if (v) {
    await nextTick();
    updateBannerHeight();
  } else {
    document.documentElement.style.setProperty("--notification-banner-h", "0px");
  }
});

onBeforeUnmount(() => {
  document.documentElement.style.setProperty("--notification-banner-h", "0px");
});

function dismiss() {
  dismissNtfyOnboarding();
  visible.value = false;
}

onMounted(() => {
  if (shouldShowNtfyOnboarding() && route.path !== "/notifications") {
    visible.value = true;
  }
});

watch(
  () => route.path,
  (newPath) => {
    if (newPath === "/notifications") {
      visible.value = false;
    }
  }
);
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
      class="notification-banner flex shrink-0 items-center gap-2 border-b border-indigo-500/35 bg-indigo-500/15 px-3 py-2 shadow-[0_0_0_1px_rgba(99,102,241,0.15),inset_0_1px_0_rgba(255,255,255,0.06)] sm:gap-3 sm:px-4 sm:py-3.5"
    >
      <div
        class="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 ring-2 ring-indigo-400/30 sm:flex sm:h-9 sm:w-9"
      >
        <Bell
          class="h-3.5 w-3.5 text-indigo-400 sm:h-4 sm:w-4"
          :stroke-width="2"
          fill="currentColor"
          aria-hidden="true"
        />
      </div>

      <div class="min-w-0 flex-1">
        <p class="truncate text-xs font-semibold text-indigo-50 sm:text-sm">
          Never miss a message! Set up offline notifications.
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1 sm:gap-2">
        <RouterLink
          to="/notifications"
          class="inline-flex items-center gap-1.5 rounded-full bg-indigo-500 px-2.5 py-1.5 text-xs font-bold text-white shadow-md shadow-indigo-500/25 transition-all hover:bg-indigo-400 active:scale-95 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
          aria-label="Setup"
          @click="dismiss"
        >
          <span class="hidden sm:inline">Set up</span>
          <span class="inline sm:hidden">Setup</span>
          <ArrowRight class="h-3.5 w-3.5 sm:h-4 sm:w-4" :stroke-width="2.2" aria-hidden="true" />
        </RouterLink>
        <button
          type="button"
          class="inline-flex h-7 w-7 items-center justify-center rounded-full text-indigo-300 transition-colors hover:bg-indigo-500/20 hover:text-indigo-100 sm:h-9 sm:w-9"
          aria-label="Dismiss"
          @click="dismiss"
        >
          <X class="h-4 w-4 sm:h-5 sm:w-5" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Transition>
</template>
