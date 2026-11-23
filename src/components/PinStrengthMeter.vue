<script setup>
defineProps({
  bits: { type: Number, default: 0 },
  suffix: { type: String, default: "" },
});

// Alphabet-aware entropy estimate from crypto.js, bucketed for a meter.
const TIERS = [
  { min: 0, label: "Weak" },
  { min: 35, label: "Fair" },
  { min: 60, label: "Strong" },
  { min: 90, label: "Excellent" },
];

function toneFor(bits) {
  let tone = 1;
  for (let i = 0; i < TIERS.length; i++) {
    if (bits >= TIERS[i].min) tone = i + 1;
  }
  return tone;
}
</script>

<template>
  <div
    v-if="bits > 0"
    class="pin-meter"
    :class="`pin-meter--${toneFor(bits)}`"
    role="meter"
    :aria-valuenow="bits"
    aria-valuemin="0"
    aria-valuemax="120"
    :aria-valuetext="`${TIERS[toneFor(bits) - 1].label}, approximately ${bits} bits`"
  >
    <div class="pin-meter__track" aria-hidden="true">
      <span
        v-for="i in 4"
        :key="i"
        class="pin-meter__seg"
        :class="{ 'pin-meter__seg--on': i <= toneFor(bits) }"
      />
    </div>
    <span class="pin-meter__readout">
      {{ TIERS[toneFor(bits) - 1].label }} · ≈{{ bits }} bits{{ suffix }}
    </span>
  </div>
</template>

<style scoped>
/* Ledger pass: four hairline segments with a tier tone. */

.pin-meter {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
}

.pin-meter__track {
  display: flex;
  flex: 1;
  gap: 3px;
  min-width: 0;
}

.pin-meter__seg {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--app-surface-inset-strong);
  transition: background-color var(--app-dur-slow) var(--app-ease-standard);
}

.pin-meter__readout {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
  transition: color var(--app-dur-slow) var(--app-ease-standard);
}

.pin-meter--1 .pin-meter__seg--on {
  background: var(--app-danger);
}

.pin-meter--1 .pin-meter__readout {
  color: var(--app-danger);
}

.pin-meter--2 .pin-meter__seg--on {
  background: var(--app-warning);
}

.pin-meter--2 .pin-meter__readout {
  color: var(--app-warning);
}

.pin-meter--3 .pin-meter__seg--on,
.pin-meter--4 .pin-meter__seg--on {
  background: var(--app-success);
}

.pin-meter--3 .pin-meter__readout,
.pin-meter--4 .pin-meter__readout {
  color: var(--app-success);
}

@media (prefers-reduced-motion: reduce) {
  .pin-meter__seg,
  .pin-meter__readout {
    transition: none;
  }
}
</style>
