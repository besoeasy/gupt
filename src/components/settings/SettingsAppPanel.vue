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
@layer base, gupt-components;

.app-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-panel__segment {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background-color: var(--app-surface-tint);
}

.app-panel__segment-option {
  min-height: 38px;
  padding-inline: calc(var(--spacing) * 3);
  border: 1px solid transparent;
  border-radius: calc(var(--app-radius-md) - 4px);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text-soft);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.app-panel__segment-option[aria-pressed="true"] {
  border-color: var(--app-border);
  background-color: var(--app-surface);
  color: var(--app-text);
  font-weight: 600;
}

.app-panel__segment-option:focus-visible,
.app-panel__link:focus-visible,
.app-panel__clear:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

.app-panel__switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
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
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.app-panel__switch-thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background-color: var(--app-muted);
  transition:
    transform var(--app-dur-base) var(--app-ease-spring),
    background-color var(--app-dur-fast) var(--app-ease-standard);
}

.app-panel__switch-input:checked + .app-panel__switch-track {
  border-color: color-mix(in oklab, var(--app-success) 45%, transparent);
  background-color: var(--app-success);
}

.app-panel__switch-input:checked + .app-panel__switch-track .app-panel__switch-thumb {
  transform: translateX(18px);
  background-color: #ffffff;
}

.app-panel__switch-input:focus-visible + .app-panel__switch-track {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

.app-panel__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding-inline: calc(var(--spacing) * 3.5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background-color: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
  text-decoration: none;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard);
}

.app-panel__cache {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--app-text);
}

.app-panel__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding-inline: calc(var(--spacing) * 3);
  border: 1px solid color-mix(in oklab, var(--app-danger) 32%, transparent);
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 11px;
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
  padding-top: calc(var(--spacing) * 3);
  border-top: 1px solid var(--app-border-faint);
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text-soft);
}

.app-panel__status {
  margin: calc(var(--spacing) * 3) 0 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--app-success) 30%, transparent);
  border-radius: var(--app-radius-sm);
  background-color: var(--app-success-soft);
  font-size: 12px;
  color: var(--app-text);
}

@media (hover: hover) {
  .app-panel__segment-option[aria-pressed="false"]:hover {
    color: var(--app-text);
  }

  .app-panel__link:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-hover);
  }

  .app-panel__clear:not(:disabled):hover {
    background-color: var(--app-danger-soft);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-panel__switch-thumb,
  .app-panel__switch-track {
    transition: none;
  }
}
</style>
