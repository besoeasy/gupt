<script setup>
import { RouterLink } from "vue-router";
import { ArrowUpRight } from "@lucide/vue";
import { useSettingsStore } from "@/stores/settings";

const settingsStore = useSettingsStore();
</script>

<template>
  <section class="space-y-1">
    <h2 class="px-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
      General
    </h2>

    <div class="divide-y divide-zinc-800/70">
      <div class="flex items-center gap-3 py-3.5">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium tracking-tight text-zinc-200">
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
            class="peer sr-only"
            aria-labelledby="settings-sound-toggle"
          />
          <span
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-zinc-700 transition-colors duration-200 ease-in-out peer-checked:bg-(--app-success) peer-focus-visible:ring-2 peer-focus-visible:ring-(--app-primary) peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black peer-focus:outline-none"
          >
            <span
              class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
              :class="settingsStore.soundEnabled ? 'translate-x-4' : 'translate-x-0'"
            />
          </span>
        </label>
      </div>

      <div class="flex items-center gap-3 py-3.5">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium tracking-tight text-zinc-200">
            Push &amp; offline alerts
          </p>
          <p class="mt-0.5 truncate text-xs text-zinc-500">
            Get notified even when the app is closed.
          </p>
        </div>
        <RouterLink
          to="/notifications"
          class="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
        >
          Set up
          <ArrowUpRight class="h-3 w-3" :stroke-width="2" />
        </RouterLink>
      </div>
    </div>
  </section>
</template>
