<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { ExternalLink, Settings } from "@lucide/vue";

import SettingsAccountPanel from "@/components/settings/SettingsAccountPanel.vue";
import SettingsAppearancePanel from "@/components/settings/SettingsAppearancePanel.vue";
import SettingsNotificationsPanel from "@/components/settings/SettingsNotificationsPanel.vue";
import SettingsPrivacyPanel from "@/components/settings/SettingsPrivacyPanel.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import SettingsStatusStrip from "@/components/settings/SettingsStatusStrip.vue";
import SettingsSyncPanel from "@/components/settings/SettingsSyncPanel.vue";
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";
import RelaySuggestionsPanel from "@/components/settings/RelaySuggestionsPanel.vue";

import { useRelaySummary } from "@/composables/useRelaySummary";
import { shortId } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";

const SECTIONS = [
  { id: "relays", label: "Relays" },
  { id: "sync", label: "Sync" },
  { id: "notifications", label: "Notifications" },
  { id: "appearance", label: "Appearance" },
  { id: "privacy", label: "Privacy & data" },
  { id: "account", label: "Account" },
  { id: "about", label: "About" },
];

const HIGHLIGHT_MS = 2200;

const route = useRoute();
const identity = useIdentityStore();
const { relayCount, unhealthyCount, suggestionCount, loaded } = useRelaySummary();
const relaysSection = ref(null);
const highlightId = ref("");
let highlightTimer = null;

const relaySummary = computed(() => {
  const parts = [`${relayCount.value} configured`];
  if (loaded.value) {
    if (unhealthyCount.value > 0) {
      parts.push(`${unhealthyCount.value} failing`);
    }
    if (suggestionCount.value > 0) {
      parts.push(
        `${suggestionCount.value} ${suggestionCount.value === 1 ? "suggestion" : "suggestions"}`,
      );
    } else {
      parts.push("no suggestions");
    }
  }
  return parts.join(" · ");
});

const version = __APP_VERSION__;
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
              · changes save instantly
            </p>
          </div>
        </div>
      </header>

      <SettingsStatusStrip class="settings-view__settings-status-strip" @navigate="focusSection" />

      <div class="settings-view__block-5">
        <SettingsSection
          id="relays"
          ref="relaysSection"
          title="Relays"
          description="Every configured relay is used for reads and writes."
          collapsible
          :summary="relaySummary"
          :class="highlightClass('relays')"
        >
          <CustomRelaysPanel />
          <RelaySuggestionsPanel />
        </SettingsSection>

        <SettingsSection
          id="sync"
          title="Sync"
          description="Replication to your relays, and what they still hold."
          :class="highlightClass('sync')"
        >
          <SettingsSyncPanel />
        </SettingsSection>

        <SettingsSection
          id="notifications"
          title="Notifications"
          description="Alerts on this device and through ntfy."
          :class="highlightClass('notifications')"
        >
          <SettingsNotificationsPanel />
        </SettingsSection>

        <SettingsSection
          id="appearance"
          title="Appearance"
          description="How Gupt looks on this device."
          :class="highlightClass('appearance')"
        >
          <SettingsAppearancePanel />
        </SettingsSection>

        <SettingsSection
          id="privacy"
          title="Privacy & data"
          description="Cached data is disposable; relays keep the originals."
          :class="highlightClass('privacy')"
        >
          <SettingsPrivacyPanel />
        </SettingsSection>

        <SettingsSection
          id="account"
          title="Account"
          description="Your identity, devices, and backups."
          :class="highlightClass('account')"
        >
          <SettingsAccountPanel />
        </SettingsSection>

        <SettingsSection
          id="about"
          title="About"
          description="Gupt is local-first: your relays hold the truth."
          :class="highlightClass('about')"
        >
          <SettingsRow title="Version" :description="`Build ${buildDate}`">
            <span class="settings-view__text-v">v{{ version }}</span>
          </SettingsRow>
          <SettingsRow title="Source & support" description="Issues, releases, and donations.">
            <a
              href="https://github.com/besoeasy/gupt"
              target="_blank"
              rel="noopener noreferrer"
              class="settings-view__link-github"
            >
              GitHub
              <ExternalLink class="settings-view__external-link" :stroke-width="2" aria-hidden="true" />
            </a>
            <RouterLink
              to="/donate"
              class="settings-view__router-link-donate"
            >
              Donate
            </RouterLink>
          </SettingsRow>
        </SettingsSection>
      </div>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {










@media (hover:hover) {
.settings-view__link-github:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-view__router-link-donate:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.settings-view__link-github:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.settings-view__router-link-donate:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.settings-view__link-github:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.settings-view__router-link-donate:hover {
  color: var(--color-white);
}
}

@media (min-width:40rem) {
.settings-view__link-github {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.settings-view__router-link-donate {
  min-height: calc(var(--spacing) * 8);
}
}

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
.settings-view__settings-status-strip {
  margin-bottom: calc(var(--spacing) * 6);
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
.settings-view__link-github {
  display: inline-flex;
}
.settings-view__router-link-donate {
  display: inline-flex;
}
.settings-view__external-link {
  height: calc(var(--spacing) * 3);
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
.settings-view__link-github {
  min-height: calc(var(--spacing) * 11);
}
.settings-view__router-link-donate {
  min-height: calc(var(--spacing) * 11);
}
.settings-view__external-link {
  width: calc(var(--spacing) * 3);
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
.settings-view__link-github {
  align-items: center;
}
.settings-view__router-link-donate {
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
.settings-view__link-github {
  gap: var(--spacing);
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
.settings-view__link-github {
  border-radius: var(--radius-lg);
}
.settings-view__router-link-donate {
  border-radius: var(--radius-lg);
}
.settings-view__block-3 {
  border-radius: var(--radius-xl);
}
.settings-view__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-view__link-github {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-view__router-link-donate {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.settings-view__link-github {
  border-color: var(--ui-zinc-800);
}
.settings-view__router-link-donate {
  border-color: var(--ui-zinc-800);
}
.settings-view__block-3 {
  border-color: var(--ui-zinc-800);
}
.settings-view__block {
  background-color: var(--ui-black);
}
.settings-view__link-github {
  background-color: var(--ui-zinc-900);
}
.settings-view__router-link-donate {
  background-color: var(--ui-zinc-900);
}
.settings-view__block-3 {
  background-color: var(--ui-zinc-950);
}
.settings-view__link-github {
  padding-inline: calc(var(--spacing) * 3);
}
.settings-view__router-link-donate {
  padding-inline: calc(var(--spacing) * 3);
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
.settings-view__text-v {
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
.settings-view__text-v {
  font-size: 11px;
}
.settings-view__link-github {
  font-size: 11px;
}
.settings-view__router-link-donate {
  font-size: 11px;
}
.settings-view__text {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.settings-view__link-github {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.settings-view__router-link-donate {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
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
.settings-view__block {
  color: var(--ui-zinc-100);
}
.settings-view__link-github {
  color: var(--ui-zinc-300);
}
.settings-view__router-link-donate {
  color: var(--ui-zinc-300);
}
.settings-view__text-2 {
  color: var(--ui-zinc-400);
}
.settings-view__text-v {
  color: var(--ui-zinc-400);
}
.settings-view__block-3 {
  color: var(--ui-zinc-500);
}
.settings-view__text {
  color: var(--ui-zinc-500);
}
.settings-view__text-v {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
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
.settings-view__link-github {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-view__router-link-donate {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.settings-view__link-github:active {
  scale: .98;
}
.settings-view__router-link-donate:active {
  scale: .98;
}
[data-theme="light"] .settings-view__link-github {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-view__router-link-donate {
  color: var(--app-text-soft);
}
[data-theme="light"] .settings-view__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .settings-view__text-v {
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
.settings-view__block-3 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-view__link-github {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-view__router-link-donate {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-view__block-3 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.settings-view__variant-1 {
  --ring-color: color-mix(in oklab, var(--color-amber-400) 40%, transparent);
}
}
}
</style>
