<script setup>
import { RouterLink } from "vue-router";
import { useSettingsStore } from "@/stores/settings";

const settingsStore = useSettingsStore();
</script>

<template>
  <div class="space-y-4">
    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
    >
      <p class="text-sm font-semibold">Notifications</p>

      <label
        id="settings-sound-toggle"
        class="flex items-center justify-between gap-4 cursor-pointer select-none group"
        @click.prevent="settingsStore.soundEnabled = !settingsStore.soundEnabled"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-(--app-text)">Message sound</span>
          <span class="block text-[11px] text-zinc-500 mt-0.5">
            Play a soft ping on incoming messages.
          </span>
        </span>

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

      <RouterLink
        to="/notifications"
        class="inline-flex items-center justify-center rounded-2xl bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 hover:text-emerald-200"
      >
        Open notifications setup
      </RouterLink>
    </div>
  </div>
</template>
