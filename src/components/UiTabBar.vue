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
    class="tab-bar"
    :class="variant === 'surface' ? 'tab-bar--surface' : 'tab-bar--panel'"
    :style="tabbarStyle"
    role="group"
  >
    <span class="tab-bar__thumb" aria-hidden="true" />

    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :id="idPrefix ? `${idPrefix}-${tab.id}` : undefined"
      class="tab-bar__item"
      :class="{ 'tab-bar__item--active': activeTab === tab.id }"
      :aria-pressed="activeTab === tab.id"
      @click="activeTab = tab.id"
    >
      <component
        v-if="tab.icon"
        :is="tab.icon"
        class="tab-bar__icon"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <span class="tab-bar__label">{{ tab.label }}</span>
    </button>
  </div>
</template>

<style scoped>

/* Ledger segmented control: a hairline tray with one ink-filled thumb that
   slides between evenly sized labels. */

.tab-bar {
  position: relative;
  isolation: isolate;
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background-color: var(--app-surface-soft);
  min-width: 0;
}

.tab-bar--surface {
  width: 100%;
}

.tab-bar--panel {
  align-self: flex-start;
}

.tab-bar__thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  z-index: 0;
  width: calc((100% - 4px - (var(--app-tab-count) - 1) * 2px) / var(--app-tab-count));
  border-radius: calc(var(--app-radius-sm) - 2px);
  background-color: var(--app-text);
  transform: translateX(calc(var(--app-tab-index) * (100% + 2px)));
  transition: transform var(--app-dur-slow) var(--app-ease-spring);
  pointer-events: none;
}

.tab-bar__item {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-2);
  min-width: 0;
  min-height: 36px;
  padding: 0 var(--app-space-3);
  border: 0;
  border-radius: calc(var(--app-radius-sm) - 2px);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition: color var(--app-dur-base) var(--app-ease-standard);
}

.tab-bar__item--active {
  color: var(--app-bg);
}

.tab-bar__item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: -2px;
}

.tab-bar__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition: transform var(--app-dur-base) var(--app-ease-swift);
}

.tab-bar__item--active .tab-bar__icon {
  transform: scale(1.06);
}

.tab-bar__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (hover: hover) {
  .tab-bar__item:not(.tab-bar__item--active):hover {
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .tab-bar__item {
    min-height: var(--app-control-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tab-bar__thumb,
  .tab-bar__item,
  .tab-bar__icon {
    transition: none;
  }
}
</style>
