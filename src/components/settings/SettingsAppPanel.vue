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
  <div>
    <SettingsRow title="Theme" description="Applies everywhere, immediately.">
      <div class="settings-app-panel__theme" role="group" aria-label="Theme">
        <button
          type="button"
          class="settings-app-panel__theme-option"
          :aria-pressed="theme.isDark"
          @click="selectTheme('dark')"
        >
          Dark
        </button>
        <button
          type="button"
          class="settings-app-panel__theme-option"
          :aria-pressed="!theme.isDark"
          @click="selectTheme('light')"
        >
          Light
        </button>
      </div>
    </SettingsRow>

    <SettingsRow title="Message sound" description="Play a sound for incoming messages.">
      <label class="settings-app-panel__sound">
        <input
          v-model="settings.soundEnabled"
          type="checkbox"
          class="settings-app-panel__sound-input"
          aria-label="Message sound"
        />
        <span class="settings-app-panel__sound-track" aria-hidden="true">
          <span class="settings-app-panel__sound-thumb" />
        </span>
      </label>
    </SettingsRow>

    <SettingsRow
      title="Push notifications"
      description="Delivered through ntfy when the app is closed."
    >
      <RouterLink to="/notifications" class="settings-app-panel__link"> Set up </RouterLink>
    </SettingsRow>

    <SettingsRow title="Cached media" :description="cacheSub">
      <span class="settings-app-panel__cache-size">{{ cacheLabel }}</span>
      <button
        type="button"
        class="settings-app-panel__clear"
        :disabled="clearing || loading || !cacheEntries"
        @click="confirmOpen = true"
      >
        {{ clearing ? "Clearing…" : "Clear" }}
      </button>
    </SettingsRow>

    <p class="settings-app-panel__note">
      Relays keep your events for {{ RETENTION_DAYS }} days; this device only mirrors them.
    </p>

    <p v-if="message" class="settings-app-panel__status" role="status">
      {{ message }}
    </p>

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

@layer gupt-components {
  .settings-app-panel__theme {
    display: inline-flex;
    gap: calc(var(--spacing) * 0.5);
    padding: calc(var(--spacing) * 0.5);
    border: 1px solid var(--ui-zinc-800);
    border-radius: var(--radius-lg);
    background-color: var(--app-surface-tint);
  }

  .settings-app-panel__theme-option {
    min-width: calc(var(--spacing) * 14);
    min-height: calc(var(--spacing) * 11);
    padding-inline: calc(var(--spacing) * 3);
    border-radius: var(--radius-md);
    font-size: 11px;
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      color 0.2s,
      background-color 0.2s;
  }

  .settings-app-panel__theme-option[aria-pressed="true"] {
    background-color: var(--ui-zinc-800);
    color: var(--ui-zinc-100);
  }

  .settings-app-panel__theme-option[aria-pressed="false"] {
    color: var(--ui-zinc-500);
  }

  @media (hover: hover) {
    .settings-app-panel__theme-option[aria-pressed="false"]:hover {
      color: var(--ui-zinc-300);
    }
  }

  [data-theme="light"] .settings-app-panel__theme-option[aria-pressed="false"] {
    color: var(--app-muted);
  }

  [data-theme="light"] .settings-app-panel__theme-option[aria-pressed="false"]:hover {
    color: var(--app-text);
  }

  .settings-app-panel__theme-option:active {
    scale: 0.98;
  }

  @media (min-width: 40rem) {
    .settings-app-panel__theme-option {
      min-height: calc(var(--spacing) * 8);
    }
  }

  .settings-app-panel__sound {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: calc(var(--spacing) * 11);
    cursor: pointer;
  }

  .settings-app-panel__sound-input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    clip-path: inset(50%);
    overflow: hidden;
    white-space: nowrap;
  }

  .settings-app-panel__sound-track {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    width: calc(var(--spacing) * 9);
    height: calc(var(--spacing) * 5);
    border: 2px solid transparent;
    border-radius: 999px;
    background-color: var(--ui-zinc-700);
    transition: background-color 0.2s var(--ease-in-out);
  }

  .settings-app-panel__sound-thumb {
    display: inline-block;
    width: calc(var(--spacing) * 4);
    height: calc(var(--spacing) * 4);
    border-radius: 999px;
    background-color: var(--color-white);
    box-shadow:
      0 1px 3px 0 #0000001a,
      0 1px 2px -1px #0000001a;
    transition: translate 0.2s var(--ease-in-out);
  }

  .settings-app-panel__sound-input:checked ~ .settings-app-panel__sound-track {
    background-color: var(--app-success);
  }

  .settings-app-panel__sound-input:checked
    ~ .settings-app-panel__sound-track
    .settings-app-panel__sound-thumb {
    translate: calc(var(--spacing) * 4) 0;
  }

  .settings-app-panel__sound-input:focus-visible ~ .settings-app-panel__sound-track {
    outline: 2px solid var(--app-primary);
    outline-offset: 2px;
  }

  @media (min-width: 40rem) {
    .settings-app-panel__sound {
      min-height: calc(var(--spacing) * 8);
    }
  }

  .settings-app-panel__link {
    display: inline-flex;
    align-items: center;
    min-height: calc(var(--spacing) * 11);
    padding-inline: calc(var(--spacing) * 3);
    border: 1px solid var(--ui-zinc-800);
    border-radius: var(--radius-lg);
    background-color: var(--app-surface-tint);
    font-size: 11px;
    font-weight: var(--font-weight-medium);
    color: var(--ui-zinc-300);
    transition:
      color 0.2s,
      background-color 0.2s,
      border-color 0.2s;
  }

  @media (hover: hover) {
    .settings-app-panel__link:hover {
      border-color: var(--ui-zinc-700);
      background-color: var(--ui-zinc-800);
      color: var(--color-white);
    }
  }

  .settings-app-panel__link:active {
    scale: 0.98;
  }

  [data-theme="light"] .settings-app-panel__link {
    color: var(--app-text-soft);
  }

  @media (min-width: 40rem) {
    .settings-app-panel__link {
      min-height: calc(var(--spacing) * 8);
    }
  }

  .settings-app-panel__cache-size {
    font-family: var(--font-mono);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--ui-zinc-300);
  }

  [data-theme="light"] .settings-app-panel__cache-size {
    color: var(--app-text-soft);
  }

  .settings-app-panel__note {
    padding: calc(var(--spacing) * 3) var(--spacing) 0;
    font-size: 11px;
    line-height: var(--leading-relaxed);
    color: var(--ui-zinc-500);
  }

  [data-theme="light"] .settings-app-panel__note {
    color: var(--app-muted);
  }

  .settings-app-panel__clear {
    display: inline-flex;
    align-items: center;
    min-height: calc(var(--spacing) * 11);
    padding-inline: calc(var(--spacing) * 2);
    border-radius: var(--radius-lg);
    font-size: 11px;
    font-weight: var(--font-weight-medium);
    color: var(--color-red-400);
    cursor: pointer;
    transition:
      color 0.2s,
      background-color 0.2s;
  }

  @media (hover: hover) {
    .settings-app-panel__clear:hover {
      background-color: var(--app-danger-soft);
      color: var(--color-red-300);
    }
  }

  .settings-app-panel__clear:active {
    scale: 0.98;
  }

  .settings-app-panel__clear:disabled {
    opacity: 0.4;
    cursor: default;
  }

  [data-theme="light"] .settings-app-panel__clear {
    color: var(--app-danger);
  }

  @media (min-width: 40rem) {
    .settings-app-panel__clear {
      min-height: calc(var(--spacing) * 8);
    }
  }

  .settings-app-panel__status {
    padding: calc(var(--spacing) * 3) var(--spacing) 0;
    font-size: 11px;
    line-height: var(--leading-relaxed);
    color: var(--ui-zinc-500);
  }

  [data-theme="light"] .settings-app-panel__status {
    color: var(--app-muted);
  }
}
</style>
