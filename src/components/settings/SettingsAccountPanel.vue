<script setup>
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Check, Copy } from "@/icons";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { shortId } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();
const copied = ref(false);

const identityLabel = computed(() =>
  identity.pubkeyHex ? shortId(identity.pubkeyHex, 10, 6) : "no account",
);

async function copyIdentity() {
  if (!identity.pubkeyHex) return;
  await copyToClipboard(identity.pubkeyHex);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <div>
    <SettingsRow
      title="Your identity"
      description="Your public key. Contacts verify it, not a server."
    >
      <code class="settings-account-panel__code">{{ identityLabel }}</code>
      <button
        type="button"
        class="settings-account-panel__button"
        :aria-label="copied ? 'Identity copied' : 'Copy identity'"
        :title="copied ? 'Copied' : 'Copy public key'"
        @click="copyIdentity"
      >
        <Check v-if="copied" class="settings-account-panel__check" :stroke-width="2" />
        <Copy v-else class="settings-account-panel__copy" :stroke-width="2" />
      </button>
    </SettingsRow>

    <SettingsRow
      title="Profile & devices"
      description="Name, about, linked devices, and signing out."
    >
      <RouterLink
        to="/me"
        class="settings-account-panel__router-link-manage"
      >
        Manage
      </RouterLink>
    </SettingsRow>

    <SettingsRow
      title="Backup node"
      description="Keep a verified copy of your events on a machine you own."
    >
      <RouterLink
        to="/integrations/backup"
        class="settings-account-panel__router-link-set-up"
      >
        Set up
      </RouterLink>
    </SettingsRow>

    <SettingsRow
      title="Integrations"
      description="Bookmarklet, notifications and local backup tools."
    >
      <RouterLink
        to="/integrations"
        class="settings-account-panel__router-link-open"
      >
        Open
      </RouterLink>
    </SettingsRow>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.settings-account-panel__router-link-manage:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-account-panel__router-link-set-up:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-account-panel__router-link-open:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-account-panel__button:hover {
  background-color: #ffffff0d;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.settings-account-panel__button:hover {
  background-color: color-mix(in oklab,var(--color-white) 5%,transparent);
}
}
}

@media (hover:hover) {
.settings-account-panel__router-link-manage:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.settings-account-panel__router-link-set-up:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.settings-account-panel__router-link-open:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.settings-account-panel__router-link-manage:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.settings-account-panel__router-link-set-up:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.settings-account-panel__router-link-open:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.settings-account-panel__button:hover {
  color: var(--ui-zinc-200);
}
}

@media (min-width:40rem) {
.settings-account-panel__button {
  height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.settings-account-panel__router-link-manage {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.settings-account-panel__router-link-set-up {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.settings-account-panel__router-link-open {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.settings-account-panel__button {
  width: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.settings-account-panel__button {
  display: inline-flex;
}
.settings-account-panel__router-link-manage {
  display: inline-flex;
}
.settings-account-panel__router-link-set-up {
  display: inline-flex;
}
.settings-account-panel__router-link-open {
  display: inline-flex;
}
.settings-account-panel__check {
  height: calc(var(--spacing) * 3.5);
}
.settings-account-panel__copy {
  height: calc(var(--spacing) * 3.5);
}
.settings-account-panel__button {
  height: calc(var(--spacing) * 11);
}
.settings-account-panel__router-link-manage {
  min-height: calc(var(--spacing) * 11);
}
.settings-account-panel__router-link-set-up {
  min-height: calc(var(--spacing) * 11);
}
.settings-account-panel__router-link-open {
  min-height: calc(var(--spacing) * 11);
}
.settings-account-panel__check {
  width: calc(var(--spacing) * 3.5);
}
.settings-account-panel__copy {
  width: calc(var(--spacing) * 3.5);
}
.settings-account-panel__button {
  width: calc(var(--spacing) * 11);
}
.settings-account-panel__button {
  cursor: pointer;
}
.settings-account-panel__button {
  align-items: center;
}
.settings-account-panel__router-link-manage {
  align-items: center;
}
.settings-account-panel__router-link-set-up {
  align-items: center;
}
.settings-account-panel__router-link-open {
  align-items: center;
}
.settings-account-panel__button {
  justify-content: center;
}
.settings-account-panel__button {
  border-radius: var(--radius-lg);
}
.settings-account-panel__router-link-manage {
  border-radius: var(--radius-lg);
}
.settings-account-panel__router-link-set-up {
  border-radius: var(--radius-lg);
}
.settings-account-panel__router-link-open {
  border-radius: var(--radius-lg);
}
.settings-account-panel__router-link-manage {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-account-panel__router-link-set-up {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-account-panel__router-link-open {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-account-panel__router-link-manage {
  border-color: var(--ui-zinc-800);
}
.settings-account-panel__router-link-set-up {
  border-color: var(--ui-zinc-800);
}
.settings-account-panel__router-link-open {
  border-color: var(--ui-zinc-800);
}
.settings-account-panel__router-link-manage {
  background-color: var(--app-surface-tint);
}
.settings-account-panel__router-link-set-up {
  background-color: var(--app-surface-tint);
}
.settings-account-panel__router-link-open {
  background-color: var(--app-surface-tint);
}
.settings-account-panel__router-link-manage {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-account-panel__router-link-set-up {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-account-panel__router-link-open {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-account-panel__code {
  font-family: var(--font-mono);
}
.settings-account-panel__code {
  font-size: 11px;
}
.settings-account-panel__router-link-manage {
  font-size: 11px;
}
.settings-account-panel__router-link-set-up {
  font-size: 11px;
}
.settings-account-panel__router-link-open {
  font-size: 11px;
}
.settings-account-panel__router-link-manage {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-account-panel__router-link-set-up {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-account-panel__router-link-open {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-account-panel__check {
  color: var(--color-emerald-400);
}
.settings-account-panel__router-link-manage {
  color: var(--ui-zinc-300);
}
.settings-account-panel__router-link-set-up {
  color: var(--ui-zinc-300);
}
.settings-account-panel__router-link-open {
  color: var(--ui-zinc-300);
}
.settings-account-panel__code {
  color: var(--ui-zinc-400);
}
.settings-account-panel__button {
  color: var(--ui-zinc-500);
}
.settings-account-panel__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-account-panel__router-link-manage {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-account-panel__router-link-set-up {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-account-panel__router-link-open {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-account-panel__button:active {
  scale: .98;
}
.settings-account-panel__router-link-manage:active {
  scale: .98;
}
.settings-account-panel__router-link-set-up:active {
  scale: .98;
}
.settings-account-panel__router-link-open:active {
  scale: .98;
}
[data-theme="light"] .settings-account-panel__check {
  color: var(--app-success);
}
[data-theme="light"] .settings-account-panel__router-link-manage {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-account-panel__router-link-set-up {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-account-panel__router-link-open {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-account-panel__code {
  color: var(--app-muted);
}
[data-theme="light"] .settings-account-panel__button {
  color: var(--app-muted);
}
[data-theme="light"] .settings-account-panel__button:hover {
  background-color: var(--app-surface-hover) !important;
}
[data-theme="light"] .settings-account-panel__button:hover {
  color: var(--app-text) !important;
}
}
}
</style>
