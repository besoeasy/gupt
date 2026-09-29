<script setup>
defineProps({
  tabs: { type: Array, required: true },
  activeId: { type: String, required: true },
});

const emit = defineEmits(["select"]);
</script>

<template>
  <div role="tablist" class="inline-flex p-0.5 rounded-lg border border-zinc-800/80 bg-zinc-950/60">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      :aria-selected="activeId === tab.id"
      class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer select-none"
      :class="
        activeId === tab.id
          ? 'bg-zinc-800 text-white shadow-xs'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
      "
      @click="emit('select', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
