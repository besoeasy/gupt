<script setup>
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { Server, ChevronRight } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import SettingsGeneralPanel from "@/components/settings/SettingsGeneralPanel.vue";

const message = ref("");
const error = ref("");

const version = __APP_VERSION__;
const buildDate = new Date(__APP_BUILD_TIME__).toLocaleDateString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});
</script>

<template>
  <div class="min-h-screen">
    <main class="mx-auto w-full max-w-[80rem] px-4 py-6 lg:px-8">
      <div class="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">Settings</h1>
          <p class="mt-1 text-sm text-(--app-muted)">Manage your application preferences and general configurations.</p>
        </div>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <SettingsGeneralPanel />

        <!-- Quick Shortcut to Servers & Relays -->
        <RouterLink
          to="/servers"
          class="flex items-center justify-between rounded-2xl border border-(--app-border) bg-(--app-surface) p-4 transition-colors hover:bg-(--app-surface-hover)"
        >
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
              <Server class="h-5 w-5" />
            </div>
            <div>
              <p class="text-sm font-semibold text-(--app-text)">Server & Relay Management</p>
              <p class="text-xs text-(--app-muted)">Configure media upload servers, custom Nostr relays, and originless endpoints.</p>
            </div>
          </div>
          <ChevronRight class="h-5 w-5 text-(--app-muted)" />
        </RouterLink>

        <div class="pt-8 pb-4 text-center">
          <p class="text-xs font-mono text-(--app-muted)/60 uppercase tracking-widest">
            v{{ version }} &middot; Build {{ buildDate }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
