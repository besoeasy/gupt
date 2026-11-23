<script setup>
defineProps({
  eyebrow: { type: String, default: "" },
  title: { type: String, default: "" },
  count: { type: [Number, String], default: 0 },
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
        <span class="page-header__title-text">{{ title }}</span>
        <span v-if="Number(count) > 0" class="page-header__count">{{ count }}</span>
      </h1>
      <slot />
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
@layer base, gupt-components;

/* Ledger page header: mono eyebrow, one display line, a hairline and air. */

.page-header__header {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
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
  display: flex;
  align-items: baseline;
  gap: var(--app-space-3);
  margin: 0;
  font-size: var(--app-text-display);
  line-height: 1.05;
  font-weight: 600;
  letter-spacing: var(--app-tracking-display);
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.page-header__title-text {
  min-width: 0;
}

.page-header__count {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.page-header__count::before {
  content: "·";
  margin-right: var(--app-space-2);
  color: var(--app-border-strong);
}

.page-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-2);
}

@media (min-width: 40rem) {
  .page-header__header {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--app-space-6);
  }

  .page-header__actions {
    flex-shrink: 0;
    padding-bottom: 2px;
  }
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
