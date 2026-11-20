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
    class="pin-strength-meter__meter"
    role="meter"
    :aria-valuenow="bits"
    aria-valuemin="0"
    aria-valuemax="120"
    :aria-valuetext="`${TIERS[toneFor(bits) - 1].label}, approximately ${bits} bits`"
  >
    <div class="pin-strength-meter__block" aria-hidden="true">
      <span
        v-for="i in 4"
        :key="i"
        class="pin-strength-meter__text"
        :class="i <= toneFor(bits) ? 'pin-strength-meter__text--variant-1' : 'pin-strength-meter__text--variant-2'"
      />
    </div>
    <span class="pin-strength-meter__text-2">
      {{ TIERS[toneFor(bits) - 1].label }} · ≈{{ bits }} bits{{ suffix }}
    </span>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
.pin-strength-meter__meter {
  display: flex;
}

.pin-strength-meter__block {
  display: flex;
}

.pin-strength-meter__text {
  height: var(--spacing);
}

.pin-strength-meter__block {
  flex: 1;
}

.pin-strength-meter__text {
  flex: 1;
}

.pin-strength-meter__text-2 {
  flex-shrink: 0;
}

.pin-strength-meter__meter {
  align-items: center;
}

.pin-strength-meter__block {
  gap: var(--spacing);
}

.pin-strength-meter__meter {
  gap: calc(var(--spacing) * 3);
}

.pin-strength-meter__text {
  border-radius: 3.40282e38px;
}

.pin-strength-meter__text--variant-2 {
  background-color: var(--app-surface-hover);
}

.pin-strength-meter__text--variant-1 {
  background-color: var(--accent);
}

.pin-strength-meter__text-2 {
  font-size: 11px;
}

.pin-strength-meter__text-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}

.pin-strength-meter__text-2 {
  color: var(--app-muted);
}

.pin-strength-meter__text {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}

.pin-strength-meter__text {
  --duration: .3s;
  transition-duration: .3s;
}
}
</style>
