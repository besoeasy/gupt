<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  type: { type: String, default: "submit" },
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="primary-button__button"
  >
    <!-- spinner overlay -->
    <span
      v-if="loading"
      class="primary-button__text"
    >
      <svg
        class="primary-button__icon"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle class="primary-button__icon-shape" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
        <path
          class="primary-button__icon-path"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </span>
    <span
      :class="loading ? 'primary-button__text--hidden' : 'primary-button__text--visible'"
      class="primary-button__text-2"
    >
      <slot />
    </span>
  </button>
</template>

<style scoped>

/* Ledger primary action: one filled control, six-pixel corners, a lift. */

.primary-button__button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-2);
  width: 100%;
  min-height: var(--app-touch-h);
  padding: 0 var(--app-space-5);
  border: 0;
  border-radius: var(--app-radius-sm);
  background-color: var(--app-primary);
  color: var(--app-bg);
  font-size: var(--app-text-body);
  font-weight: 500;
  letter-spacing: -0.005em;
  cursor: pointer;
  transition:
    background-color var(--app-dur-base) var(--app-ease-swift),
    box-shadow var(--app-dur-base) var(--app-ease-swift),
    transform var(--app-dur-base) var(--app-ease-swift);
}

.primary-button__button:hover {
  background-color: var(--app-primary-strong);
  box-shadow: var(--app-glow-primary);
  transform: translateY(-1px);
}

.primary-button__button:active {
  transform: scale(0.98);
}

.primary-button__button:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

.primary-button__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.primary-button__text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.primary-button__text-2 {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-2);
  transition: opacity var(--app-dur-fast) var(--app-ease-standard);
}

.primary-button__text--hidden {
  opacity: 0;
}

.primary-button__text--visible {
  opacity: 1;
}

.primary-button__icon {
  width: var(--app-space-4);
  height: var(--app-space-4);
  color: color-mix(in oklab, var(--app-bg) 80%, transparent);
  animation: spin 1s linear infinite;
}

.primary-button__icon-shape {
  opacity: 0.25;
}

.primary-button__icon-path {
  opacity: 0.75;
}

@media (prefers-reduced-motion: reduce) {
  .primary-button__button {
    transition: none;
  }
}
</style>
