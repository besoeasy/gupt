<script setup>
import { computed } from "vue";

const props = defineProps({
  tabs: { type: Array, required: true },
  variant: { type: String, default: "panel" },
  idPrefix: { type: String, default: "" },
});

const activeTab = defineModel({ type: String, required: true });

const activeIndex = computed(() => {
  const index = props.tabs.findIndex((tab) => tab.id === activeTab.value);
  return index < 0 ? 0 : index;
});

const tabbarStyle = computed(() => ({
  "--app-tab-count": Math.max(1, props.tabs.length),
  "--app-tab-index": activeIndex.value,
}));
</script>

<template>
  <div
    class="app-tabbar ui-tab-bar__block"
    :style="tabbarStyle"
    :class="
      variant === 'surface'
        ? 'ui-tab-bar__block--variant-1'
        : 'ui-tab-bar__block--variant-2'
    "
  >
    <span class="app-tabbar-indicator" :data-variant="variant" aria-hidden="true" />

    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :id="idPrefix ? `${idPrefix}-${tab.id}` : undefined"
      class="ui-tab-bar__button"
      :class="[
        variant === 'surface'
          ? 'ui-tab-bar__button--variant-1'
          : 'ui-tab-bar__button--variant-2',
        activeTab === tab.id
          ? 'ui-tab-bar__button--variant-3'
          : variant === 'surface'
            ? 'ui-tab-bar__button--muted'
            : 'ui-tab-bar__button--muted-2',
      ]"
      @click="activeTab = tab.id"
    >
      <component
        v-if="tab.icon"
        :is="tab.icon"
        class="ui-tab-bar__component"
        :stroke-width="2"
        aria-hidden="true"
      />
      <span :class="tab.icon ? 'ui-tab-bar__text--variant-1' : ''">{{ tab.label }}</span>
    </button>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.ui-tab-bar__block--variant-2 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@media (hover:hover) {
.ui-tab-bar__button--muted-2:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.ui-tab-bar__button--muted:hover {
  color: var(--ui-zinc-300);
}
}

@media (hover:hover) {
.ui-tab-bar__button--muted-2:hover {
  color: var(--ui-zinc-300);
}
}

@media (min-width:40rem) {
.ui-tab-bar__button--variant-1 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
}

@layer gupt-components {
.ui-tab-bar__button {
  position: relative;
}
.ui-tab-bar__button {
  z-index: 10;
}
.ui-tab-bar__block {
  display: flex;
}
.ui-tab-bar__button--variant-1 {
  display: inline-flex;
}
.ui-tab-bar__component {
  height: calc(var(--spacing) * 3.5);
}
.ui-tab-bar__component {
  width: calc(var(--spacing) * 3.5);
}
.ui-tab-bar__block--variant-1 {
  width: 100%;
}
.ui-tab-bar__button {
  flex: 1;
}
.ui-tab-bar__component {
  flex-shrink: 0;
}
.ui-tab-bar__button--variant-1 {
  align-items: center;
}
.ui-tab-bar__button--variant-1 {
  justify-content: center;
}
.ui-tab-bar__block {
  gap: var(--spacing);
}
.ui-tab-bar__button--variant-1 {
  gap: calc(var(--spacing) * 1.5);
}
.ui-tab-bar__text--variant-1 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.ui-tab-bar__block {
  border-radius: var(--radius-2xl);
}
.ui-tab-bar__button {
  border-radius: var(--radius-xl);
}
.ui-tab-bar__block--variant-1 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.ui-tab-bar__block--variant-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.ui-tab-bar__block--variant-1 {
  border-color: var(--app-border);
}
.ui-tab-bar__block--variant-2 {
  border-color: var(--app-border);
}
.ui-tab-bar__block--variant-1 {
  background-color: var(--app-surface-soft);
}
.ui-tab-bar__block--variant-2 {
  background-color: var(--app-surface);
}
.ui-tab-bar__block {
  padding: var(--spacing);
}
.ui-tab-bar__button--variant-1 {
  padding-inline: calc(var(--spacing) * 3);
}
.ui-tab-bar__button--variant-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.ui-tab-bar__button--variant-2 {
  padding-block: calc(var(--spacing) * 2);
}
.ui-tab-bar__button--variant-1 {
  padding-block: calc(var(--spacing) * 2.5);
}
.ui-tab-bar__button--variant-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.ui-tab-bar__button--variant-1 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.ui-tab-bar__button {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.ui-tab-bar__button--variant-3 {
  color: var(--app-text);
}
.ui-tab-bar__button--muted {
  color: var(--ui-zinc-500);
}
.ui-tab-bar__button--muted-2 {
  color: var(--ui-zinc-500);
}
.ui-tab-bar__block--variant-2 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.ui-tab-bar__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.ui-tab-bar__button {
  --duration: .2s;
  transition-duration: .2s;
}
[data-theme="light"] .ui-tab-bar__button--muted {
  color: var(--app-muted);
}
[data-theme="light"] .ui-tab-bar__button--muted-2 {
  color: var(--app-muted);
}
[data-theme="light"] .ui-tab-bar__button--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .ui-tab-bar__button--muted-2:hover {
  color: var(--app-text) !important;
}
}
}
</style>
