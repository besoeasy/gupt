<script setup>
import { pendingCount } from "@/lib/sendQueue";
import { Upload } from "lucide-vue-next";
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 scale-75"
    leave-active-class="transition-all duration-150 ease-in"
    leave-to-class="opacity-0 scale-75"
  >
    <div
      v-if="pendingCount > 0"
      class="flex items-center gap-1 rounded-2xl bg-(--app-primary)/15 px-2.5 py-1 text-xs font-semibold text-(--app-primary) select-none"
      :title="`${pendingCount} action${pendingCount === 1 ? '' : 's'} pending`"
      aria-live="polite"
      :aria-label="`${pendingCount} pending relay write${pendingCount === 1 ? '' : 's'}`"
    >
      <!-- Spinning upload icon -->
      <Upload class="h-3.5 w-3.5 shrink-0 animate-spin" :stroke-width="2.5" aria-hidden="true" />
      <span>{{ pendingCount }}</span>
    </div>
  </Transition>
</template>
