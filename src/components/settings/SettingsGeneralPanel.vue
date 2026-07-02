<script setup>
import { RouterLink } from "vue-router";
import packageMeta from "../../../package.json";
import { useSettingsStore } from "@/stores/settings";

const settingsStore = useSettingsStore();
const version = packageMeta.version;
</script>

<template>
  <div class="space-y-4">
    <div class="ui-panel rounded-2xl p-4 space-y-3">
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

        <span
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out"
          :class="settingsStore.soundEnabled ? 'bg-emerald-500' : 'bg-white/15'"
        >
          <span
            class="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
            :class="settingsStore.soundEnabled ? 'translate-x-5' : 'translate-x-0.5'"
          />
        </span>
      </label>
    </div>

    <div class="ui-panel rounded-2xl p-4 space-y-3">
      <p class="text-sm font-semibold">Offline push (ntfy)</p>
      <p class="text-[13px] leading-relaxed text-zinc-400">
        Gupt can't use normal push alerts because chats are encrypted and we run no central server.
        Get pinged when someone wants you online — full setup guide with app links and your topic
        key.
      </p>
      <RouterLink
        to="/notifications"
        class="inline-flex items-center justify-center rounded-2xl bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 hover:text-emerald-200"
      >
        Open notifications setup
      </RouterLink>
    </div>

    <div class="ui-panel rounded-2xl p-4 space-y-3">
      <p class="text-sm font-semibold">Open Source</p>
      <p class="text-[11px] text-zinc-400 leading-5">
        GUPT is free and open source. Fork the repo, build your own features, and submit a pull
        request — contributions of any size are welcome.
      </p>
      <a
        href="https://github.com/besoeasy/gupt"
        target="_blank"
        rel="noreferrer"
        class="flex items-center gap-3 rounded-xl ui-surface px-3 py-2.5 transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)"
      >
        <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
          />
        </svg>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">github.com/besoeasy/gupt</p>
          <p class="text-[11px] text-zinc-500">Fork · Star · Contribute</p>
        </div>
        <svg
          class="h-4 w-4 shrink-0 text-zinc-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
        </svg>
      </a>
    </div>

    <p class="text-center text-xs text-zinc-600">v{{ version }}</p>
  </div>
</template>
