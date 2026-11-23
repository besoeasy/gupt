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
    ? "expiry--danger"
    : {
        calm: "expiry--calm",
        soon: "expiry--soon",
        critical: "expiry--critical",
      }[urgency.value],
);
const pillClass = computed(() => (props.framed ? "expiry--framed" : ""));
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
    class="expiry"
    :class="[urgencyClass, pillClass, warning ? 'expiry--pulse' : '']"
    :title="`Disappears in ${warning ? `${secondsLeft}s` : label}`"
    :aria-label="`Disappears in ${warning ? `${secondsLeft}s` : label}`"
  >
    <svg class="expiry__dial" viewBox="0 0 12 12" aria-hidden="true">
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
        class="expiry__arc"
      />
    </svg>
    <span class="expiry__label">{{ label }}</span>
  </span>
</template>

<style scoped>
/* Ledger pass: a tiny dial and a mono countdown that only colours at the end. */

.expiry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted-2);
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.expiry__dial {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
  transition: transform var(--app-dur-slow) var(--app-ease-standard);
}

.expiry__arc {
  transition: stroke-dashoffset 1s linear;
}

.expiry--soon {
  color: var(--app-warning);
}

.expiry--critical,
.expiry--danger {
  color: var(--app-danger);
}

.expiry--danger {
  font-weight: 500;
}

.expiry--pulse {
  animation: expiry-pulse 1s var(--app-ease-standard) infinite;
}

@keyframes expiry-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

/* Sits on top of a picture: needs its own plate. */

.expiry--framed {
  padding: 2px 6px;
  border: 1px solid color-mix(in oklab, var(--color-white) 22%, transparent);
  border-radius: 999px;
  background: color-mix(in oklab, #000 58%, transparent);
  color: color-mix(in oklab, var(--color-white) 86%, transparent);
}

.expiry--framed.expiry--soon {
  border-color: color-mix(in oklab, var(--app-warning) 60%, transparent);
  color: var(--app-warning);
}

.expiry--framed.expiry--critical,
.expiry--framed.expiry--danger {
  border-color: color-mix(in oklab, var(--app-danger) 60%, transparent);
  background: color-mix(in oklab, var(--app-danger) 22%, #000);
  color: var(--color-white);
}

@media (prefers-reduced-motion: reduce) {
  .expiry,
  .expiry__dial,
  .expiry__arc {
    transition: none;
  }

  .expiry--pulse {
    animation: none;
  }
}
</style>
