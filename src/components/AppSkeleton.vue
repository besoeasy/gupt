<script setup>
const props = defineProps({
  as: { type: String, default: "div" },
});
</script>

<template>
  <component :is="props.as" class="skeleton-shimmer" aria-hidden="true" />
</template>
