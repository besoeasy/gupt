<script setup>
import { ChevronDown } from "@/icons";

defineProps({
  count: { type: Number, default: 0 },
});

const emit = defineEmits(["click"]);
</script>

<template>
  <Transition
    enter-active-class="new-pill-enter-active"
    enter-from-class="new-pill-enter-from"
    leave-active-class="new-pill-leave-active"
    leave-to-class="new-pill-leave-to"
  >
    <button v-if="count > 0" type="button" class="new-pill" @click="emit('click')">
      <ChevronDown class="new-pill__icon" :stroke-width="2.2" aria-hidden="true" />
      {{ count === 1 ? "New message" : `${count} new messages` }}
    </button>
  </Transition>
</template>

<style scoped>
/* Ledger pass: an ink pill floating over the transcript. */

.new-pill {
  position: absolute;
  bottom: var(--app-space-4);
  left: 50%;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 6px 12px;
  border: 1px solid var(--app-text);
  border-radius: 999px;
  background: var(--app-text);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-bg);
  cursor: pointer;
  transform: translateX(-50%);
  box-shadow: 0 12px 28px -18px rgba(0, 0, 0, 0.5);
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.new-pill:active {
  transform: translateX(-50%) translateY(1px);
}

.new-pill__icon {
  width: 13px;
  height: 13px;
}

.new-pill:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

.new-pill-enter-active {
  transition:
    opacity 220ms var(--app-ease-standard),
    transform 260ms var(--app-ease-emphasized);
}

.new-pill-leave-active {
  transition:
    opacity 140ms var(--app-ease-standard),
    transform 140ms var(--app-ease-standard);
}

.new-pill-enter-from,
.new-pill-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px) scale(0.96);
}

@media (hover: hover) {
  .new-pill:hover {
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
  }
}

@media (pointer: coarse) {
  .new-pill {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .new-pill,
  .new-pill-enter-active,
  .new-pill-leave-active {
    transition: none;
  }
}
</style>
