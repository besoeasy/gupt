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
    class="app-tabbar flex gap-1 rounded-2xl p-1"
    :style="tabbarStyle"
    :class="
      variant === 'surface'
        ? 'w-full border border-(--app-border) bg-(--app-surface-soft)'
        : 'border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)]'
    "
  >
    <span class="app-tabbar-indicator" :data-variant="variant" aria-hidden="true" />

    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :id="idPrefix ? `${idPrefix}-${tab.id}` : undefined"
      class="relative z-10 flex-1 rounded-xl font-semibold transition-colors duration-200"
      :class="[
        variant === 'surface'
          ? 'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm'
          : 'px-3 py-2 text-sm',
        activeTab === tab.id
          ? 'text-(--app-text)'
          : variant === 'surface'
            ? 'text-zinc-500 hover:text-zinc-300'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-(--app-surface-hover)',
      ]"
      @click="activeTab = tab.id"
    >
      <component
        v-if="tab.icon"
        :is="tab.icon"
        class="h-3.5 w-3.5 shrink-0"
        :stroke-width="2"
        aria-hidden="true"
      />
      <span :class="tab.icon ? 'truncate' : ''">{{ tab.label }}</span>
    </button>
  </div>
</template>
