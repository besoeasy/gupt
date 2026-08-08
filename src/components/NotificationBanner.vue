<script setup>
import { ref, onMounted, nextTick, watch, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { Bell } from "@lucide/vue";
import { shouldShowNtfyOnboarding } from "@/lib/ntfyOnboarding";
import { useIdentityStore } from "@/stores/identity";

const visible = ref(false);
const bannerEl = ref(null);
const route = useRoute();
const identity = useIdentityStore();

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

function checkVisibility() {
  if (
    identity.mode !== "ephemeral" &&
    shouldShowNtfyOnboarding() &&
    route.path !== "/notifications"
  ) {
    visible.value = true;
  } else {
    visible.value = false;
  }
}

onMounted(() => {
  checkVisibility();
});

watch([() => identity.mode, () => route.path], () => {
  checkVisibility();
});

defineExpose({ visible });
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-(--app-ease-swift)"
    enter-from-class="opacity-0 -translate-y-3"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-3"
  >
    <div
      v-if="visible"
      ref="bannerEl"
      class="notification-banner relative flex shrink-0 items-center gap-2 overflow-hidden border-b border-[color-mix(in_srgb,var(--app-primary)_30%,transparent)] bg-linear-to-r from-[color-mix(in_srgb,var(--app-primary)_16%,transparent)] via-[color-mix(in_srgb,var(--app-primary)_7%,transparent)] to-transparent px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:gap-2.5 sm:px-4 sm:py-2"
    >
      <!-- Ambient glow -->
      <div
        class="pointer-events-none absolute -left-10 -top-12 h-32 w-32 rounded-full bg-(--app-primary)/25 blur-2xl"
        aria-hidden="true"
      ></div>

      <!-- Icon badge -->
      <div
        class="relative hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-(--app-primary) to-(--app-accent-share) text-white shadow-[0_6px_18px_color-mix(in_srgb,var(--app-primary)_45%,transparent)] ring-1 ring-white/15 sm:flex sm:h-10 sm:w-10"
      >
        <Bell
          class="h-4 w-4 sm:h-4.5 sm:w-4.5"
          :stroke-width="2.2"
          fill="currentColor"
          aria-hidden="true"
        />
      </div>

      <!-- Copy -->
      <div class="relative min-w-0 flex-1">
        <p class="truncate text-sm font-bold leading-tight text-(--app-text) sm:text-[15px]">
          Never miss a message — set up offline notifications
        </p>
      </div>
    </div>
  </Transition>
</template>
