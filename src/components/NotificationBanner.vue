<script setup>
import { ref, computed, onMounted, nextTick, watch, onBeforeUnmount } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { AlertTriangle, BellRing, X } from "@lucide/vue";
import { shouldShowNtfyOnboarding, dismissNtfyOnboarding } from "@/lib/ntfyOnboarding";
import { useIdentityStore } from "@/stores/identity";

const visible = ref(false);
const kind = ref(null);
const ephemeralDismissed = ref(false);
const bannerEl = ref(null);
const route = useRoute();
const identity = useIdentityStore();

const isEphemeral = computed(() => kind.value === "ephemeral");

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
  if (kind.value === "ntfy") dismissNtfyOnboarding();
  if (kind.value === "ephemeral") ephemeralDismissed.value = true;
  visible.value = false;
  kind.value = null;
}

function checkVisibility() {
  if (
    identity.pubkeyHex &&
    identity.mode === "ephemeral" &&
    !ephemeralDismissed.value &&
    !route.path.startsWith("/switch")
  ) {
    kind.value = "ephemeral";
    visible.value = true;
    return;
  }
  if (
    identity.mode !== "ephemeral" &&
    shouldShowNtfyOnboarding() &&
    route.path !== "/notifications"
  ) {
    kind.value = "ntfy";
    visible.value = true;
    return;
  }
  kind.value = null;
  visible.value = false;
}

onMounted(() => {
  checkVisibility();
});

watch([() => identity.mode, () => identity.pubkeyHex, () => route.path], () => {
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
      class="notification-banner relative shrink-0 overflow-hidden border-b shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      :class="
        isEphemeral
          ? 'border-amber-500/30 bg-linear-to-r from-amber-500/15 via-amber-500/6 to-transparent'
          : 'border-[color-mix(in_srgb,var(--app-primary)_28%,transparent)] bg-linear-to-r from-[color-mix(in_srgb,var(--app-primary)_15%,transparent)] via-[color-mix(in_srgb,var(--app-primary)_6%,transparent)] to-transparent'
      "
    >
      <div
        class="relative mx-auto flex w-full max-w-6xl items-center gap-2.5 px-3 py-2 sm:gap-3 sm:px-6 sm:py-2.5 lg:px-8"
      >
        <div
          class="pointer-events-none absolute -left-8 -top-14 h-36 w-36 rounded-full blur-3xl"
          :class="isEphemeral ? 'bg-amber-500/25' : 'bg-(--app-primary)/20'"
          aria-hidden="true"
        ></div>

        <div
          class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full animate-[dot-breathe_2.6s_ease-in-out_infinite] sm:h-8 sm:w-8"
          :class="
            isEphemeral
              ? 'bg-amber-500/15 text-amber-500'
              : 'bg-(--app-primary)/15 text-(--app-primary)'
          "
          aria-hidden="true"
        >
          <AlertTriangle v-if="isEphemeral" class="h-3.5 w-3.5 sm:h-4 sm:w-4" :stroke-width="2" />
          <BellRing v-else class="h-3.5 w-3.5 sm:h-4 sm:w-4" :stroke-width="2" />
        </div>

        <div class="relative min-w-0 flex-1">
          <p class="truncate text-sm font-semibold leading-tight text-(--app-text) sm:text-[15px]">
            <template v-if="isEphemeral"> Guest identity — close this tab and it is gone </template>
            <template v-else>Never miss a message — set up offline notifications</template>
          </p>
        </div>

        <div class="relative flex shrink-0 items-center gap-2 sm:gap-2.5">
          <RouterLink
            v-if="isEphemeral"
            to="/switch"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-zinc-950 shadow-[0_2px_12px_-2px_rgba(245,158,11,0.55)] transition-all duration-150 hover:bg-amber-400 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 sm:px-3.5 sm:py-2 sm:text-sm cursor-pointer"
            aria-label="Set up a permanent account"
          >
            Save account
          </RouterLink>
          <RouterLink
            v-else
            to="/notifications"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-(--app-primary) px-3 py-1.5 text-xs font-bold text-white shadow-[0_2px_12px_-2px_color-mix(in_srgb,var(--app-primary)_60%,transparent)] transition-all duration-150 hover:bg-(--app-primary-strong) hover:shadow-[0_2px_16px_-2px_color-mix(in_srgb,var(--app-primary)_75%,transparent)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-primary)/45 sm:px-3.5 sm:py-2 sm:text-sm cursor-pointer"
            aria-label="Set up notifications"
            @click="dismiss"
          >
            Set up
          </RouterLink>
          <button
            type="button"
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) sm:h-8 sm:w-8 cursor-pointer"
            aria-label="Dismiss"
            @click="dismiss"
          >
            <X class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
