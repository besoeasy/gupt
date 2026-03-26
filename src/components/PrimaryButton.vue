<script setup>
import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-vue-next";

defineProps({
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});
</script>

<template>
  <Button :disabled="disabled || loading" class="w-full" size="lg">
    <LoaderCircle v-if="loading" class="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
    <slot />
  </Button>
</template>
