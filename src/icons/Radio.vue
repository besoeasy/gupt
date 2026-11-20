<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({
  size: { type: [Number, String], default: 24 },
  color: { type: String, default: "currentColor" },
  strokeWidth: { type: [Number, String], default: 2 },
  absoluteStrokeWidth: { type: [Boolean, String], default: false },
});
</script>

<!-- Vendored from @lucide/vue v1.24.0 (ISC License, https://lucide.dev) - icon: radio -->
<template>
  <AppIcon name="radio" :size="size" :color="color" :stroke-width="strokeWidth" :absolute-stroke-width="absoluteStrokeWidth">
    <path d="M16.247 7.761a6 6 0 0 1 0 8.478" />
    <path d="M19.075 4.933a10 10 0 0 1 0 14.134" />
    <path d="M4.925 19.067a10 10 0 0 1 0-14.134" />
    <path d="M7.753 16.239a6 6 0 0 1 0-8.478" />
    <circle cx="12" cy="12" r="2" />
  </AppIcon>
</template>
