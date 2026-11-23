<script setup>
import { computed } from "vue";
import { CHAT_TIMER_PRESETS } from "@/lib/chatTimer";

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  columns: { type: Number, default: 3 },
});

const emit = defineEmits(["select"]);

const gridClass = computed(() =>
  props.columns >= 4 ? "timer-grid--four" : "timer-grid--three",
);
</script>

<template>
  <div class="timer-grid" :class="gridClass">
    <button
      v-for="preset in CHAT_TIMER_PRESETS"
      :key="preset.sec"
      type="button"
      class="timer-grid__btn"
      :class="{ 'timer-grid__btn--on': preset.sec === modelValue }"
      :aria-pressed="preset.sec === modelValue"
      :title="'Messages expire after ' + preset.label"
      @click="emit('select', preset.sec)"
    >
      {{ preset.short }}
    </button>
  </div>
</template>

<style scoped>
/* Ledger pass: preset chips read as small ink stamps. */

.timer-grid {
  display: grid;
  gap: 4px;
}

.timer-grid--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.timer-grid--four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.timer-grid__btn {
  min-width: 0;
  min-height: 44px;
  padding-inline: 6px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.timer-grid__btn--on {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.timer-grid__btn:active {
  transform: translateY(1px);
}

.timer-grid__btn:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

@media (hover: hover) {
  .timer-grid__btn:not(.timer-grid__btn--on):hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
}

@media (prefers-reduced-motion: reduce) {
  .timer-grid__btn {
    transition: none;
  }
}
</style>
