<script setup>
defineProps({
  eyebrow: { type: String, default: "" },
  title: { type: String, default: "" },
  eyebrowClass: { type: String, default: "page-header__variant-1" },
});
</script>

<template>
  <header class="page-header__header">
    <div class="page-header__block">
      <p v-if="eyebrow" class="page-header__text" :class="eyebrowClass">
        {{ eyebrow }}
      </p>
      <h1 v-if="title" class="page-header__title">
        {{ title }}
      </h1>
      <slot />
    </div>
  </header>
</template>

<style scoped>
@layer base, gupt-components;

/* Ledger page header: mono eyebrow, one display line, a hairline and air. */

.page-header__header {
  padding-bottom: var(--app-space-6);
  border-bottom: 1px solid var(--app-border);
  animation: ledger-rise 480ms var(--app-ease-emphasized) both;
}

.page-header__block {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
  min-width: 0;
}

.page-header__text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  line-height: 1.4;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.page-header__variant-1 {
  color: var(--app-muted-2);
}

.page-header__title {
  margin: 0;
  font-size: var(--app-text-display);
  line-height: 1.05;
  font-weight: 600;
  letter-spacing: var(--app-tracking-display);
  color: var(--app-text);
  overflow-wrap: anywhere;
}

@media (max-width: 26rem) {
  .page-header__header {
    padding-bottom: var(--app-space-5);
  }

  .page-header__title {
    font-size: 26px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-header__header {
    animation: none;
  }
}
</style>
