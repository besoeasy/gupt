<script setup>
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppNavbar from "@/components/AppNavbar.vue";
import { Toaster } from "vue-sonner";

import { shortId } from "@/lib/crypto";
import { logStartupOnce } from "@/lib/startupMetrics";
import { startAppSync } from "@/lib/sync";
import { useIdentityStore } from "@/stores/identity";
import { requestNotificationPermission } from "@/lib/notifications";

const identity = useIdentityStore();
const route = useRoute();

const showNavbar = computed(() => true);

identity.init().then(() => {
  logStartupOnce("identity-ready", "identity:ready", { pubkey: shortId(identity.pubkeyHex) });
  logStartupOnce("sync-started", "sync:started");
  void startAppSync(identity);
  void requestNotificationPermission();
});
</script>

<template>
  <div class="relative flex flex-col min-h-dvh bg-background text-foreground">
    <AppNavbar v-if="showNavbar" />
    <RouterView v-slot="{ Component, route: currentRoute }">
      <Transition name="route-fade" mode="out-in">
        <component :is="Component" :key="currentRoute.fullPath" />
      </Transition>
    </RouterView>
    <Toaster
      position="bottom-center"
      :toastOptions="{
        style: {
          background: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
        },
      }"
    />
  </div>
</template>
