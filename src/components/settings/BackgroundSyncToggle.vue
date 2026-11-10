<script setup>
import { useSettingsStore } from "@/stores/settings";

const settingsStore = useSettingsStore();
</script>

<template>
  <div class="flex items-center gap-3 py-3.5">
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium tracking-tight text-zinc-200">
        Background synchronization
      </p>
      <p class="mt-0.5 text-xs leading-relaxed text-zinc-500">
        Renew encrypted vault items before they expire on relays. Chat data always syncs through the
        local engine.
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
        class="peer sr-only"
        aria-labelledby="settings-replication-toggle"
      />
      <span
        class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-zinc-700 transition-colors duration-200 ease-in-out peer-checked:bg-(--app-success) peer-focus-visible:ring-2 peer-focus-visible:ring-(--app-primary) peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black peer-focus:outline-none"
      >
        <span
          class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
          :class="settingsStore.replicationEnabled ? 'translate-x-4' : 'translate-x-0'"
        />
      </span>
    </label>
  </div>
</template>
