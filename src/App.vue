<script setup>
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppNavbar from "@/components/AppNavbar.vue";
import AppIncomingCallBanner from "@/components/AppIncomingCallBanner.vue";
import AppActiveCallBar from "@/components/AppActiveCallBar.vue";
import AppCallOverlay from "@/components/AppCallOverlay.vue";
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
  setCallSignalHandler((row) => callStore.handleSignalRow(row));
  void startAppSync(identity);
  void requestNotificationPermission();
});
</script>

<template>
  <div
    class="w-full"
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
    <!-- Active call bar: shown whenever a call is outgoing or connected -->
    <AppActiveCallBar />
    <!-- Global call overlay: floating video panel + persistent audio element across routes -->
    <AppCallOverlay />

    <div class="flex max-w-7xl mx-auto w-full" :class="isRoomRoute ? 'flex-1 min-h-0' : ''">
      <!-- Mobile sidebar: only for home route, only rendered on small screens -->
      <div v-if="route.path === '/'" class="lg:hidden w-full">
        <HomeSidebar />
      </div>

      <!-- Desktop sidebar for chat routes -->
      <aside
        v-if="isChatRoute"
        class="hidden lg:block messenger-sidebar shrink-0 overflow-hidden"
        :class="
          isRoomRoute ? 'h-full' : 'sticky top-14 h-[calc(100dvh-3.5rem-var(--funding-banner-h))]'
        "
      >
        <HomeSidebar />
      </aside>

      <!-- Single RouterView -->
      <div
        class="flex-1 min-w-0"
        :class="[isRoomRoute ? 'h-full' : '', route.path === '/' ? 'hidden lg:block' : '']"
      >
        <RouterView v-slot="{ Component, route: currentRoute }">
          <Transition name="route-fade" mode="out-in">
            <component :is="Component" :key="currentRoute.fullPath" />
          </Transition>
        </RouterView>
      </div>
    </div>
  </div>
</template>
