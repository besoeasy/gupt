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

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--app-space-3) var(--app-space-5);
  min-height: var(--app-row-h);
  padding-block: var(--app-space-4);
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.settings-row + .settings-row {
  border-top: 1px solid var(--app-border);
}

@media (hover: hover) {
  .settings-row:hover {
    background-color: var(--app-surface-soft);
  }
}

.settings-row__copy {
  min-width: 0;
  flex: 1;
}

.settings-row__title {
  margin: 0;
  font-size: var(--app-text-body);
  line-height: 1.35;
  font-weight: 500;
  letter-spacing: -0.005em;
  color: var(--app-text);
}

.settings-row__desc {
  margin: 3px 0 0;
  max-width: 46ch;
  font-size: var(--app-text-meta);
  line-height: 1.45;
  color: var(--app-muted);
}

.settings-row__control {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  flex-shrink: 0;
  margin-left: auto;
}

@media (max-width: 26rem) {
  .settings-row {
    gap: var(--app-space-2);
  }

  .settings-row__control {
    margin-left: 0;
  }
}
</style>
