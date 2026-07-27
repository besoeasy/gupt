<script setup>
import { ref } from "vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import UploadServersPanel from "@/components/settings/UploadServersPanel.vue";
import OriginlessPerformancePanel from "@/components/settings/OriginlessPerformancePanel.vue";
import ActiveRelaysPanel from "@/components/settings/ActiveRelaysPanel.vue";
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";

const message = ref("");
const error = ref("");
</script>

<template>
  <div class="min-h-screen">
    <main class="mx-auto w-full max-w-[80rem] px-4 py-6 lg:px-8">
      <div class="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">Server & Relay Management</h1>
          <p class="mt-1 text-sm text-(--app-muted)">
            Configure media upload servers, custom relays, and originless performance settings.
          </p>
        </div>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <UploadServersPanel />
        <CustomRelaysPanel />
        <OriginlessPerformancePanel />
        <ActiveRelaysPanel />
      </div>
    </main>
  </div>
</template>
