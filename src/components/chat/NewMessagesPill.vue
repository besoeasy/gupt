<script setup>
import { ChevronDown } from "lucide-vue-next";

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
      class="absolute bottom-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--app-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--app-surface-raised)_92%,transparent)] px-3.5 py-1.5 text-xs font-semibold text-(--app-primary) shadow-lg backdrop-blur-[12px]"
      @click="emit('click')"
    >
      <ChevronDown class="h-3.5 w-3.5" :stroke-width="2.5" aria-hidden="true" />
      {{ count === 1 ? "New message" : `${count} new messages` }}
    </button>
  </Transition>
</template>
