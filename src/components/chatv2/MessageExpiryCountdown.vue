<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  expiryProgress,
  expiryUrgency,
  formatExpiryCountdown,
  shouldShowExpiryCountdown,
} from "@/lib/chatCountdown";

const props = defineProps({
  expiresAt: { type: Number, default: 0 },
  startedAt: { type: Number, default: 0 },
  /** Sit on top of a picture: dark pill instead of bare text. */
  framed: { type: Boolean, default: false },
});

// One shared clock for every bubble: a chat can hold many of these at once.
const nowMs = ref(Date.now());
let ticker = null;
let listeners = 0;

function startTicker() {
  listeners += 1;
  if (ticker || typeof setInterval === "undefined") return;
  ticker = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
}

function stopTicker() {
  listeners = Math.max(0, listeners - 1);
  if (listeners === 0 && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

onMounted(startTicker);
onUnmounted(stopTicker);

const remainingMs = computed(() => Number(props.expiresAt) - nowMs.value);
const visible = computed(() =>
  shouldShowExpiryCountdown({ expiresAt: props.expiresAt, now: nowMs.value }),
);
const label = computed(() => formatExpiryCountdown(remainingMs.value));
const urgency = computed(() => expiryUrgency(remainingMs.value));
const urgencyClass = computed(
  () =>
    ({
      calm: "text-zinc-500",
      soon: "text-amber-400",
      critical: "text-red-400",
    })[urgency.value],
);
const progress = computed(() =>
  expiryProgress({
    expiresAt: props.expiresAt,
    startedAt: props.startedAt,
    now: nowMs.value,
  }),
);

const RADIUS = 4.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const dashOffset = computed(() => CIRCUMFERENCE * (1 - progress.value));
</script>

<template>
  <span
    v-if="visible"
    data-expiry
    class="inline-flex items-center gap-1 select-none"
    :class="[
      urgencyClass,
      framed
        ? 'rounded-full border border-zinc-700/70 bg-zinc-950/85 px-2 py-0.5 shadow-xs backdrop-blur-md'
        : '',
    ]"
    :title="`Disappears in ${label}`"
    :aria-label="`Disappears in ${label}`"
  >
    <svg class="h-3 w-3 shrink-0 -rotate-90" viewBox="0 0 12 12" aria-hidden="true">
      <circle
        cx="6"
        cy="6"
        :r="RADIUS"
        fill="none"
        stroke="currentColor"
        stroke-opacity="0.25"
        stroke-width="1.5"
      />
      <circle
        cx="6"
        cy="6"
        :r="RADIUS"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
        class="transition-all duration-700 ease-linear"
      />
    </svg>
    <span class="font-mono text-[10px] tabular-nums">{{ label }}</span>
  </span>
</template>
