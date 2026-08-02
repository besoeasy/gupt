<script setup>
import { ref, onMounted } from "vue";
import { Server, Activity, RefreshCw, UploadCloud } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import UploadServersPanel from "@/components/settings/UploadServersPanel.vue";
import OriginlessPerformancePanel from "@/components/settings/OriginlessPerformancePanel.vue";
import ActiveRelaysPanel from "@/components/settings/ActiveRelaysPanel.vue";
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";

import { readConfiguredOriginlessServers } from "@/config/servers";
import { getCustomRelays } from "@/lib/relay";

const message = ref("");
const error = ref("");
const refreshing = ref(false);

const originlessServers = ref([]);
const customRelays = ref([]);

function loadOverviewStats() {
  try {
    originlessServers.value = readConfiguredOriginlessServers();
    customRelays.value = getCustomRelays();
  } catch {
    // fallback
  }
}

async function handleRefreshAll() {
  refreshing.value = true;
  loadOverviewStats();
  setTimeout(() => {
    refreshing.value = false;
  }, 400);
}

onMounted(() => {
  loadOverviewStats();
});
</script>

<template>
  <div class="min-h-screen pb-12">
    <main class="mx-auto w-full max-w-[84rem] px-4 py-6 lg:px-8 space-y-6">
      <!-- Dashboard Header -->
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">
            Server & Relay Command Center
          </h1>
          <p class="mt-1 text-sm text-(--app-muted)">
            Manage media upload endpoints, originless servers, and active Nostr relay connections.
          </p>
        </div>

        <button
          @click="handleRefreshAll"
          :disabled="refreshing"
          class="flex h-9 items-center gap-2 rounded-xl border border-(--app-border) bg-(--app-surface) px-3.5 py-1.5 text-xs font-semibold text-(--app-text) transition-colors hover:bg-(--app-surface-hover) cursor-pointer disabled:opacity-50"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': refreshing }" />
          <span>Refresh All</span>
        </button>
      </div>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />

      <!-- Top KPI Overview Cards -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <!-- Configured Upload Servers -->
        <div class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-4">
          <div class="flex items-center justify-between text-xs font-medium text-(--app-muted)">
            <span>Upload Servers</span>
            <Server class="h-4 w-4 text-sky-400" />
          </div>
          <div class="mt-3 text-2xl font-extrabold text-(--app-text) tabular-nums">
            {{ originlessServers.length }}
          </div>
          <div class="mt-1 text-xs text-(--app-muted)">
            {{ originlessServers.length < 2 ? "Single node" : "Redundant pool" }}
          </div>
        </div>

        <!-- Configured Relays -->
        <div class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-4">
          <div class="flex items-center justify-between text-xs font-medium text-(--app-muted)">
            <span>Nostr Relays</span>
            <Activity class="h-4 w-4 text-emerald-400" />
          </div>
          <div class="mt-3 text-2xl font-extrabold text-(--app-text) tabular-nums">
            {{ customRelays.length }}
          </div>
          <div class="mt-1 text-xs text-(--app-muted)">Active transport pool</div>
        </div>

        <!-- Storage Protocol -->
        <div class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-4">
          <div class="flex items-center justify-between text-xs font-medium text-(--app-muted)">
            <span>Media Engine</span>
            <UploadCloud class="h-4 w-4 text-amber-400" />
          </div>
          <div class="mt-3 text-2xl font-extrabold text-(--app-text)">Originless</div>
          <div class="mt-1 text-xs text-(--app-muted)">Self-sovereign P2P</div>
        </div>
      </div>

      <!-- Command Dashboard -->
      <div class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div class="lg:col-span-7">
            <UploadServersPanel />
          </div>
          <div class="lg:col-span-5">
            <OriginlessPerformancePanel />
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div class="lg:col-span-7">
            <CustomRelaysPanel />
          </div>
          <div class="lg:col-span-5">
            <ActiveRelaysPanel />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
