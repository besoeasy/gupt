<script setup>
import { RouterLink } from "vue-router";
import { ArrowLeft } from "@lucide/vue";

defineProps({
  backTo: { type: String, required: true },
  backLabel: { type: String, required: true },
  eyebrow: { type: String, default: "" },
  title: { type: String, default: "" },
  showBackIcon: { type: Boolean, default: true },
  eyebrowClass: { type: String, default: "text-(--app-success)" },
});
</script>

<template>
  <header class="space-y-4 border-b border-white/8 pb-6">
    <RouterLink
      :to="backTo"
      class="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-white"
    >
      <ArrowLeft v-if="showBackIcon" class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
      {{ backLabel }}
    </RouterLink>
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
