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
        <span class="typing-dot" />
        <span class="typing-dot" style="animation-delay: 160ms" />
        <span class="typing-dot" style="animation-delay: 320ms" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.typing-dot {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--app-muted);
  animation: typing-bounce 1.1s ease-in-out infinite;
}

@keyframes typing-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-6px);
    opacity: 1;
  }
}
</style>
