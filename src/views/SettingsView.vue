<script setup>
import { ref } from "vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import SettingsGeneralPanel from "@/components/settings/SettingsGeneralPanel.vue";
import ServersPanel from "@/components/settings/ServersPanel.vue";

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
          <p class="mt-1 text-sm text-(--app-muted)">
            Manage your application preferences and general configurations.
          </p>
        </div>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <SettingsGeneralPanel />

        <ServersPanel />

        <div class="pt-8 pb-4 text-center">
          <p class="text-xs font-mono text-(--app-muted)/60 uppercase tracking-widest">
            v{{ version }} &middot; Build {{ buildDate }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
