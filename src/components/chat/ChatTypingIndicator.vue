<script setup>
/**
 * Animated typing indicator — three bouncing dots.
 * Show this when a peer is composing a message.
 */
defineProps({
  name: { type: String, default: "" },
});
</script>

<template>
  <div class="typing-indicator-row flex items-end gap-2 px-4 pb-2">
    <!-- Spacer aligns with peer bubble avatar -->
    <div class="w-8 h-8 shrink-0" aria-hidden="true" />

    <div class="flex flex-col items-start gap-0.5">
      <span v-if="name" class="text-[10px] font-medium text-(--app-muted) px-1">
        {{ name }} is typing
      </span>
      <div
        class="flex items-center gap-1.5 rounded-[20px] rounded-bl-md border border-(--app-border) bg-(--bubble-them-bg) text-(--bubble-them-text) shadow-[0_14px_42px_rgba(0,0,0,0.14)] px-4 py-3"
        role="status"
        :aria-label="name ? `${name} is typing` : 'Someone is typing'"
      >
        <span
          class="block w-[7px] h-[7px] rounded-full bg-(--app-muted) animate-[typing-bounce_1.1s_ease-in-out_infinite]"
        />
        <span
          class="block w-[7px] h-[7px] rounded-full bg-(--app-muted) animate-[typing-bounce_1.1s_ease-in-out_infinite]"
          style="animation-delay: 160ms"
        />
        <span
          class="block w-[7px] h-[7px] rounded-full bg-(--app-muted) animate-[typing-bounce_1.1s_ease-in-out_infinite]"
          style="animation-delay: 320ms"
        />
      </div>
    </div>
  </div>
</template>
