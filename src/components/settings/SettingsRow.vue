<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: "" },
});
</script>

<template>
  <div class="settings-row__block">
    <div class="settings-row__block-2">
      <p class="settings-row__text">{{ title }}</p>
      <p v-if="description" class="settings-row__text-2">
        {{ description }}
      </p>
    </div>
    <div class="settings-row__block-3">
      <slot />
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
.settings-row__text-2 {
  margin-top: calc(var(--spacing) * .5);
}
.settings-row__block {
  display: flex;
}
.settings-row__block-3 {
  display: flex;
}
.settings-row__block {
  min-height: calc(var(--spacing) * 11);
}
.settings-row__block-2 {
  min-width: 0;
}
.settings-row__block-2 {
  flex: 1;
}
.settings-row__block-3 {
  flex-shrink: 0;
}
.settings-row__block {
  align-items: center;
}
.settings-row__block-3 {
  align-items: center;
}
.settings-row__block-3 {
  gap: calc(var(--spacing) * 2);
}
.settings-row__block {
  gap: calc(var(--spacing) * 3);
}
.settings-row__block {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.settings-row__block {
  border-color: var(--ui-zinc-800);
}
.settings-row__block {
  padding-block: calc(var(--spacing) * 3);
}
.settings-row__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.settings-row__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.settings-row__text-2 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.settings-row__text {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-row__text {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.settings-row__text {
  color: var(--ui-zinc-200);
}
.settings-row__text-2 {
  color: var(--ui-zinc-500);
}
.settings-row__block:first-child {
  border-top-style: var(--border-style,solid);
  border-top-width: 0;
}
[data-theme="light"] .settings-row__text-2 {
  color: var(--app-muted);
}
}


@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.settings-row__block {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}
}
</style>
