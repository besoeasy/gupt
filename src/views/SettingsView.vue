<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Settings } from "@/icons";

import SettingsAccountPanel from "@/components/settings/SettingsAccountPanel.vue";
import SettingsAppPanel from "@/components/settings/SettingsAppPanel.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import SettingsCachePanel from "@/components/settings/SettingsCachePanel.vue";
import SettingsSyncPanel from "@/components/settings/SettingsSyncPanel.vue";
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";
import RelaySuggestionsPanel from "@/components/settings/RelaySuggestionsPanel.vue";

import { useRelaySummary } from "@/composables/useRelaySummary";
import { shortId } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";

const SECTIONS = [
  { id: "relays", label: "Relays" },
  { id: "sync", label: "Sync" },
  { id: "app-data", label: "App & data" },
  { id: "account", label: "Account" },
];

const HIGHLIGHT_MS = 2200;

const route = useRoute();
const identity = useIdentityStore();
const { relayCount, unhealthyCount, loaded } = useRelaySummary();
const relaysSection = ref(null);
const highlightId = ref("");
let highlightTimer = null;

const relaySummary = computed(() => {
  const parts = [`${relayCount.value} configured`];
  if (loaded.value && unhealthyCount.value > 0) {
    parts.push(`${unhealthyCount.value} failing`);
  }
  return parts.join(" · ");
});

const buildDate = new Date(__APP_BUILD_TIME__).toLocaleString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const identityLabel = computed(() =>
  identity.pubkeyHex ? shortId(identity.pubkeyHex, 8, 4) : "—",
);

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function focusSection(id) {
  if (id === "relays") relaysSection.value?.expand();
  await nextTick();
  scrollToSection(id);
}

async function applyFocus() {
  const target = String(route.query.focus || "");
  if (!SECTIONS.some((section) => section.id === target)) return;
  await focusSection(target);
  highlightId.value = target;
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightId.value = "";
    highlightTimer = null;
  }, HIGHLIGHT_MS);
}

/** Amber pulse on the section the user was sent to. */
function highlightClass(id) {
  return highlightId.value === id
    ? "settings-view__variant-1"
    : "";
}

onMounted(() => {
  void applyFocus();
});

watch(() => route.query.focus, applyFocus);

onUnmounted(() => {
  if (highlightTimer) clearTimeout(highlightTimer);
});
</script>

<template>
  <div class="settings-view__block">
    <main class="settings-view__main">
      <header class="settings-view__header">
        <div class="settings-view__block-2">
          <div
            class="settings-view__block-3"
          >
            <Settings class="settings-view__settings" :stroke-width="2" aria-hidden="true" />
          </div>
          <div class="settings-view__block-4">
            <h1 class="settings-view__title-settings">Settings</h1>
            <p class="settings-view__text">
              Signed in as
              <span class="settings-view__text-2">{{ identityLabel }}</span>
              · built {{ buildDate }}
            </p>
          </div>
        </div>
      </header>

      <div class="settings-view__block-5">
        <SettingsSection
          id="relays"
          ref="relaysSection"
          title="Relays"
          collapsible
          :summary="relaySummary"
          :class="highlightClass('relays')"
        >
          <CustomRelaysPanel />
          <RelaySuggestionsPanel />
          <SettingsCachePanel />
        </SettingsSection>

        <SettingsSection id="sync" title="Sync" :class="highlightClass('sync')">
          <SettingsSyncPanel />
        </SettingsSection>

        <SettingsSection id="app-data" title="App & data" :class="highlightClass('app-data')">
          <SettingsAppPanel />
        </SettingsSection>

        <SettingsSection id="account" title="Account" :class="highlightClass('account')">
          <SettingsAccountPanel />
        </SettingsSection>
      </div>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (min-width:40rem) {
.settings-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.settings-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.settings-view__main {
  margin-inline: auto;
}
.settings-view__text {
  margin-top: calc(var(--spacing) * .5);
}
.settings-view__header {
  display: flex;
}
.settings-view__block-2 {
  display: flex;
}
.settings-view__block-3 {
  display: flex;
}
.settings-view__settings {
  height: calc(var(--spacing) * 4);
}
.settings-view__block-3 {
  height: calc(var(--spacing) * 10);
}
.settings-view__block {
  height: 100%;
}
.settings-view__settings {
  width: calc(var(--spacing) * 4);
}
.settings-view__block-3 {
  width: calc(var(--spacing) * 10);
}
.settings-view__block {
  width: 100%;
}
.settings-view__main {
  width: 100%;
}
.settings-view__main {
  max-width: var(--container-5xl);
}
.settings-view__block {
  min-width: 0;
}
.settings-view__block-2 {
  min-width: 0;
}
.settings-view__block-4 {
  min-width: 0;
}
.settings-view__block-3 {
  flex-shrink: 0;
}
.settings-view__block-3 {
  align-items: center;
}
.settings-view__header {
  align-items: flex-start;
}
.settings-view__block-2 {
  align-items: flex-start;
}
.settings-view__header {
  justify-content: space-between;
}
.settings-view__block-3 {
  justify-content: center;
}
.settings-view__header {
  gap: calc(var(--spacing) * 3);
}
.settings-view__block-2 {
  gap: calc(var(--spacing) * 3);
}
:where(.settings-view__block-5>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.settings-view__title-settings {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.settings-view__text {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.settings-view__block {
  overflow-y: auto;
}
.settings-view__block-3 {
  border-radius: var(--radius-xl);
}
.settings-view__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-view__block-3 {
  border-color: var(--app-border-quiet);
}
.settings-view__block {
  background-color: var(--ui-black);
}
.settings-view__block-3 {
  background-color: var(--app-surface-inset);
}
.settings-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.settings-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.settings-view__header {
  padding-bottom: calc(var(--spacing) * 5);
}
.settings-view__block {
  padding-bottom: calc(var(--spacing) * 20);
}
.settings-view__text-2 {
  font-family: var(--font-mono);
}
.settings-view__title-settings {
  font-size: var(--text-lg);
  line-height: var(--leading,var(--text-lg--line-height));
}
.settings-view__text {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.settings-view__text {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.settings-view__title-settings {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.settings-view__title-settings {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.settings-view__title-settings {
  color: var(--color-white);
}
[data-theme="light"] .settings-view__title-settings {
  color: var(--app-text);
}
.settings-view__block {
  color: var(--ui-zinc-100);
}
.settings-view__text-2 {
  color: var(--ui-zinc-400);
}
.settings-view__block-3 {
  color: var(--ui-zinc-500);
}
.settings-view__text {
  color: var(--ui-zinc-500);
}
.settings-view__variant-1 {
  --shadow: 0 0 28px var(--shadow-color,#fbbf2424);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 0 28px var(--shadow-color,#fbbf2424);
}
.settings-view__variant-1 {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.settings-view__variant-1 {
  --ring-color: #fcbb0066;
}
[data-theme="light"] .settings-view__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .settings-view__block-3 {
  color: var(--app-muted);
}
[data-theme="light"] .settings-view__text {
  color: var(--app-muted);
}
}
}

@layer gupt-components {

@supports (color:color-mix(in lab,red,red)) {
.settings-view__variant-1 {
  --ring-color: color-mix(in oklab, var(--color-amber-400) 40%, transparent);
}
}
}
</style>
