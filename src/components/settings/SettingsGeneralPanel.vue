<script setup>
import { RouterLink } from "vue-router";
import { useSettingsStore } from "@/stores/settings";

const settingsStore = useSettingsStore();
</script>

<template>
  <div class="space-y-4">
    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4"
    >
      <label
        id="settings-sound-toggle"
        class="flex items-center justify-between gap-4 cursor-pointer select-none"
        @click.prevent="settingsStore.soundEnabled = !settingsStore.soundEnabled"
      >
        <span class="text-sm font-semibold text-(--app-text)">Notification</span>

        <input
          type="checkbox"
          :checked="settingsStore.soundEnabled"
          class="sr-only peer"
          aria-labelledby="settings-sound-toggle"
        />

        <span
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-zinc-700 transition-colors duration-200 ease-in-out peer-checked:bg-emerald-500 peer-focus:outline-none"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
            :class="settingsStore.soundEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </span>
      </label>
    </div>

    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4"
    >
      <div class="flex items-center justify-between gap-4">
        <span class="text-sm font-semibold text-(--app-text)">Push & Offline Alerts</span>
        <RouterLink
          to="/notifications"
          class="inline-flex shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-emerald-300 transition-colors hover:bg-emerald-500/25 hover:text-emerald-200"
        >
          Setup
        </RouterLink>
      </div>
    </div>

    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4"
    >
      <label
        id="settings-replication-toggle"
        class="flex items-center justify-between gap-4 cursor-pointer select-none"
        @click.prevent="settingsStore.replicationEnabled = !settingsStore.replicationEnabled"
      >
        <span class="text-sm font-semibold text-(--app-text)">Background Synchronization</span>

        <input
          type="checkbox"
          :checked="settingsStore.replicationEnabled"
          class="sr-only peer"
          aria-labelledby="settings-replication-toggle"
        />

        <span
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-zinc-700 transition-colors duration-200 ease-in-out peer-checked:bg-emerald-500 peer-focus:outline-none"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
            :class="settingsStore.replicationEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </span>
      </label>
    </div>
  </div>
</template>
