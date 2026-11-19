<script setup>
defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
});
</script>

<template>
  <section
    :id="id"
    class="scroll-mt-20 rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-4 transition-shadow duration-500"
  >
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold tracking-tight text-zinc-100">{{ title }}</h2>
        <p v-if="description" class="mt-0.5 text-xs leading-relaxed text-zinc-500">
          {{ description }}
        </p>
      </div>
      <slot name="action" />
    </header>

    <div class="mt-3">
      <slot />
    </div>
  </section>
</template>
