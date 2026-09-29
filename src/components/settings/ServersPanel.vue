<script setup>
import { ref } from "vue";
import SettingsSegmentedTabs from "@/components/settings/SettingsSegmentedTabs.vue";
import UploadServersPanel from "@/components/settings/UploadServersPanel.vue";
import OriginlessPerformancePanel from "@/components/settings/OriginlessPerformancePanel.vue";
import ActiveRelaysPanel from "@/components/settings/ActiveRelaysPanel.vue";
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";

const RELAY_TABS = [
  { id: "config", label: "Configured" },
  { id: "active", label: "Active" },
];

const STORAGE_TABS = [
  { id: "config", label: "Servers" },
  { id: "active", label: "Active" },
];

const relayTab = ref("config");
const storageTab = ref("config");
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Relays</h2>
      <SettingsSegmentedTabs :tabs="RELAY_TABS" :active-id="relayTab" @select="relayTab = $event" />
      <CustomRelaysPanel v-if="relayTab === 'config'" />
      <ActiveRelaysPanel v-else />
    </section>

    <section class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Media storage</h2>
      <SettingsSegmentedTabs
        :tabs="STORAGE_TABS"
        :active-id="storageTab"
        @select="storageTab = $event"
      />
      <UploadServersPanel v-if="storageTab === 'config'" />
      <OriginlessPerformancePanel v-else />
    </section>
  </div>
</template>
