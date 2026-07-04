<script setup>
import { ref } from "vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import UiTabBar from "@/components/UiTabBar.vue";
import CacheStoragePanel from "@/components/settings/CacheStoragePanel.vue";
import RelayHealthPanel from "@/components/settings/RelayHealthPanel.vue";
import SettingsGeneralPanel from "@/components/settings/SettingsGeneralPanel.vue";
import UploadServersPanel from "@/components/settings/UploadServersPanel.vue";

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
          <RelayHealthPanel />
          <UploadServersPanel @message="onPanelMessage" @error="onPanelError" />
        </template>

        <CacheStoragePanel
          v-if="activeTab === 'storage'"
          @message="onPanelMessage"
          @error="onPanelError"
        />
      </div>
    </main>
  </div>
</template>
