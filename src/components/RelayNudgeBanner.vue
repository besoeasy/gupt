<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Radio, X } from "@lucide/vue";

import { useKnownRelays } from "@/composables/useKnownRelays";
import { RELAY_RECOMMENDED_MIN, dismissRelayNudge, shouldShowRelayNudge } from "@/lib/relayNudge";
import { useIdentityStore } from "@/stores/identity";

const SETTLE_DELAY_MS = 5000;

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const { count } = useKnownRelays();

const settled = ref(false);
const visible = ref(false);
let settleTimer = null;

const suppressedRoute = computed(
  () =>
    route.path.startsWith("/call/") ||
    route.path.startsWith("/welcome") ||
    route.path.startsWith("/settings"),
);

const shortfall = computed(() => Math.max(0, RELAY_RECOMMENDED_MIN - count.value));

function evaluate() {
  visible.value =
    settled.value &&
    identity.isReady &&
    !suppressedRoute.value &&
    shouldShowRelayNudge(count.value);
}

function dismiss() {
  dismissRelayNudge(count.value);
  visible.value = false;
}

function reviewRelays() {
  dismiss();
  void router.push({ path: "/settings", query: { focus: "relays" } });
}

watch([() => identity.isReady, count, suppressedRoute], evaluate);

onMounted(() => {
  settleTimer = setTimeout(() => {
    settled.value = true;
    evaluate();
  }, SETTLE_DELAY_MS);
});

onUnmounted(() => {
  if (settleTimer) clearTimeout(settleTimer);
});
</script>

<template>
  <Transition
    appear
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="visible"
      class="mx-auto w-full max-w-6xl px-3 pt-1 pb-0.5"
      role="status"
      aria-live="polite"
    >
      <div
        class="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2"
      >
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400"
        >
          <Radio class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
        </span>

        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-medium text-amber-200">
            {{ count }} Rabta {{ count === 1 ? "relay" : "relays" }} configured
            <span class="text-amber-500/70">·</span>
            {{ RELAY_RECOMMENDED_MIN }} recommended
          </p>
          <p class="truncate text-[10px] leading-relaxed text-zinc-500">
            Add {{ shortfall }} more so one failing node can't cut you off.
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-amber-500/15 px-2.5 font-mono text-[10px] font-medium text-amber-200 transition-colors hover:bg-amber-500/25 active:scale-[0.98] sm:min-h-8"
            @click="reviewRelays"
          >
            Review relays
          </button>
          <button
            type="button"
            class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 active:scale-[0.98] sm:min-h-8"
            @click="dismiss"
          >
            Later
          </button>
          <button
            type="button"
            class="inline-flex h-11 w-8 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 active:scale-[0.98] sm:h-8"
            aria-label="Dismiss relay recommendation"
            @click="dismiss"
          >
            <X class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
