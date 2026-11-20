<script setup>
import SettingsRow from "@/components/settings/SettingsRow.vue";
import { useThemeStore } from "@/stores/theme";

const theme = useThemeStore();

function select(mode) {
  const wantsDark = mode === "dark";
  if (theme.isDark !== wantsDark) theme.toggle();
}
</script>

<template>
  <div>
    <SettingsRow title="Theme" description="Applies everywhere, immediately.">
      <div
        class="settings-appearance-panel__group-theme"
        role="group"
        aria-label="Theme"
      >
        <button
          type="button"
          class="settings-appearance-panel__button-dark"
          :class="theme.isDark ? 'settings-appearance-panel__button-dark--selected' : 'settings-appearance-panel__button-dark--muted'"
          :aria-pressed="theme.isDark"
          @click="select('dark')"
        >
          Dark
        </button>
        <button
          type="button"
          class="settings-appearance-panel__button-light"
          :class="!theme.isDark ? 'settings-appearance-panel__button-light--selected' : 'settings-appearance-panel__button-light--muted'"
          :aria-pressed="!theme.isDark"
          @click="select('light')"
        >
          Light
        </button>
      </div>
    </SettingsRow>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.settings-appearance-panel__group-theme {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@media (hover:hover) {
.settings-appearance-panel__button-dark--muted:hover {
  color: var(--ui-zinc-300);
}
}

@media (hover:hover) {
.settings-appearance-panel__button-light--muted:hover {
  color: var(--ui-zinc-300);
}
}

@media (min-width:40rem) {
.settings-appearance-panel__button-dark {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.settings-appearance-panel__button-light {
  min-height: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.settings-appearance-panel__group-theme {
  display: inline-flex;
}
.settings-appearance-panel__button-dark {
  min-height: calc(var(--spacing) * 11);
}
.settings-appearance-panel__button-light {
  min-height: calc(var(--spacing) * 11);
}
.settings-appearance-panel__button-dark {
  min-width: calc(var(--spacing) * 14);
}
.settings-appearance-panel__button-light {
  min-width: calc(var(--spacing) * 14);
}
.settings-appearance-panel__button-dark {
  cursor: pointer;
}
.settings-appearance-panel__button-light {
  cursor: pointer;
}
.settings-appearance-panel__group-theme {
  gap: calc(var(--spacing) * .5);
}
.settings-appearance-panel__group-theme {
  border-radius: var(--radius-lg);
}
.settings-appearance-panel__button-dark {
  border-radius: var(--radius-md);
}
.settings-appearance-panel__button-light {
  border-radius: var(--radius-md);
}
.settings-appearance-panel__group-theme {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-appearance-panel__group-theme {
  border-color: var(--ui-zinc-800);
}
.settings-appearance-panel__button-dark--selected {
  background-color: var(--ui-zinc-800);
}
.settings-appearance-panel__button-light--selected {
  background-color: var(--ui-zinc-800);
}
.settings-appearance-panel__group-theme {
  background-color: var(--ui-zinc-900);
}
.settings-appearance-panel__group-theme {
  padding: calc(var(--spacing) * .5);
}
.settings-appearance-panel__button-dark {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-appearance-panel__button-light {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-appearance-panel__button-dark {
  font-size: 11px;
}
.settings-appearance-panel__button-light {
  font-size: 11px;
}
.settings-appearance-panel__button-dark {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-appearance-panel__button-light {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-appearance-panel__button-dark--selected {
  color: var(--ui-zinc-100);
}
.settings-appearance-panel__button-light--selected {
  color: var(--ui-zinc-100);
}
.settings-appearance-panel__button-dark--muted {
  color: var(--ui-zinc-500);
}
.settings-appearance-panel__button-light--muted {
  color: var(--ui-zinc-500);
}
.settings-appearance-panel__button-dark {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-appearance-panel__button-light {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-appearance-panel__button-dark {
  --duration: .2s;
  transition-duration: .2s;
}
.settings-appearance-panel__button-light {
  --duration: .2s;
  transition-duration: .2s;
}
.settings-appearance-panel__button-dark:active {
  scale: .98;
}
.settings-appearance-panel__button-light:active {
  scale: .98;
}
[data-theme="light"] .settings-appearance-panel__button-dark--muted {
  color: var(--app-muted);
}
[data-theme="light"] .settings-appearance-panel__button-light--muted {
  color: var(--app-muted);
}
[data-theme="light"] .settings-appearance-panel__button-dark--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .settings-appearance-panel__button-light--muted:hover {
  color: var(--app-text) !important;
}
}
}
</style>
