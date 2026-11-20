<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({
  size: { type: [Number, String], default: 24 },
  color: { type: String, default: "currentColor" },
  strokeWidth: { type: [Number, String], default: 2 },
  absoluteStrokeWidth: { type: [Boolean, String], default: false },
});
</script>

<!-- Vendored from @lucide/vue v1.24.0 (ISC License, https://lucide.dev) - icon: dices -->
<template>
  <AppIcon name="dices" :size="size" :color="color" :stroke-width="strokeWidth" :absolute-stroke-width="absoluteStrokeWidth">
    <rect width="12" height="12" x="2" y="10" rx="2" ry="2" />
    <path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" />
    <path d="M6 18h.01" />
    <path d="M10 14h.01" />
    <path d="M15 6h.01" />
    <path d="M18 9h.01" />
  </AppIcon>
</template>
