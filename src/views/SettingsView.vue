<script setup>
import { ref } from "vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import UiTabBar from "@/components/UiTabBar.vue";
import CacheStoragePanel from "@/components/settings/CacheStoragePanel.vue";

import SettingsGeneralPanel from "@/components/settings/SettingsGeneralPanel.vue";
import UploadServersPanel from "@/components/settings/UploadServersPanel.vue";
import OriginlessPerformancePanel from "@/components/settings/OriginlessPerformancePanel.vue";
import ActiveRelaysPanel from "@/components/settings/ActiveRelaysPanel.vue";
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";

const message = ref("");
const error = ref("");
const activeTab = ref("general");

const tabs = [
  { id: "general", label: "General" },
  { id: "servers", label: "Servers" },
  { id: "storage", label: "Storage" },
];

function onPanelMessage(text) {
  message.value = text;
  if (text) error.value = "";
}

function onPanelError(text) {
  error.value = text;
  if (text) message.value = "";
}

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
          <h1 class="text-2xl font-bold tracking-tight">Settings</h1>
          <p class="mt-1 text-sm text-zinc-500">Manage your preferences, servers, and storage.</p>
        </div>

        <UiTabBar v-model="activeTab" :tabs="tabs" id-prefix="settings-tab" />

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <SettingsGeneralPanel v-if="activeTab === 'general'" />

        <template v-if="activeTab === 'servers'">
          <UploadServersPanel />
          <CustomRelaysPanel />
          <OriginlessPerformancePanel />
          <ActiveRelaysPanel />
        </template>

        <CacheStoragePanel
          v-if="activeTab === 'storage'"
          @message="onPanelMessage"
          @error="onPanelError"
        />

        <div class="pt-8 pb-4 text-center">
          <p class="text-xs font-mono text-zinc-500/60 uppercase tracking-widest">
            v{{ version }} &middot; Build {{ buildDate }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
