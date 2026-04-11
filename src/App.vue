<script setup>
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppNavbar from "@/components/AppNavbar.vue";
import AppIncomingCallBanner from "@/components/AppIncomingCallBanner.vue";
import HomeSidebar from "@/components/home/HomeSidebar.vue";

import { shortId } from "@/lib/crypto";
import { logStartupOnce } from "@/lib/startupMetrics";
import { startAppSync, setCallSignalHandler } from "@/lib/sync";
import { useIdentityStore } from "@/stores/identity";
import { useCallStore } from "@/stores/calls";
import { requestNotificationPermission, warmUpAudio } from "@/lib/notifications";

const identity = useIdentityStore();
const callStore = useCallStore();
const route = useRoute();

const isChatRoute = computed(
  () => route.path === "/" || route.path.startsWith("/room/") || route.path.startsWith("/groups/"),
);

const isRoomRoute = computed(
  () => route.path.startsWith("/room/") || route.path.startsWith("/groups/"),
);

const showNavbarMobile = computed(
  () => !route.path.startsWith("/room/") && !route.path.startsWith("/groups/"),
);

identity.init().then(() => {
  logStartupOnce("identity-ready", "identity:ready", { pubkey: shortId(identity.pubkeyHex) });
  logStartupOnce("sync-started", "sync:started");
  callStore.initIdentity(identity);
  setCallSignalHandler((row) => callStore.handleSignalRow(row));
  void startAppSync(identity);
  void requestNotificationPermission();
});
</script>

<template>
  <div
    class="m-auto max-w-[90rem]"
    :class="isRoomRoute ? 'h-dvh flex flex-col overflow-hidden' : ''"
    @click.once="warmUpAudio"
    @keydown.once="warmUpAudio"
  >
    <!-- Navbar: mobile hides on room/group; desktop always shows -->
    <AppNavbar
      :class="[showNavbarMobile ? '' : 'hidden lg:block', isRoomRoute ? 'shrink-0' : '']"
    />
    <!-- Global incoming call banner: visible on any route when a call arrives -->
    <AppIncomingCallBanner />

    <div class="flex" :class="isRoomRoute ? 'flex-1 min-h-0' : ''">
      <!-- Desktop sidebar for chat routes -->
      <aside
        v-if="isChatRoute"
        class="hidden lg:block messenger-sidebar shrink-0 overflow-hidden"
        :class="isRoomRoute ? 'h-full' : 'sticky top-14 h-[calc(100dvh-3.5rem)]'"
      >
        <HomeSidebar />
      </aside>

      <!-- Single RouterView -->
      <div class="flex-1 min-w-0" :class="isRoomRoute ? 'h-full' : ''">
        <RouterView v-slot="{ Component, route: currentRoute }">
          <component :is="Component" :key="currentRoute.fullPath" />
        </RouterView>
      </div>
    </div>
  </div>
</template>
