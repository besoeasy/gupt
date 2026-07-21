<script setup>
defineProps({
  name: { type: String, default: "" },
});
</script>

<template>
  <div
    class="flex items-center gap-2 px-4 py-1 text-xs text-(--app-muted)"
    role="status"
    :aria-label="name ? `${name} is typing` : 'Someone is typing'"
  >
    <span class="font-medium text-(--app-text-soft)">
      {{ name ? `${name} is typing` : "Someone is typing" }}
    </span>
    <span class="flex items-center gap-1">
      <span
        class="block h-1 w-1 rounded-full bg-(--app-primary) animate-[typing-bounce_1.1s_ease-in-out_infinite]"
      />
      <span
        class="block h-1 w-1 rounded-full bg-(--app-primary) animate-[typing-bounce_1.1s_ease-in-out_infinite]"
        style="animation-delay: 160ms"
      />
      <span
        class="block h-1 w-1 rounded-full bg-(--app-primary) animate-[typing-bounce_1.1s_ease-in-out_infinite]"
        style="animation-delay: 320ms"
      />
    </span>
  </div>
</template>
