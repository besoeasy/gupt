<script setup>
import { computed } from "vue";
import { Check } from "@/icons";

const props = defineProps({
  steps: { type: Array, required: true },
  current: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
});

defineEmits(["select"]);

const progress = computed(() => {
  const last = props.steps.length - 1;
  return last > 0 ? (props.current / last) * 100 : 0;
});
</script>

<template>
  <nav class="stepper" :style="{ '--count': steps.length }" aria-label="Sign-in progress">
    <div class="stepper__track" aria-hidden="true">
      <span class="stepper__fill" :style="{ width: `${progress}%` }" />
    </div>

    <ol class="stepper__list">
      <li v-for="(item, index) in steps" :key="item.key" class="stepper__item">
        <button
          type="button"
          class="stepper__dot"
          :class="{
            'stepper__dot--done': index < current,
            'stepper__dot--current': index === current,
          }"
          :disabled="disabled || index > current"
          :aria-current="index === current ? 'step' : undefined"
          :aria-label="`Step ${index + 1}: ${item.label}${index < current ? ' (completed)' : ''}`"
          @click="$emit('select', index)"
        >
          <span class="stepper__core">
            <Check v-if="index < current" class="stepper__check" :stroke-width="2.4" aria-hidden="true" />
            <span v-else>{{ index + 1 }}</span>
          </span>
        </button>
        <span class="stepper__label" :class="{ 'stepper__label--current': index === current }">
          {{ item.label }}
        </span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
/* Ledger pass: a numbered rail, not a progress bar. */

.stepper {
  --count: 4;
  position: relative;
  width: 100%;
}

.stepper__track {
  position: absolute;
  top: 22px;
  left: calc(100% / (2 * var(--count)));
  right: calc(100% / (2 * var(--count)));
  height: 1px;
  background: var(--app-border);
  overflow: hidden;
}

.stepper__fill {
  display: block;
  height: 100%;
  background: var(--app-text);
  transition: width 360ms var(--app-ease-emphasized);
}

.stepper__list {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--count), 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
}

.stepper__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.stepper__dot {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--app-muted-2);
  cursor: default;
  -webkit-tap-highlight-color: transparent;
}

.stepper__core {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  background: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.stepper__dot--done {
  cursor: pointer;
}

.stepper__dot--done .stepper__core {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.stepper__dot--current .stepper__core {
  border-color: var(--app-text);
  color: var(--app-text);
  transform: scale(1.08);
}

.stepper__dot:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

.stepper__dot:disabled {
  opacity: 0.55;
}

.stepper__dot--current:disabled {
  opacity: 1;
}

.stepper__check {
  width: 11px;
  height: 11px;
}

.stepper__label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-muted-2);
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.stepper__label--current {
  color: var(--app-text);
  font-weight: 500;
}

@media (hover: hover) {
  .stepper__dot--done:hover .stepper__core {
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .stepper__fill,
  .stepper__core,
  .stepper__label {
    transition: none;
  }
}
</style>
