<script setup>
import { ref } from "vue";
import { Smile } from "@/icons";

const REACT_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

const props = defineProps({
  /** Bubble side, to anchor the picker. */
  mine: { type: Boolean, default: false },
});

const emit = defineEmits(["react"]);

const open = ref(false);

function toggle() {
  open.value = !open.value;
}

function react(emoji) {
  open.value = false;
  emit("react", emoji);
}
</script>

<template>
  <div class="chat-message-bubble__reaction-trigger">
    <button
      type="button"
      @click="toggle"
      class="chat-message-bubble__button-react"
      title="React"
    >
      <Smile class="chat-message-bubble__smile" :stroke-width="1.8" />
    </button>
    <Transition
      enter-active-class="chat-message-bubble__enter-active-class"
      enter-from-class="chat-message-bubble__enter-from-class"
      enter-to-class="chat-message-bubble__enter-to-class"
      leave-active-class="chat-message-bubble__leave-active-class"
      leave-from-class="chat-message-bubble__leave-from-class"
      leave-to-class="chat-message-bubble__leave-to-class"
    >
      <div
        v-if="open"
        class="chat-message-bubble__reaction-picker"
        :class="mine ? 'chat-message-bubble__reaction-picker--mine' : 'chat-message-bubble__reaction-picker--peer'"
      >
        <button
          v-for="e in REACT_EMOJIS"
          :key="e"
          type="button"
          @click="react(e)"
          class="chat-message-bubble__emoji"
          :title="e"
        >
          {{ e }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.chat-message-bubble__reaction-trigger {
  position: relative;
}

.chat-message-bubble__button-react {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-md);
  padding: 0.25rem;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}

.chat-message-bubble__smile {
  height: 0.875rem;
  width: 0.875rem;
}

.chat-message-bubble__reaction-picker {
  position: absolute;
  bottom: 100%;
  z-index: 20;
  margin-bottom: 0.375rem;
  display: flex;
  gap: 0.25rem;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  padding-inline: 0.5rem;
  padding-block: 0.375rem;
  box-shadow: var(--app-shadow);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  background-color: color-mix(in oklab,var(--app-bg-soft) 95%,transparent);
}

.chat-message-bubble__reaction-picker--mine {
  right: 0;
}
.chat-message-bubble__reaction-picker--peer {
  left: 0;
}

.chat-message-bubble__emoji {
  cursor: pointer;
  padding-inline: 0.125rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .1s;
}

.chat-message-bubble__enter-active-class {
  transition-property: all;
  transition-duration: .15s;
  transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
}
.chat-message-bubble__leave-active-class {
  transition-property: all;
  transition-duration: .1s;
  transition-timing-function: var(--app-ease-in);
}
.chat-message-bubble__enter-from-class {
  translate: 0 0.25rem;
  scale: 90% 90%;
  opacity: 0;
}
.chat-message-bubble__enter-to-class {
  translate: 0 0;
  scale: 100% 100%;
  opacity: 1;
}
.chat-message-bubble__leave-from-class {
  scale: 100% 100%;
  opacity: 1;
}
.chat-message-bubble__leave-to-class {
  scale: 90% 90%;
  opacity: 0;
}

@media (hover: hover) {
  .chat-message-bubble__button-react:hover {
    background-color: var(--app-surface-raised);
    color: var(--app-warning);
  }
  .chat-message-bubble__emoji:hover {
    scale: 125% 125%;
  }
}
.chat-message-bubble__button-react:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 1px;
}

[data-theme="light"] .chat-message-bubble__button-react {
  color: var(--app-muted);
}

@media (prefers-reduced-motion: reduce) {
  .chat-message-bubble__button-react,
  .chat-message-bubble__emoji,
  .chat-message-bubble__enter-active-class,
  .chat-message-bubble__leave-active-class {
    transition: none;
  }
  .chat-message-bubble__enter-from-class,
  .chat-message-bubble__enter-to-class,
  .chat-message-bubble__leave-from-class,
  .chat-message-bubble__leave-to-class {
    translate: none;
    scale: none;
  }
}
</style>
