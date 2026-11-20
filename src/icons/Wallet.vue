<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({
  size: { type: [Number, String], default: 24 },
  color: { type: String, default: "currentColor" },
  strokeWidth: { type: [Number, String], default: 2 },
  absoluteStrokeWidth: { type: [Boolean, String], default: false },
});
</script>

<!-- Vendored from @lucide/vue v1.24.0 (ISC License, https://lucide.dev) - icon: wallet -->
<template>
  <AppIcon name="wallet" :size="size" :color="color" :stroke-width="strokeWidth" :absolute-stroke-width="absoluteStrokeWidth">
    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </AppIcon>
</template>
