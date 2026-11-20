<script setup>
import { computed, ref } from "vue";
import { ChevronDown } from "@lucide/vue";

import { useMediaQuery } from "@/composables/useMediaQuery";

const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  /** Collapse the body behind a summary row on phones only. */
  collapsible: { type: Boolean, default: false },
  summary: { type: String, default: "" },
});

const isNarrow = useMediaQuery("(max-width: 639px)");
const open = ref(false);

const collapsibleHere = computed(() => props.collapsible && isNarrow.value);
const expanded = computed(() => !collapsibleHere.value || open.value);

function toggle() {
  open.value = !open.value;
}

/** Used by `?focus=` so a deep link never lands on a closed card. */
function expand() {
  open.value = true;
}

defineExpose({ expand });
</script>

<template>
  <section
    :id="id"
    class="settings-section__section"
  >
    <header class="settings-section__header">
      <div class="settings-section__block">
        <h2 class="settings-section__subtitle">{{ title }}</h2>
        <p v-if="description" class="settings-section__text">
          {{ description }}
        </p>
      </div>
      <slot name="action" />
    </header>

    <button
      v-if="collapsibleHere"
      type="button"
      class="settings-section__button"
      :aria-expanded="expanded"
      :aria-controls="`${id}-body`"
      @click="toggle"
    >
      <span class="settings-section__text-2">
        {{ summary }}
      </span>
      <ChevronDown
        class="settings-section__chevron-down"
        :class="expanded ? 'settings-section__chevron-down--variant-1' : ''"
        :stroke-width="2"
        aria-hidden="true"
      />
    </button>

    <div
      :id="`${id}-body`"
      class="settings-section__block-2"
      :class="expanded ? 'settings-section__block--expanded' : 'settings-section__block--collapsed'"
      :inert="expanded ? null : ''"
    >
      <div class="settings-section__block-3">
        <div class="settings-section__block-4">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.settings-section__button:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-section__button:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.settings-section__button:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 70%,transparent);
}
}
}

@media (prefers-reduced-motion:reduce) {
.settings-section__block-2 {
  transition-property: none;
}
}

@layer gupt-components {
.settings-section__text {
  margin-top: calc(var(--spacing) * .5);
}
.settings-section__button {
  margin-top: calc(var(--spacing) * 3);
}
.settings-section__block-4 {
  margin-top: calc(var(--spacing) * 3);
}
.settings-section__header {
  display: flex;
}
.settings-section__button {
  display: flex;
}
.settings-section__block-2 {
  display: grid;
}
.settings-section__chevron-down {
  height: calc(var(--spacing) * 3.5);
}
.settings-section__button {
  min-height: calc(var(--spacing) * 11);
}
.settings-section__chevron-down {
  width: calc(var(--spacing) * 3.5);
}
.settings-section__button {
  width: 100%;
}
.settings-section__block {
  min-width: 0;
}
.settings-section__text-2 {
  min-width: 0;
}
.settings-section__text-2 {
  flex: 1;
}
.settings-section__chevron-down {
  flex-shrink: 0;
}
.settings-section__chevron-down--variant-1 {
  rotate: 180deg;
}
.settings-section__button {
  cursor: pointer;
}
.settings-section__section {
  scroll-margin-top: calc(var(--spacing) * 20);
}
.settings-section__block--collapsed {
  grid-template-rows: 0fr;
}
.settings-section__block--expanded {
  grid-template-rows: 1fr;
}
.settings-section__button {
  align-items: center;
}
.settings-section__header {
  align-items: flex-start;
}
.settings-section__header {
  justify-content: space-between;
}
.settings-section__button {
  gap: calc(var(--spacing) * 2);
}
.settings-section__header {
  gap: calc(var(--spacing) * 3);
}
.settings-section__text-2 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.settings-section__block-3 {
  overflow: hidden;
}
.settings-section__section {
  border-radius: var(--radius-2xl);
}
.settings-section__button {
  border-radius: var(--radius-lg);
}
.settings-section__section {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-section__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-section__section {
  border-color: var(--ui-zinc-800);
}
.settings-section__button {
  border-color: var(--ui-zinc-800);
}
.settings-section__button {
  background-color: var(--app-surface-tint-soft);
}
.settings-section__section {
  background-color: var(--app-surface-inset);
}
.settings-section__button {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-section__section {
  padding-inline: calc(var(--spacing) * 4);
}
.settings-section__section {
  padding-block: calc(var(--spacing) * 4);
}
.settings-section__button {
  text-align: left;
}
.settings-section__text-2 {
  font-family: var(--font-mono);
}
.settings-section__subtitle {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.settings-section__text {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.settings-section__text-2 {
  font-size: 10px;
}
.settings-section__button {
  font-size: 11px;
}
.settings-section__text {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.settings-section__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-section__subtitle {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.settings-section__subtitle {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.settings-section__text-2 {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.settings-section__subtitle {
  color: var(--ui-zinc-100);
}
.settings-section__button {
  color: var(--ui-zinc-300);
}
.settings-section__text-2 {
  color: var(--ui-zinc-400);
}
.settings-section__text {
  color: var(--ui-zinc-500);
}
.settings-section__chevron-down {
  color: var(--ui-zinc-500);
}
.settings-section__block-2 {
  transition-property: grid-template-rows;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-section__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-section__section {
  transition-property: box-shadow;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-section__chevron-down {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-section__button {
  --duration: .2s;
  transition-duration: .2s;
}
.settings-section__chevron-down {
  --duration: .2s;
  transition-duration: .2s;
}
.settings-section__block-2 {
  --duration: .3s;
  transition-duration: .3s;
}
.settings-section__section {
  --duration: .5s;
  transition-duration: .5s;
}
.settings-section__block-2 {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.settings-section__button:active {
  scale: .995;
}
[data-theme="light"] .settings-section__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-section__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .settings-section__text {
  color: var(--app-muted);
}
[data-theme="light"] .settings-section__chevron-down {
  color: var(--app-muted);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.settings-section__section {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-section__button {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 70%,transparent);
}
}

}
</style>
