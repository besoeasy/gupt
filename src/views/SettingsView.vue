<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import SettingsAccountPanel from "@/components/settings/SettingsAccountPanel.vue";
import SettingsAppPanel from "@/components/settings/SettingsAppPanel.vue";
import SettingsCachePanel from "@/components/settings/SettingsCachePanel.vue";
import SettingsSyncPanel from "@/components/settings/SettingsSyncPanel.vue";
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";
import RelaySuggestionsPanel from "@/components/settings/RelaySuggestionsPanel.vue";

import { useRelaySummary } from "@/composables/useRelaySummary";
import { shortId } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";

const TABS = [
  { id: "relays", label: "Relays" },
  { id: "sync", label: "Sync" },
  { id: "data", label: "Data" },
  { id: "account", label: "Account" },
];

/** Old section deep links land on the tab that absorbed them. */
const LEGACY_FOCUS = {
  relays: "relays",
  analytics: "relays",
  sync: "sync",
  "app-data": "data",
  account: "account",
};

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const { relayCount, unhealthyCount, loaded } = useRelaySummary();

const tablist = ref(null);
const pane = ref(null);
const activeTab = ref("relays");

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

const failingRelays = computed(() => (loaded.value ? unhealthyCount.value : 0));

const relayTabHint = computed(() => {
  const parts = [`${relayCount.value} configured`];
  if (failingRelays.value > 0) {
    parts.push(failingRelays.value === 1 ? "1 failing" : `${failingRelays.value} failing`);
  }
  return parts.join(" · ");
});

function readTab() {
  const direct = String(route.query.tab || "");
  if (TABS.some((entry) => entry.id === direct)) return direct;
  return LEGACY_FOCUS[String(route.query.focus || "")] || "relays";
}

watch(
  () => [route.query.tab, route.query.focus],
  () => {
    activeTab.value = readTab();
  },
  { immediate: true },
);

function tabButtons() {
  return [...(tablist.value?.querySelectorAll('[role="tab"]') || [])];
}

async function selectTab(id, { focusButton = false } = {}) {
  if (!TABS.some((entry) => entry.id === id)) return;
  const changed = activeTab.value !== id;
  activeTab.value = id;
  if (String(route.query.tab || "") !== id) {
    void router.replace({ path: "/settings", query: { tab: id } });
  }
  await nextTick();
  if (focusButton) {
    tabButtons()
      .find((button) => button.dataset.tab === id)
      ?.focus();
  }
  if (changed) pane.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function onTabKeydown(event, index) {
  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const next = (index + step + TABS.length) % TABS.length;
  void selectTab(TABS[next].id, { focusButton: true });
}
</script>

<template>
  <div class="settings-view">
    <main class="settings-view__main">
      <header class="settings-view__header">
        <p class="settings-view__eyebrow">Preferences</p>
        <h1 class="settings-view__title">Settings</h1>
        <p class="settings-view__subtitle">
          Signed in as <span class="settings-view__key">{{ identityLabel }}</span> · built
          {{ buildDate }}
        </p>
      </header>

      <div ref="tablist" class="settings-tabs" role="tablist" aria-label="Settings sections">
        <button
          v-for="(tab, index) in TABS"
          :id="`settings-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          class="settings-tabs__tab"
          :class="{ 'settings-tabs__tab--active': activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          :aria-controls="'settings-pane'"
          :tabindex="activeTab === tab.id ? 0 : -1"
          :data-tab="tab.id"
          @click="selectTab(tab.id)"
          @keydown="onTabKeydown($event, index)"
        >
          {{ tab.label }}
          <span
            v-if="tab.id === 'relays' && failingRelays > 0"
            class="settings-tabs__dot"
            :title="`${relayTabHint}`"
            aria-hidden="true"
          />
          <span
            v-if="tab.id === 'relays' && failingRelays > 0"
            class="settings-tabs__sr"
          >
            {{ relayTabHint }}
          </span>
        </button>
      </div>

      <div
        id="settings-pane"
        ref="pane"
        class="settings-pane"
        role="tabpanel"
        :aria-labelledby="`settings-tab-${activeTab}`"
        tabindex="0"
      >
        <div :key="activeTab" class="settings-pane__body">
          <template v-if="activeTab === 'relays'">
            <header class="settings-pane__head">
              <h2 class="settings-pane__title">Relays</h2>
              <p class="settings-pane__desc">
                Sends and reads go out to these nodes. Two working relays keep your messages
                reachable.
              </p>
            </header>
            <CustomRelaysPanel />
            <RelaySuggestionsPanel />
          </template>

          <template v-else-if="activeTab === 'sync'">
            <header class="settings-pane__head">
              <h2 class="settings-pane__title">Sync</h2>
              <p class="settings-pane__desc">
                How this device keeps its copy of your events close to the relays'.
              </p>
            </header>
            <SettingsSyncPanel />
          </template>

          <template v-else-if="activeTab === 'data'">
            <header class="settings-pane__head">
              <h2 class="settings-pane__title">Data</h2>
              <p class="settings-pane__desc">
                Appearance, notifications, and what this device keeps cached.
              </p>
            </header>
            <SettingsAppPanel />
            <SettingsCachePanel />
          </template>

          <template v-else>
            <header class="settings-pane__head">
              <h2 class="settings-pane__title">Account</h2>
              <p class="settings-pane__desc">
                Your identity lives on this device. There is no server account to recover.
              </p>
            </header>
            <SettingsAccountPanel />
          </template>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

.settings-view {
  min-height: 100%;
  animation: ledger-fade var(--app-dur-base) var(--app-ease-standard) both;
}

.settings-view__main {
  width: 100%;
  max-width: 56rem;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4) var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

.settings-view__header {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}

.settings-view__eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  animation: ledger-rise 480ms var(--app-ease-emphasized) 40ms backwards;
}

.settings-view__title {
  margin: 0;
  font-size: var(--app-text-display);
  line-height: 1.05;
  font-weight: 600;
  letter-spacing: var(--app-tracking-display);
  color: var(--app-text);
  animation: ledger-rise 520ms var(--app-ease-emphasized) 90ms backwards;
}

.settings-view__subtitle {
  margin: 0;
  max-width: 60ch;
  font-size: var(--app-text-body);
  line-height: var(--app-leading-body);
  color: var(--app-text-soft);
  animation: ledger-rise 520ms var(--app-ease-emphasized) 150ms backwards;
}

.settings-view__key {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--app-text);
}

.settings-tabs {
  display: flex;
  align-items: stretch;
  gap: var(--app-space-5);
  padding: 0;
  overflow-x: auto;
  scrollbar-width: none;
  border: 0;
  border-bottom: 1px solid var(--app-border);
  border-radius: 0;
  background-color: transparent;
  animation: ledger-fade 520ms var(--app-ease-standard) 200ms backwards;
}

.settings-tabs::-webkit-scrollbar {
  display: none;
}

.settings-tabs__tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--app-touch-h);
  flex-shrink: 0;
  padding: 0 2px;
  border: 0;
  border-radius: 0;
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

/* The active tab is a rule that draws from the centre, never a box. */

.settings-tabs__tab::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background-color: var(--app-text);
  transform: scaleX(0);
  transform-origin: center;
  transition: transform var(--app-dur-slow) var(--app-ease-emphasized);
}

.settings-tabs__tab--active {
  color: var(--app-text);
}

.settings-tabs__tab--active::after {
  transform: scaleX(1);
}

.settings-tabs__tab:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: -4px;
  border-radius: 4px;
}

.settings-tabs__dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background-color: var(--app-warning);
  color: var(--app-warning);
  flex-shrink: 0;
  animation: ledger-dot-pulse 2.4s var(--app-ease-standard) infinite;
}

.settings-tabs__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.settings-pane {
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background-color: transparent;
}

.settings-pane:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 8px;
  border-radius: var(--app-radius-md);
}

.settings-pane__body {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  min-width: 0;
  animation: ledger-fade var(--app-dur-base) var(--app-ease-standard) both;
}

/* Each block settles in turn, so switching a tab feels like a page arriving
   rather than a swap. */

.settings-pane__body > * {
  animation: ledger-rise 460ms var(--app-ease-emphasized) backwards;
}

.settings-pane__body > *:nth-child(1) {
  animation-delay: 40ms;
}

.settings-pane__body > *:nth-child(2) {
  animation-delay: 90ms;
}

.settings-pane__body > *:nth-child(3) {
  animation-delay: 140ms;
}

.settings-pane__body > *:nth-child(4) {
  animation-delay: 190ms;
}

.settings-pane__head {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
  padding-bottom: var(--app-space-5);
  border-bottom: 1px solid var(--app-border);
}

.settings-pane__title {
  margin: 0;
  font-size: var(--app-text-title);
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--app-text);
}

.settings-pane__desc {
  margin: 0;
  max-width: 52ch;
  font-size: var(--app-text-body);
  line-height: var(--app-leading-body);
  color: var(--app-muted);
}

@media (hover: hover) {
  .settings-tabs__tab:not(.settings-tabs__tab--active):hover {
    color: var(--app-text);
  }
}

@media (min-width: 40rem) {
  .settings-view__main {
    padding-inline: var(--app-space-6);
  }
}

@media (max-width: 26rem) {
  .settings-view__main {
    padding: var(--app-space-6) var(--app-space-4) var(--app-space-7);
  }

  .settings-tabs {
    gap: var(--app-space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-view,
  .settings-view__eyebrow,
  .settings-view__title,
  .settings-view__subtitle,
  .settings-tabs,
  .settings-tabs__dot,
  .settings-pane__body,
  .settings-pane__body > * {
    animation: none;
  }
}
</style>
