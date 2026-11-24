<script setup>
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import { RETENTION_DAYS } from "@/config/retention";
import { formatBytes } from "@/lib/chatUtils";
import { clearMediaCache, getCacheSummary } from "@/lib/idb";
import { useSettingsStore } from "@/stores/settings";
import { useThemeStore } from "@/stores/theme";

const RETAINED_TABLES = new Set(["mediaCache", "engineBlobs"]);

const settings = useSettingsStore();
const theme = useThemeStore();

const cacheBytes = ref(0);
const cacheEntries = ref(0);
const loading = ref(true);
const clearing = ref(false);
const confirmOpen = ref(false);
const message = ref("");

const cacheLabel = computed(() => (loading.value ? "…" : formatBytes(cacheBytes.value)));
const cacheSub = computed(() => {
  if (loading.value) return "Reading cache size.";
  if (!cacheEntries.value) return "Nothing cached yet.";
  return `${cacheEntries.value.toLocaleString()} cached files · safe to clear`;
});

function selectTheme(mode) {
  const wantsDark = mode === "dark";
  if (theme.isDark !== wantsDark) theme.toggle();
}

async function load() {
  try {
    const summary = await getCacheSummary();
    const stores = (summary?.stores || []).filter((store) => RETAINED_TABLES.has(store.table));
    cacheBytes.value = stores.reduce((sum, store) => sum + Number(store.estimatedBytes || 0), 0);
    cacheEntries.value = stores.reduce((sum, store) => sum + Number(store.entries || 0), 0);
  } catch {
    cacheBytes.value = 0;
    cacheEntries.value = 0;
  } finally {
    loading.value = false;
  }
}

async function handleClear() {
  confirmOpen.value = false;
  clearing.value = true;
  message.value = "";
  try {
    await clearMediaCache();
    await load();
    message.value = "Cached media cleared. Relays still hold your messages.";
  } catch {
    message.value = "Could not clear the cache. Try again.";
  } finally {
    clearing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="app-panel">
    <SettingsRow title="Theme" description="Applies everywhere, immediately.">
      <div class="app-panel__segment" role="group" aria-label="Theme">
        <button
          type="button"
          class="app-panel__segment-option"
          :aria-pressed="theme.isDark"
          @click="selectTheme('dark')"
        >
          Dark
        </button>
        <button
          type="button"
          class="app-panel__segment-option"
          :aria-pressed="!theme.isDark"
          @click="selectTheme('light')"
        >
          Light
        </button>
      </div>
    </SettingsRow>

    <SettingsRow title="Message sound" description="Play a sound for incoming messages.">
      <label class="app-panel__switch">
        <input
          v-model="settings.soundEnabled"
          type="checkbox"
          class="app-panel__switch-input"
          aria-label="Message sound"
        />
        <span class="app-panel__switch-track" aria-hidden="true">
          <span class="app-panel__switch-thumb" />
        </span>
      </label>
    </SettingsRow>

    <SettingsRow
      title="Push notifications"
      description="Delivered through ntfy while the app is closed."
    >
      <RouterLink to="/notifications" class="app-panel__link">Set up</RouterLink>
    </SettingsRow>

    <SettingsRow title="Cached media" :description="cacheSub">
      <span class="app-panel__cache">{{ cacheLabel }}</span>
      <button
        type="button"
        class="app-panel__clear"
        :disabled="clearing || loading || !cacheEntries"
        @click="confirmOpen = true"
      >
        {{ clearing ? "Clearing…" : "Clear" }}
      </button>
    </SettingsRow>

    <p class="app-panel__note">
      Relays keep your events for {{ RETENTION_DAYS }} days; this device only mirrors them, so
      clearing media never deletes a message.
    </p>

    <p v-if="message" class="app-panel__status" role="status">{{ message }}</p>

    <AppConfirmDialog
      :open="confirmOpen"
      title="Clear cached media?"
      message="Downloaded images and file blobs are removed from this device. Messages, rooms, and relays stay as they are, and media downloads again when you open it."
      confirm-label="Clear media"
      @confirm="handleClear"
      @cancel="confirmOpen = false"
    />
  </div>
</template>

<style scoped>

.app-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-panel__segment {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background-color: var(--app-surface-soft);
}

.app-panel__segment-option {
  min-height: 36px;
  padding-inline: var(--app-space-3);
  border: 1px solid transparent;
  border-radius: calc(var(--app-radius-sm) - 2px);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

/* On is inverted, not tinted: the choice reads at a glance in both themes. */

.app-panel__segment-option[aria-pressed="true"] {
  border-color: var(--app-text);
  background-color: var(--app-text);
  color: var(--app-bg);
  font-weight: 500;
}

.app-panel__segment-option:focus-visible,
.app-panel__link:focus-visible,
.app-panel__clear:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}

.app-panel__switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: var(--app-touch-h);
  cursor: pointer;
}

.app-panel__switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  border: 0;
}

.app-panel__switch-track {
  display: inline-flex;
  align-items: center;
  width: 44px;
  height: 26px;
  padding: 3px;
  border: 1px solid var(--app-border-strong);
  border-radius: 999px;
  background-color: var(--app-surface-inset);
  transition:
    background-color var(--app-dur-base) var(--app-ease-standard),
    border-color var(--app-dur-base) var(--app-ease-standard);
}

.app-panel__switch-thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background-color: var(--app-muted);
  transition:
    transform var(--app-dur-base) var(--app-ease-spring),
    background-color var(--app-dur-base) var(--app-ease-standard),
    width var(--app-dur-fast) var(--app-ease-spring);
}

.app-panel__switch-input:checked + .app-panel__switch-track {
  border-color: var(--app-text);
  background-color: var(--app-text);
}

.app-panel__switch-input:checked + .app-panel__switch-track .app-panel__switch-thumb {
  transform: translateX(18px);
  background-color: var(--app-bg);
}

.app-panel__switch-input:focus-visible + .app-panel__switch-track {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}

.app-panel__switch:active .app-panel__switch-thumb {
  width: 22px;
}

.app-panel__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding-inline: var(--app-space-4);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-text);
  text-decoration: none;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-swift);
}

.app-panel__cache {
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--app-text);
}

.app-panel__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding-inline: var(--app-space-3);
  border: 1px solid color-mix(in oklab, var(--app-danger) 30%, transparent);
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-danger);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.app-panel__clear:disabled {
  opacity: 0.45;
  cursor: default;
}

.app-panel__note {
  margin: 0;
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
  font-size: var(--app-text-meta);
  line-height: var(--app-leading-body);
  color: var(--app-muted);
}

.app-panel__status {
  margin: var(--app-space-4) 0 0;
  padding: var(--app-space-3);
  border: 1px solid color-mix(in oklab, var(--app-success) 30%, transparent);
  border-radius: var(--app-radius-sm);
  background-color: var(--app-success-soft);
  font-size: var(--app-text-meta);
  color: var(--app-text);
  animation: ledger-rise 320ms var(--app-ease-emphasized) both;
}

@media (hover: hover) {
  .app-panel__segment-option[aria-pressed="false"]:hover {
    color: var(--app-text);
    background-color: var(--app-surface-soft);
  }

  .app-panel__link:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-soft);
    transform: translateX(2px);
  }

  .app-panel__clear:not(:disabled):hover {
    border-color: color-mix(in oklab, var(--app-danger) 48%, transparent);
    background-color: var(--app-danger-soft);
  }
}

@media (pointer: coarse) {
  .app-panel__segment-option,
  .app-panel__link,
  .app-panel__clear {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-panel__switch-thumb,
  .app-panel__switch-track,
  .app-panel__status {
    transition: none;
    animation: none;
  }
}
</style>
