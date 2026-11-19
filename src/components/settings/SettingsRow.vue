<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: "" },
});
</script>

<template>
  <div class="flex min-h-11 items-center gap-3 border-t border-zinc-800/60 py-3 first:border-t-0">
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium tracking-tight text-zinc-200">{{ title }}</p>
      <p v-if="description" class="mt-0.5 text-xs leading-relaxed text-zinc-500">
        {{ description }}
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <slot />
    </div>
  </div>
</template>
