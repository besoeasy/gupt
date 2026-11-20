<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({
  size: { type: [Number, String], default: 24 },
  color: { type: String, default: "currentColor" },
  strokeWidth: { type: [Number, String], default: 2 },
  absoluteStrokeWidth: { type: [Boolean, String], default: false },
});
</script>

<!-- Vendored from @lucide/vue v1.24.0 (ISC License, https://lucide.dev) - icon: code -->
<template>
  <AppIcon name="code" :size="size" :color="color" :stroke-width="strokeWidth" :absolute-stroke-width="absoluteStrokeWidth">
    <path d="m16 18 6-6-6-6" />
    <path d="m8 6-6 6 6 6" />
  </AppIcon>
</template>
