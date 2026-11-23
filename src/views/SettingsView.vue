<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Settings as SettingsIcon } from "@/icons";

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
        <div class="settings-view__tile">
          <SettingsIcon :stroke-width="1.8" aria-hidden="true" />
        </div>
        <div class="settings-view__titles">
          <h1 class="settings-view__title">Settings</h1>
          <p class="settings-view__subtitle">
            Signed in as <span class="settings-view__key">{{ identityLabel }}</span> · built
            {{ buildDate }}
          </p>
        </div>
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
  animation: settings-view-in var(--app-dur-base) var(--app-ease-out) both;
}

.settings-view__main {
  width: 100%;
  max-width: 56rem;
  margin-inline: auto;
  padding: calc(var(--spacing) * 6) calc(var(--spacing) * 4) calc(var(--spacing) * 12);
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 5);
}

.settings-view__header {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
}

.settings-view__tile {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background-color: var(--app-surface);
  color: var(--app-text-soft);
}

.settings-view__tile svg {
  width: 18px;
  height: 18px;
}

.settings-view__titles {
  min-width: 0;
}

.settings-view__title {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 650;
  letter-spacing: -0.015em;
  color: var(--app-text);
}

.settings-view__subtitle {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--app-text-soft);
}

.settings-view__key {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
}

.settings-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background-color: var(--app-bg-soft);
}

.settings-tabs__tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding-inline: calc(var(--spacing) * 2);
  border: 1px solid transparent;
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--app-text-soft);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.settings-tabs__tab--active {
  border-color: var(--app-border);
  background-color: var(--app-surface);
  color: var(--app-text);
  font-weight: 600;
}

.settings-tabs__tab:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

.settings-tabs__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background-color: var(--app-warning);
  flex-shrink: 0;
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
  padding: calc(var(--spacing) * 5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background-color: var(--app-bg-soft);
  min-width: 0;
}

.settings-pane:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

.settings-pane__body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
  min-width: 0;
  animation: settings-pane-in var(--app-dur-base) var(--app-ease-out) both;
}

.settings-pane__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-pane__title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--app-text);
}

.settings-pane__desc {
  margin: 0;
  max-width: 60ch;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--app-text-soft);
}

@media (hover: hover) {
  .settings-tabs__tab:not(.settings-tabs__tab--active):hover {
    color: var(--app-text);
    background-color: var(--app-surface-tint-soft);
  }
}

@media (min-width: 40rem) {
  .settings-view__main {
    padding-inline: calc(var(--spacing) * 6);
  }

  .settings-pane {
    padding: calc(var(--spacing) * 6);
  }
}

@media (max-width: 26rem) {
  .settings-view__main {
    padding-inline: calc(var(--spacing) * 3);
  }

  .settings-tabs__tab {
    font-size: 10.5px;
    letter-spacing: 0.02em;
  }

  .settings-pane {
    padding: calc(var(--spacing) * 3.5);
  }
}

@keyframes settings-pane-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes settings-view-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-view,
  .settings-pane__body {
    animation: none;
  }
}
</style>
