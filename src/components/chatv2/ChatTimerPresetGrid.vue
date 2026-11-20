<script setup>
import { computed } from "vue";
import { CHAT_TIMER_PRESETS } from "@/lib/chatTimer";

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  columns: { type: Number, default: 3 },
});

const emit = defineEmits(["select"]);

const gridClass = computed(() => (props.columns >= 4 ? "chat-timer-preset-grid__variant-1" : "chat-timer-preset-grid__variant-2"));
</script>

<template>
  <div class="chat-timer-preset-grid__block" :class="gridClass">
    <button
      v-for="preset in CHAT_TIMER_PRESETS"
      :key="preset.sec"
      type="button"
      class="chat-timer-preset-grid__button"
      :class="
        preset.sec === modelValue
          ? 'chat-timer-preset-grid__button--success'
          : 'chat-timer-preset-grid__button--muted'
      "
      :aria-pressed="preset.sec === modelValue"
      :title="'Messages expire after ' + preset.label"
      @click="emit('select', preset.sec)"
    >
      {{ preset.short }}
    </button>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.chat-timer-preset-grid__button--success {
  border-color: color-mix(in oklab,var(--color-emerald-500) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-timer-preset-grid__button--success {
  background-color: color-mix(in oklab,var(--color-emerald-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-timer-preset-grid__button--muted {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@media (hover:hover) {
.chat-timer-preset-grid__button--muted:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-timer-preset-grid__button--muted:hover {
  color: var(--color-white);
}
}

@layer gupt-components {
.chat-timer-preset-grid__block {
  display: grid;
}
.chat-timer-preset-grid__button {
  min-height: 44px;
}
.chat-timer-preset-grid__button {
  cursor: pointer;
}
.chat-timer-preset-grid__variant-2 {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
.chat-timer-preset-grid__variant-1 {
  grid-template-columns: repeat(4,minmax(0,1fr));
}
.chat-timer-preset-grid__block {
  gap: calc(var(--spacing) * 1.5);
}
.chat-timer-preset-grid__button {
  border-radius: var(--radius-lg);
}
.chat-timer-preset-grid__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-timer-preset-grid__button--success {
  border-color: #00bb7f66;
}
.chat-timer-preset-grid__button--muted {
  border-color: var(--ui-zinc-800);
}
.chat-timer-preset-grid__button--success {
  background-color: #00bb7f26;
}
.chat-timer-preset-grid__button--muted {
  background-color: var(--ui-zinc-950);
}
.chat-timer-preset-grid__button {
  padding-inline: calc(var(--spacing) * 1.5);
}
.chat-timer-preset-grid__button {
  font-family: var(--font-mono);
}
.chat-timer-preset-grid__button {
  font-size: 11px;
}
.chat-timer-preset-grid__button--success {
  color: var(--color-emerald-300);
}
.chat-timer-preset-grid__button--muted {
  color: var(--ui-zinc-400);
}
.chat-timer-preset-grid__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-timer-preset-grid__button {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-timer-preset-grid__button:active {
  scale: .97;
}
[data-theme="light"] .chat-timer-preset-grid__button--success {
  color: var(--app-success);
}
[data-theme="light"] .chat-timer-preset-grid__button--muted {
  color: var(--app-muted);
}
}
}
</style>
