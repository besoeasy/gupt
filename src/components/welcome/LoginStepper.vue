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
  <nav class="login-stepper" :style="{ '--count': steps.length }" aria-label="Sign-in progress">
    <div class="login-stepper__track" aria-hidden="true">
      <span class="login-stepper__fill" :style="{ width: `${progress}%` }" />
    </div>

    <ol class="login-stepper__list">
      <li v-for="(item, index) in steps" :key="item.key" class="login-stepper__item">
        <button
          type="button"
          class="login-stepper__dot"
          :class="{
            'login-stepper__dot--done': index < current,
            'login-stepper__dot--current': index === current,
          }"
          :disabled="disabled || index > current"
          :aria-current="index === current ? 'step' : undefined"
          :aria-label="`Step ${index + 1}: ${item.label}${index < current ? ' (completed)' : ''}`"
          @click="$emit('select', index)"
        >
          <span class="login-stepper__dot-core">
            <Check v-if="index < current" class="login-stepper__check" aria-hidden="true" />
            <span v-else>{{ index + 1 }}</span>
          </span>
        </button>
        <span
          class="login-stepper__label"
          :class="{ 'login-stepper__label--current': index === current }"
        >{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.login-stepper {
  --count: 4;
  position: relative;
  width: 100%;
}

.login-stepper__track {
  position: absolute;
  top: 22px;
  left: calc(100% / (2 * var(--count)));
  right: calc(100% / (2 * var(--count)));
  height: 2px;
  border-radius: 999px;
  background-color: var(--app-border);
  overflow: hidden;
}

.login-stepper__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background-color: var(--app-primary);
  transition: width 0.35s var(--app-ease-swift, cubic-bezier(0.22, 1, 0.36, 1));
}

.login-stepper__list {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--count), 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
}

.login-stepper__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.login-stepper__dot {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--app-muted);
  cursor: default;
  -webkit-tap-highlight-color: transparent;
}

.login-stepper__dot-core {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background-color: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.login-stepper__dot--done {
  cursor: pointer;
}

.login-stepper__dot--done .login-stepper__dot-core {
  border-color: var(--app-primary);
  background-color: var(--app-primary);
  color: var(--app-primary-contrast, #fff);
}

.login-stepper__dot--current .login-stepper__dot-core {
  border-color: var(--app-primary);
  color: var(--app-primary);
  background-color: color-mix(in srgb, var(--app-primary) 14%, transparent);
  transform: scale(1.06);
}

.login-stepper__dot--done:hover .login-stepper__dot-core {
  transform: scale(1.08);
}

.login-stepper__dot:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

.login-stepper__dot:disabled {
  opacity: 0.55;
}

.login-stepper__dot--current:disabled {
  opacity: 1;
}

.login-stepper__check {
  width: 14px;
  height: 14px;
}

.login-stepper__label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  transition: color 0.2s ease;
}

.login-stepper__label--current {
  color: var(--app-text);
  font-weight: 600;
}

[data-theme="light"] .login-stepper__dot--current .login-stepper__dot-core {
  background-color: color-mix(in srgb, var(--app-primary) 10%, #fff);
}

@media (prefers-reduced-motion: reduce) {
  .login-stepper__fill,
  .login-stepper__dot-core,
  .login-stepper__label {
    transition: none;
  }
}
</style>
