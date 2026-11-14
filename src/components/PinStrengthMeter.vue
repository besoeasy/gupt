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
  <div v-if="bits > 0" class="flex items-center gap-3">
    <div class="flex flex-1 gap-1" aria-hidden="true">
      <span
        v-for="i in 4"
        :key="i"
        class="h-1 flex-1 rounded-full transition-colors duration-300"
        :class="i <= toneFor(bits) ? 'bg-[var(--accent)]' : 'bg-(--app-surface-hover)'"
      />
    </div>
    <span class="shrink-0 text-[11px] font-medium text-(--app-muted)">
      {{ TIERS[toneFor(bits) - 1].label }} · ≈{{ bits }} bits{{ suffix }}
    </span>
  </div>
</template>
