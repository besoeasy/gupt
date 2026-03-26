<script setup>
import { ChevronUp, LoaderCircle } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

defineProps({ loading: { type: Boolean, default: false } });
defineEmits(["click"]);
</script>

<template>
  <div class="flex justify-center py-4">
    <Button
      variant="secondary"
      size="sm"
      :disabled="loading"
      class="rounded-full"
      @click="$emit('click')"
    >
      <LoaderCircle v-if="loading" class="w-3.5 h-3.5 mr-2 animate-spin" aria-hidden="true" />
      <ChevronUp v-else class="w-3.5 h-3.5 mr-2" aria-hidden="true" />
      {{ loading ? "Loading…" : "Load older messages" }}
    </Button>
  </div>
</template>
