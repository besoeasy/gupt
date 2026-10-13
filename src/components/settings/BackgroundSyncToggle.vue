<script setup>
import { useSettingsStore } from "@/stores/settings";

const settingsStore = useSettingsStore();
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="min-w-0 flex-1">
      <p class="truncate text-xs sm:text-sm font-semibold tracking-tight text-zinc-200">
        Background Synchronization
      </p>
      <p class="mt-0.5 text-xs leading-relaxed text-zinc-500">
        Replicate messages and renew stream items. Required to keep bookmarks, notes and passwords
        from expiring.
      </p>
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
</template>
