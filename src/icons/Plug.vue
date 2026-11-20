<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({
  size: { type: [Number, String], default: 24 },
  color: { type: String, default: "currentColor" },
  strokeWidth: { type: [Number, String], default: 2 },
  absoluteStrokeWidth: { type: [Boolean, String], default: false },
});
</script>

<!-- Vendored from @lucide/vue v1.24.0 (ISC License, https://lucide.dev) - icon: plug -->
<template>
  <AppIcon name="plug" :size="size" :color="color" :stroke-width="strokeWidth" :absolute-stroke-width="absoluteStrokeWidth">
    <path d="M12 22v-5" />
    <path d="M15 8V2" />
    <path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" />
    <path d="M9 8V2" />
  </AppIcon>
</template>
