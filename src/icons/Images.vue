<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({
  size: { type: [Number, String], default: 24 },
  color: { type: String, default: "currentColor" },
  strokeWidth: { type: [Number, String], default: 2 },
  absoluteStrokeWidth: { type: [Boolean, String], default: false },
});
</script>

<!-- Vendored from @lucide/vue v1.24.0 (ISC License, https://lucide.dev) - icon: images -->
<template>
  <AppIcon name="images" :size="size" :color="color" :stroke-width="strokeWidth" :absolute-stroke-width="absoluteStrokeWidth">
    <path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16" />
    <path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2" />
    <circle cx="13" cy="7" r="1" fill="currentColor" />
    <rect x="8" y="2" width="14" height="14" rx="2" />
  </AppIcon>
</template>
