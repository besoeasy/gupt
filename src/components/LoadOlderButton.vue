<script setup>
import { ChevronUp, LoaderCircle } from "lucide-vue-next";

defineProps({ loading: { type: Boolean, default: false } });
defineEmits(["click"]);
</script>

<template>
  <div class="flex justify-center py-4">
    <button
      :disabled="loading"
      class="ui-icon-button group inline-flex items-center gap-2 px-5 py-2.5 text-xs rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]"
      @click="$emit('click')"
    >
      <LoaderCircle
        v-if="loading"
        class="w-3.5 h-3.5 animate-spin"
        :stroke-width="2"
        aria-hidden="true"
      />
      <ChevronUp
        v-else
        class="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-y-0.5"
        :stroke-width="2.5"
        aria-hidden="true"
      />
      {{ loading ? "Loading…" : "Load older messages" }}
    </button>
  </div>
</template>
