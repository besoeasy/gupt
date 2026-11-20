<script setup>
import { ChevronUp, LoaderCircle } from "@lucide/vue";

defineProps({ loading: { type: Boolean, default: false } });
defineEmits(["click"]);
</script>

<template>
  <div class="load-older-button__block">
    <button
      :disabled="loading"
      class="load-older-button__button"
      @click="$emit('click')"
    >
      <LoaderCircle
        v-if="loading"
        class="load-older-button__loader-circle"
        :stroke-width="2"
        aria-hidden="true"
      />
      <ChevronUp
        v-else
        class="load-older-button__chevron-up"
        :stroke-width="2.5"
        aria-hidden="true"
      />
      {{ loading ? "Loading…" : "Load older messages" }}
    </button>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
@media (hover:hover) {
.load-older-button__chevron-up:is(:where(.load-older-button__button):hover *) {
  --translate-y: calc(var(--spacing) * -.5);
  translate: var(--translate-x,0) calc(var(--spacing) * -.5);
}
}

@media (hover:hover) {
.load-older-button__button:hover {
  --translate-y: calc(var(--spacing) * -.5);
  translate: var(--translate-x,0) calc(var(--spacing) * -.5);
}
}

@media (hover:hover) {
.load-older-button__button:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.load-older-button__button:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.load-older-button__button:hover {
  color: var(--app-text);
}
}

@layer gupt-components {
.load-older-button__block {
  display: flex;
}
.load-older-button__button {
  display: inline-flex;
}
.load-older-button__loader-circle {
  height: calc(var(--spacing) * 3.5);
}
.load-older-button__chevron-up {
  height: calc(var(--spacing) * 3.5);
}
.load-older-button__loader-circle {
  width: calc(var(--spacing) * 3.5);
}
.load-older-button__chevron-up {
  width: calc(var(--spacing) * 3.5);
}
.load-older-button__loader-circle {
  animation: var(--animate-spin);
}
.load-older-button__button {
  align-items: center;
}
.load-older-button__block {
  justify-content: center;
}
.load-older-button__button {
  gap: calc(var(--spacing) * 2);
}
.load-older-button__button {
  border-radius: 3.40282e38px;
}
.load-older-button__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.load-older-button__button {
  border-color: var(--app-border);
}
.load-older-button__button {
  background-color: var(--app-surface-soft);
}
.load-older-button__button {
  padding-inline: calc(var(--spacing) * 5);
}
.load-older-button__button {
  padding-block: calc(var(--spacing) * 2.5);
}
.load-older-button__block {
  padding-block: calc(var(--spacing) * 4);
}
.load-older-button__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.load-older-button__button {
  color: var(--app-text-soft);
}
.load-older-button__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.load-older-button__chevron-up {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.load-older-button__button {
  --duration: .2s;
  transition-duration: .2s;
}
.load-older-button__chevron-up {
  --duration: .2s;
  transition-duration: .2s;
}
.load-older-button__button:active {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.load-older-button__button:active {
  scale: .97;
}
.load-older-button__button:disabled {
  cursor: not-allowed;
}
.load-older-button__button:disabled {
  opacity: .5;
}
}
}
</style>
