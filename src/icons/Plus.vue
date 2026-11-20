<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({
  size: { type: [Number, String], default: 24 },
  color: { type: String, default: "currentColor" },
  strokeWidth: { type: [Number, String], default: 2 },
  absoluteStrokeWidth: { type: [Boolean, String], default: false },
});
</script>

<!-- Vendored from @lucide/vue v1.24.0 (ISC License, https://lucide.dev) - icon: plus -->
<template>
  <AppIcon name="plus" :size="size" :color="color" :stroke-width="strokeWidth" :absolute-stroke-width="absoluteStrokeWidth">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </AppIcon>
</template>
