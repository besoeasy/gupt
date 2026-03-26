<script setup>
import { CheckCircle2, XCircle } from "lucide-vue-next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

defineProps({
  variant: { type: String, default: "error" }, // "error" | "success"
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
    <Alert :variant="variant === 'error' ? 'destructive' : 'default'">
      <CheckCircle2 v-if="variant === 'success'" class="w-4 h-4" aria-hidden="true" />
      <XCircle v-else class="w-4 h-4" aria-hidden="true" />
      <AlertTitle>{{ variant === "success" ? "Success" : "Error" }}</AlertTitle>
      <AlertDescription>{{ message }}</AlertDescription>
    </Alert>
  </Transition>
</template>
