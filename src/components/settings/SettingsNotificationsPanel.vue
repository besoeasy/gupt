<script setup>
import { RouterLink } from "vue-router";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import { useSettingsStore } from "@/stores/settings";

const settings = useSettingsStore();
</script>

<template>
  <div>
    <SettingsRow title="Message sound" description="Play a sound for incoming messages.">
      <label class="flex min-h-11 cursor-pointer items-center sm:min-h-8">
        <input
          v-model="settings.soundEnabled"
          type="checkbox"
          class="peer sr-only"
          aria-label="Message sound"
        />
        <span
          class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent bg-zinc-700 transition-colors duration-200 ease-in-out peer-checked:bg-(--app-success) peer-focus-visible:ring-2 peer-focus-visible:ring-(--app-primary) peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black peer-focus-visible:outline-none"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
            :class="settings.soundEnabled ? 'translate-x-4' : 'translate-x-0'"
          />
        </span>
      </label>
    </SettingsRow>

    <SettingsRow
      title="Push notifications"
      description="Delivered through ntfy when the app is closed."
    >
      <RouterLink
        to="/notifications"
        class="inline-flex min-h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-[0.98] sm:min-h-8"
      >
        Set up
      </RouterLink>
    </SettingsRow>
  </div>
</template>
