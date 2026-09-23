<script setup>
import { ChevronDown } from "@lucide/vue";

defineProps({
  count: { type: Number, default: 0 },
});

const emit = defineEmits(["click"]);
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-2 scale-95"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-2 scale-95"
  >
    <button
      v-if="count > 0"
      type="button"
      class="absolute bottom-4 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/90 px-3.5 py-1 text-xs font-mono text-zinc-100 shadow-xl backdrop-blur-md hover:bg-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer"
      @click="emit('click')"
    >
      <ChevronDown class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
      {{ count === 1 ? "New message" : `${count} new messages` }}
    </button>
  </Transition>
</template>
