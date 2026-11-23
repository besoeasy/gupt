<script setup>
import { ChevronUp, LoaderCircle } from "@/icons";

defineProps({ loading: { type: Boolean, default: false } });
defineEmits(["click"]);
</script>

<template>
  <div class="load-older">
    <button type="button" :disabled="loading" class="load-older__btn" @click="$emit('click')">
      <LoaderCircle
        v-if="loading"
        class="load-older__icon load-older__icon--spin"
        :stroke-width="2"
        aria-hidden="true"
      />
      <ChevronUp v-else class="load-older__icon" :stroke-width="2.2" aria-hidden="true" />
      <span>{{ loading ? "Loading…" : "Load older messages" }}</span>
    </button>
  </div>
</template>

<style scoped>
/* Ledger pass: a quiet mono link on a hairline rule. */

.load-older {
  display: flex;
  justify-content: center;
  width: 100%;
  padding: var(--app-space-3) 0;
}

.load-older__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding-inline: 12px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.load-older__btn:active {
  transform: translateY(1px);
}

.load-older__btn:disabled {
  cursor: default;
}

.load-older__icon {
  width: 12px;
  height: 12px;
  transition: transform var(--app-dur-fast) var(--app-ease-standard);
}

.load-older__icon--spin {
  animation: var(--animate-spin);
}

.load-older__btn:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

@media (hover: hover) {
  .load-older__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .load-older__btn:hover .load-older__icon {
    transform: translateY(-2px);
  }
}

@media (pointer: coarse) {
  .load-older__btn {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .load-older__btn,
  .load-older__icon {
    transition: none;
  }
}
</style>
