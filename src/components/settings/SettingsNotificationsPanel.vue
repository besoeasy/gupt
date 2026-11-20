<script setup>
import { RouterLink } from "vue-router";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import { useSettingsStore } from "@/stores/settings";

const settings = useSettingsStore();
</script>

<template>
  <div>
    <SettingsRow title="Message sound" description="Play a sound for incoming messages.">
      <label class="settings-notifications-panel__label">
        <input
          v-model="settings.soundEnabled"
          type="checkbox"
          class="settings-notifications-panel__field-checkbox"
          aria-label="Message sound"
        />
        <span
          class="settings-notifications-panel__text"
        >
          <span
            class="settings-notifications-panel__text-2"
            :class="settings.soundEnabled ? 'settings-notifications-panel__text--on' : 'settings-notifications-panel__text--off'"
          />
        </span>
      </label>
    </SettingsRow>

    <SettingsRow
      title="Push notifications"
      description="Delivered through ntfy when the app is closed."
    >
      <RouterLink
        to="/notifications"
        class="settings-notifications-panel__router-link-set-up"
      >
        Set up
      </RouterLink>
    </SettingsRow>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {


@media (hover:hover) {
.settings-notifications-panel__router-link-set-up:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-notifications-panel__router-link-set-up:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.settings-notifications-panel__router-link-set-up:hover {
  color: var(--color-white);
}
}

@media (min-width:40rem) {
.settings-notifications-panel__label {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.settings-notifications-panel__router-link-set-up {
  min-height: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.settings-notifications-panel__text-2 {
  pointer-events: none;
}
.settings-notifications-panel__field-checkbox {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.settings-notifications-panel__text {
  position: relative;
}
.settings-notifications-panel__label {
  display: flex;
}
.settings-notifications-panel__text-2 {
  display: inline-block;
}
.settings-notifications-panel__text {
  display: inline-flex;
}
.settings-notifications-panel__router-link-set-up {
  display: inline-flex;
}
.settings-notifications-panel__text-2 {
  height: calc(var(--spacing) * 4);
}
.settings-notifications-panel__text {
  height: calc(var(--spacing) * 5);
}
.settings-notifications-panel__label {
  min-height: calc(var(--spacing) * 11);
}
.settings-notifications-panel__router-link-set-up {
  min-height: calc(var(--spacing) * 11);
}
.settings-notifications-panel__text-2 {
  width: calc(var(--spacing) * 4);
}
.settings-notifications-panel__text {
  width: calc(var(--spacing) * 9);
}
.settings-notifications-panel__text {
  flex-shrink: 0;
}
.settings-notifications-panel__text--off {
  --translate-x: 0;
  translate: 0 var(--translate-y,0);
}
.settings-notifications-panel__text--on {
  --translate-x: calc(var(--spacing) * 4);
  translate: calc(var(--spacing) * 4) var(--translate-y,0);
}
.settings-notifications-panel__text-2 {
  transform: var(--rotate-x,) var(--rotate-y,) var(--rotate-z,) var(--skew-x,) var(--skew-y,);
}
.settings-notifications-panel__label {
  cursor: pointer;
}
.settings-notifications-panel__label {
  align-items: center;
}
.settings-notifications-panel__router-link-set-up {
  align-items: center;
}
.settings-notifications-panel__text {
  border-radius: 3.40282e38px;
}
.settings-notifications-panel__text-2 {
  border-radius: 3.40282e38px;
}
.settings-notifications-panel__router-link-set-up {
  border-radius: var(--radius-lg);
}
.settings-notifications-panel__router-link-set-up {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-notifications-panel__text {
  border-style: var(--border-style,solid);
  border-width: 2px;
}
.settings-notifications-panel__text {
  border-color: #0000;
}
.settings-notifications-panel__router-link-set-up {
  border-color: var(--ui-zinc-800);
}
.settings-notifications-panel__text-2 {
  background-color: var(--color-white);
}
.settings-notifications-panel__text {
  background-color: var(--ui-zinc-700);
}
.settings-notifications-panel__router-link-set-up {
  background-color: var(--ui-zinc-900);
}
.settings-notifications-panel__router-link-set-up {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-notifications-panel__router-link-set-up {
  font-size: 11px;
}
.settings-notifications-panel__router-link-set-up {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-notifications-panel__router-link-set-up {
  color: var(--ui-zinc-300);
}
.settings-notifications-panel__text-2 {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.settings-notifications-panel__text-2 {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(0px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(0px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.settings-notifications-panel__text-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-notifications-panel__text {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-notifications-panel__router-link-set-up {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-notifications-panel__text {
  --duration: .2s;
  transition-duration: .2s;
}
.settings-notifications-panel__text-2 {
  --duration: .2s;
  transition-duration: .2s;
}
.settings-notifications-panel__text {
  --ease: var(--ease-in-out);
  transition-timing-function: var(--ease-in-out);
}
.settings-notifications-panel__text-2 {
  --ease: var(--ease-in-out);
  transition-timing-function: var(--ease-in-out);
}
.settings-notifications-panel__text:is(:where(.settings-notifications-panel__field-checkbox):checked~*) {
  background-color: var(--app-success);
}
.settings-notifications-panel__text:is(:where(.settings-notifications-panel__field-checkbox):focus-visible~*) {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.settings-notifications-panel__text:is(:where(.settings-notifications-panel__field-checkbox):focus-visible~*) {
  --ring-color: var(--app-primary);
}
.settings-notifications-panel__text:is(:where(.settings-notifications-panel__field-checkbox):focus-visible~*) {
  --ring-offset-width: 2px;
  --ring-offset-shadow: var(--ring-inset,) 0 0 0 2px var(--ring-offset-color,#fff);
}
.settings-notifications-panel__text:is(:where(.settings-notifications-panel__field-checkbox):focus-visible~*) {
  --ring-offset-color: var(--ui-black);
}
.settings-notifications-panel__text:is(:where(.settings-notifications-panel__field-checkbox):focus-visible~*) {
  --outline-style: none;
  outline-style: none;
}
.settings-notifications-panel__router-link-set-up:active {
  scale: .98;
}
[data-theme="light"] .settings-notifications-panel__router-link-set-up {
  color: var(--app-text-soft);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.settings-notifications-panel__router-link-set-up {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}
}
</style>
