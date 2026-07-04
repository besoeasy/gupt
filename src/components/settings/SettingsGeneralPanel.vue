<script setup>
import { RouterLink } from "vue-router";
import { Code2, ExternalLink } from "lucide-vue-next";
import packageMeta from "../../../package.json";
import { useSettingsStore } from "@/stores/settings";

const settingsStore = useSettingsStore();
const version = packageMeta.version;
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

    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
    >
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

    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
    >
      <p class="text-sm font-semibold">Open Source</p>
      <p class="text-[11px] text-zinc-400 leading-5">
        GUPT is free and open source. Fork the repo, build your own features, and submit a pull
        request — contributions of any size are welcome.
      </p>
      <a
        href="https://github.com/besoeasy/gupt"
        target="_blank"
        rel="noreferrer"
        class="flex items-center gap-3 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5 transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)"
      >
        <Code2 class="h-5 w-5 shrink-0" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">github.com/besoeasy/gupt</p>
          <p class="text-[11px] text-zinc-500">Fork · Star · Contribute</p>
        </div>
        <ExternalLink class="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
      </a>
    </div>

    <p class="text-center text-xs text-zinc-600">v{{ version }}</p>
  </div>
</template>
