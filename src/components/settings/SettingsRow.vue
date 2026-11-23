<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: "" },
});
</script>

<template>
  <div class="settings-row">
    <div class="settings-row__copy">
      <p class="settings-row__title">{{ title }}</p>
      <p v-if="description" class="settings-row__desc">{{ description }}</p>
    </div>
    <div class="settings-row__control">
      <slot />
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
  min-height: 56px;
  padding-block: calc(var(--spacing) * 3);
}

.settings-row + .settings-row {
  border-top: 1px solid var(--app-border-faint);
}

.settings-row__copy {
  min-width: 0;
  flex: 1;
}

.settings-row__title {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  font-weight: 550;
  color: var(--app-text);
}

.settings-row__desc {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--app-text-soft);
}

.settings-row__control {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  flex-shrink: 0;
}

@media (max-width: 26rem) {
  .settings-row {
    gap: calc(var(--spacing) * 2);
  }
}
</style>
