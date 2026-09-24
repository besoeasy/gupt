<script setup>
import { ref } from "vue";
import { Settings } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import SettingsGeneralPanel from "@/components/settings/SettingsGeneralPanel.vue";
import ServersPanel from "@/components/settings/ServersPanel.vue";

const message = ref("");
const error = ref("");

const version = __APP_VERSION__;
const buildDate = new Date(__APP_BUILD_TIME__).toLocaleString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
</script>

<template>
  <div class="h-full w-full min-w-0 overflow-y-auto bg-black text-zinc-100 pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto w-full max-w-2xl space-y-5">
        <!-- Header Section -->
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400"
            >
              <Settings class="h-5 w-5" />
            </div>
            <div class="min-w-0">
              <h1 class="truncate text-xl font-semibold tracking-tight text-white">Settings</h1>
              <p class="mt-0.5 truncate text-xs text-zinc-500 leading-relaxed">
                Application preferences and server configuration.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400 tabular-nums"
              >v{{ version }}</span
            >
          </div>
        </div>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <SettingsGeneralPanel />

        <ServersPanel />

        <div class="pt-2 pb-4 text-center">
          <p class="font-mono text-[11px] uppercase tracking-widest text-zinc-600 tabular-nums">
            v{{ version }} &middot; Build {{ buildDate }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
