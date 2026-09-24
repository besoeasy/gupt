<script setup>
import { RouterLink } from "vue-router";
import { ArrowUpRight } from "@lucide/vue";
import { useSettingsStore } from "@/stores/settings";

const settingsStore = useSettingsStore();
</script>

<template>
  <div class="space-y-2">
    <div
      class="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-3.5 transition-colors duration-150"
    >
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs sm:text-sm font-semibold tracking-tight text-zinc-200">
          Notification sound
        </p>
        <p class="mt-0.5 truncate text-xs text-zinc-500">Play a sound on incoming messages.</p>
      </div>
      <label
        id="settings-sound-toggle"
        class="flex shrink-0 cursor-pointer select-none"
        @click.prevent="settingsStore.soundEnabled = !settingsStore.soundEnabled"
      >
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
      class="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-3.5 transition-colors duration-150"
    >
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs sm:text-sm font-semibold tracking-tight text-zinc-200">
          Push &amp; Offline Alerts
        </p>
        <p class="mt-0.5 truncate text-xs text-zinc-500">Get notified even when the app is closed.</p>
      </div>
      <RouterLink
        to="/notifications"
        class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
      >
        Setup
        <ArrowUpRight class="h-3.5 w-3.5" :stroke-width="2" />
      </RouterLink>
    </div>

    <div
      class="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-3.5 transition-colors duration-150"
    >
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs sm:text-sm font-semibold tracking-tight text-zinc-200">
          Background Synchronization
        </p>
        <p class="mt-0.5 truncate text-xs text-zinc-500">Keep relays in sync in the background.</p>
      </div>
      <label
        id="settings-replication-toggle"
        class="flex shrink-0 cursor-pointer select-none"
        @click.prevent="settingsStore.replicationEnabled = !settingsStore.replicationEnabled"
      >
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
