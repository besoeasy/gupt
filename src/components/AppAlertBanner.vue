<script setup>
import { CheckCircle2, XCircle } from "@lucide/vue";

defineProps({
  variant: { type: String, default: "error" },
  message: { type: String, required: true },
});
</script>

<template>
  <Transition
    appear
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-1.5 scale-[0.98]"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 -translate-y-1 scale-[0.98]"
  >
    <div
      :class="
        variant === 'success'
          ? 'bg-(--app-success-soft) text-(--app-success)'
          : 'bg-red-500/10 text-(--app-danger)'
      "
      class="flex items-start gap-3 px-4 py-3.5 rounded-2xl text-sm leading-relaxed"
    >
      <CheckCircle2
        v-if="variant === 'success'"
        class="w-4 h-4 shrink-0 mt-0.5"
        :stroke-width="2"
        aria-hidden="true"
      />
      <XCircle v-else class="w-4 h-4 shrink-0 mt-0.5" :stroke-width="2" aria-hidden="true" />
      <span>{{ message }}</span>
    </div>
  </Transition>
</template>
