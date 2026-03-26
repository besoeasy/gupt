<script setup>
import { cn } from "@/lib/utils";

const props = defineProps({
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true,
  },
});
</script>

<template>
  <div data-slot="card-footer" :class="cn('flex items-center px-6 [.border-t]:pt-6', props.class)">
    <slot />
  </div>
</template>
