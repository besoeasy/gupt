<script setup>
defineProps({
  eyebrow: { type: String, default: "" },
  title: { type: String, default: "" },
  eyebrowClass: { type: String, default: "text-(--app-success)" },
});
</script>

<template>
  <header class="border-b border-(--app-border) pb-6">
    <div class="space-y-1.5">
      <p
        v-if="eyebrow"
        class="text-[11px] font-semibold uppercase tracking-[0.16em]"
        :class="eyebrowClass"
      >
        {{ eyebrow }}
      </p>
      <h1 v-if="title" class="text-2xl font-bold tracking-tight sm:text-3xl">
        {{ title }}
      </h1>
      <slot />
    </div>
  </header>
</template>
