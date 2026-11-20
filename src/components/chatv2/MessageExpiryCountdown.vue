<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  expiryProgress,
  expiryUrgency,
  formatExpiryCountdown,
  formatExpiryWarning,
  isExpiryFinalWarning,
  shouldShowExpiryCountdown,
} from "@/lib/chatCountdown";

const props = defineProps({
  expiresAt: { type: Number, default: 0 },
  startedAt: { type: Number, default: 0 },
  /** Sit on top of a picture: dark pill instead of bare text. */
  framed: { type: Boolean, default: false },
});

// The countdown is the only place that knows the exact moment a message is due
// to vanish, so it asks for the removal as soon as it reaches zero.
const emit = defineEmits(["expired"]);

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

// Report the deadline exactly once: the row should leave the room on the tick
// its countdown reaches zero, not whenever the next sweep happens to run.
let reportedExpiry = false;
watch(remainingMs, (ms) => {
  if (reportedExpiry || !Number(props.expiresAt)) return;
  if (Number(ms) > 0) return;
  reportedExpiry = true;
  emit("expired");
});
// Last ten seconds: the badge pulses and counts seconds, so a message never
// disappears while it is being read without a visible warning first.
const warning = computed(() => isExpiryFinalWarning(remainingMs.value));
const secondsLeft = computed(() =>
  Math.max(1, Math.ceil(Math.max(0, remainingMs.value) / 1000)),
);
const label = computed(() =>
  warning.value
    ? formatExpiryWarning(remainingMs.value)
    : formatExpiryCountdown(remainingMs.value),
);
const urgency = computed(() => expiryUrgency(remainingMs.value));
const urgencyClass = computed(() =>
  warning.value
    ? "message-expiry-countdown__danger"
    : {
        calm: "message-expiry-countdown__muted",
        soon: "message-expiry-countdown__warning",
        critical: "message-expiry-countdown__danger-2",
      }[urgency.value],
);
const pillClass = computed(() => {
  if (!props.framed) return "";
  return warning.value
    ? "message-expiry-countdown__danger-3"
    : "message-expiry-countdown__variant-6";
});
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
    class="message-expiry-countdown__text"
    :class="[
      urgencyClass,
      pillClass,
      warning ? 'message-expiry-countdown__text--pulse' : '',
    ]"
    :title="`Disappears in ${warning ? `${secondsLeft}s` : label}`"
    :aria-label="`Disappears in ${warning ? `${secondsLeft}s` : label}`"
  >
    <svg class="message-expiry-countdown__icon" viewBox="0 0 12 12" aria-hidden="true">
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
        class="message-expiry-countdown__icon-shape"
      />
    </svg>
    <span class="message-expiry-countdown__text-2">{{ label }}</span>
  </span>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.message-expiry-countdown__danger-3 {
  border-color: color-mix(in oklab,var(--color-red-500) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.message-expiry-countdown__variant-6 {
  border-color: color-mix(in oklab,var(--ui-zinc-700) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.message-expiry-countdown__danger-3 {
  background-color: color-mix(in oklab,var(--color-red-950) 85%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.message-expiry-countdown__variant-6 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 85%,transparent);
}
}

@media (prefers-reduced-motion:reduce) {
.message-expiry-countdown__text--pulse {
  animation: none;
}
}

@layer gupt-components {
.message-expiry-countdown__text {
  display: inline-flex;
}
.message-expiry-countdown__icon {
  height: calc(var(--spacing) * 3);
}
.message-expiry-countdown__icon {
  width: calc(var(--spacing) * 3);
}
.message-expiry-countdown__icon {
  flex-shrink: 0;
}
.message-expiry-countdown__icon {
  rotate: -90deg;
}
.message-expiry-countdown__text--pulse {
  animation: var(--animate-pulse);
}
.message-expiry-countdown__text {
  align-items: center;
}
.message-expiry-countdown__text {
  gap: var(--spacing);
}
.message-expiry-countdown__danger-3 {
  border-radius: 3.40282e38px;
}
.message-expiry-countdown__variant-6 {
  border-radius: 3.40282e38px;
}
.message-expiry-countdown__danger-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.message-expiry-countdown__variant-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.message-expiry-countdown__danger-3 {
  border-color: #fb2c3680;
}
.message-expiry-countdown__variant-6 {
  border-color: var(--ui-zinc-700);
}
.message-expiry-countdown__danger-3 {
  background-color: #460809d9;
}
.message-expiry-countdown__variant-6 {
  background-color: var(--ui-zinc-950);
}
.message-expiry-countdown__danger-3 {
  padding-inline: calc(var(--spacing) * 2);
}
.message-expiry-countdown__variant-6 {
  padding-inline: calc(var(--spacing) * 2);
}
.message-expiry-countdown__danger-3 {
  padding-block: calc(var(--spacing) * .5);
}
.message-expiry-countdown__variant-6 {
  padding-block: calc(var(--spacing) * .5);
}
.message-expiry-countdown__text-2 {
  font-family: var(--font-mono);
}
.message-expiry-countdown__text-2 {
  font-size: 10px;
}
.message-expiry-countdown__text-2 {
  white-space: nowrap;
}
.message-expiry-countdown__warning {
  color: var(--color-amber-400);
}
.message-expiry-countdown__danger {
  color: var(--color-red-300);
}
.message-expiry-countdown__danger-2 {
  color: var(--color-red-400);
}
.message-expiry-countdown__muted {
  color: var(--ui-zinc-500);
}
.message-expiry-countdown__text-2 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.message-expiry-countdown__danger-3 {
  --shadow: 0 0 14px -3px var(--shadow-color,#f8717199);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 0 14px -3px var(--shadow-color,#f8717199);
}
.message-expiry-countdown__variant-6 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.message-expiry-countdown__danger-3 {
  --backdrop-blur: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.message-expiry-countdown__variant-6 {
  --backdrop-blur: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.message-expiry-countdown__icon-shape {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.message-expiry-countdown__icon-shape {
  --duration: .7s;
  transition-duration: .7s;
}
.message-expiry-countdown__icon-shape {
  --ease: linear;
  transition-timing-function: linear;
}
.message-expiry-countdown__text {
  -webkit-user-select: none;
  user-select: none;
}
[data-theme="light"] .message-expiry-countdown__warning {
  color: var(--app-warning);
}
[data-theme="light"] .message-expiry-countdown__danger {
  color: var(--app-danger);
}
[data-theme="light"] .message-expiry-countdown__danger-2 {
  color: var(--app-danger);
}
[data-theme="light"] .message-expiry-countdown__muted {
  color: var(--app-muted);
}
}
}
</style>
