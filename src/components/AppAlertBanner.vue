<script setup>
import { CircleCheckBig, CircleX } from "@/icons";

defineProps({
  variant: { type: String, default: "error" },
  message: { type: String, required: true },
});
</script>

<template>
  <Transition appear name="alert-banner">
    <div class="alert-banner" :class="`alert-banner--${variant}`" role="status">
      <CircleCheckBig
        v-if="variant === 'success'"
        class="alert-banner__icon"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <CircleX v-else class="alert-banner__icon" :stroke-width="1.8" aria-hidden="true" />
      <span class="alert-banner__text">{{ message }}</span>
    </div>
  </Transition>
</template>

<style scoped>

/* Ledger notice: a hairline note with one coloured mark, never a filled card. */

.alert-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: var(--app-space-3) var(--app-space-4);
  border: 1px solid var(--alert-tone);
  border-radius: var(--app-radius-sm);
  background-color: var(--alert-wash);
  color: var(--app-text);
}

.alert-banner--error {
  --alert-tone: color-mix(in oklab, var(--app-danger) 34%, transparent);
  --alert-wash: var(--app-danger-soft);
  --alert-mark: var(--app-danger);
}

.alert-banner--success {
  --alert-tone: color-mix(in oklab, var(--app-success) 34%, transparent);
  --alert-wash: var(--app-success-soft);
  --alert-mark: var(--app-success);
}

.alert-banner__icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--alert-mark);
}

.alert-banner__text {
  min-width: 0;
  font-size: var(--app-text-meta);
  line-height: var(--app-leading-body);
  overflow-wrap: anywhere;
}

.alert-banner-enter-active {
  transition:
    opacity var(--app-dur-base) var(--app-ease-standard),
    transform var(--app-dur-base) var(--app-ease-emphasized);
}

.alert-banner-leave-active {
  transition:
    opacity var(--app-dur-fast) var(--app-ease-in),
    transform var(--app-dur-fast) var(--app-ease-in);
}

.alert-banner-enter-from,
.alert-banner-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .alert-banner-enter-active,
  .alert-banner-leave-active {
    transition: opacity var(--app-dur-fast) linear;
  }

  .alert-banner-enter-from,
  .alert-banner-leave-to {
    transform: none;
  }
}
</style>
