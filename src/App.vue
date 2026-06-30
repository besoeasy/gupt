<script setup>
import { computed, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import AppNavbar from "@/components/AppNavbar.vue";
import AppIncomingCallBanner from "@/components/AppIncomingCallBanner.vue";
import AppCallPiP from "@/components/AppCallPiP.vue";
import FundingBanner from "@/components/FundingBanner.vue";
import HomeSidebar from "@/components/home/HomeSidebar.vue";
import { callPathForPubkey } from "@/composables/useCallNavigation";

import { shortId } from "@/lib/crypto";
import { logStartupOnce } from "@/lib/startupMetrics";
import { reconcileFromRelays, startAppSync, setCallSignalHandler } from "@/lib/sync";
import { useIdentityStore } from "@/stores/identity";
import { useCallStore } from "@/stores/calls";
import { dismissNtfyOnboarding, shouldShowNtfyOnboarding } from "@/lib/ntfyOnboarding";
import { warmUpAudio } from "@/lib/notifications";
import { routeTransitionName, routeTransitionMode } from "@/composables/useRouteTransition";

const identity = useIdentityStore();
const callStore = useCallStore();
const route = useRoute();
const router = useRouter();

const isChatRoute = computed(
  () =>
    route.path === "/messages" ||
    route.path.startsWith("/room/") ||
    route.path.startsWith("/groups/"),
);

const isRoomRoute = computed(
  () => route.path.startsWith("/room/") || route.path.startsWith("/groups/"),
);

const isCallRoute = computed(() => route.path.startsWith("/call/"));

const isFullHeightRoute = computed(() => isChatRoute.value || isCallRoute.value);

const showNavbar = computed(() => !isRoomRoute.value && !isCallRoute.value);

const showCallPiP = computed(() => {
  const active = ["requesting-media", "outgoing", "connecting", "connected"];
  return active.includes(callStore.callState) && !isCallRoute.value;
});

const showIncomingBanner = computed(() => callStore.callState === "incoming" && !isCallRoute.value);

watch(
  () => callStore.callState,
  (state) => {
    if (state !== "incoming" || !callStore.activePeerPubkey) return;
    const target = callPathForPubkey(callStore.activePeerPubkey);
    if (route.path !== target) {
      void router.push(target);
    }
  },
);

function shouldRedirectToNotifications() {
  if (!identity.pubkeyHex || !shouldShowNtfyOnboarding()) return false;
  const path = route.path;
  const hash = window.location.hash;

  if (
    path === "/notifications" ||
    path.startsWith("/call/") ||
    path.startsWith("/invite/") ||
    path.startsWith("/share") ||
    hash.startsWith("#/share") ||
    hash.startsWith("#/call/") ||
    hash.startsWith("#/invite/") ||
    hash.startsWith("#/notifications")
  ) {
    return false;
  }
  return true;
}

identity.init().then(() => {
  logStartupOnce("identity-ready", "identity:ready", { pubkey: shortId(identity.pubkeyHex) });
  logStartupOnce("sync-started", "sync:started");
  setCallSignalHandler((row) => callStore.handleSignalRow(row));
  void startAppSync(identity);

  if (shouldRedirectToNotifications()) {
    dismissNtfyOnboarding();
    void router.replace("/notifications");
  }

  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else if (Date.now() - hiddenAt > 10_000) {
      void reconcileFromRelays(identity);
    }
  });
});
</script>

<template>
  <div
    class="app-shell flex w-full flex-col"
    :class="isFullHeightRoute ? 'h-dvh overflow-hidden' : 'min-h-dvh'"
    @click.once="warmUpAudio"
    @keydown.once="warmUpAudio"
  >
    <FundingBanner />
    <AppNavbar v-if="showNavbar" />
    <AppIncomingCallBanner v-if="showIncomingBanner" :below-nav="showNavbar" />
    <AppCallPiP v-if="showCallPiP" />

    <div class="flex min-h-0 w-full flex-1">
      <!-- Mobile inbox: full screen on home -->
      <Transition :name="routeTransitionName" :mode="routeTransitionMode" class="chat-route-transition lg:hidden">
        <div
          v-if="route.path === '/messages'"
          key="mobile-inbox"
          class="flex min-h-0 min-w-0 w-full flex-1 flex-col"
        >
          <HomeSidebar class="h-full w-full min-w-0 flex-1" />
        </div>
      </Transition>

      <!-- Desktop inbox: persistent on chat routes -->
      <aside
        v-if="isChatRoute"
        class="messenger-sidebar hidden h-full min-h-0 shrink-0 flex-col overflow-hidden lg:flex"
      >
        <HomeSidebar />
      </aside>

      <!-- Main content -->
      <main
        class="min-h-0 min-w-0 flex-1"
        :class="[
          isRoomRoute || isCallRoute ? 'h-full overflow-hidden' : 'overflow-y-auto',
          route.path === '/messages' ? 'hidden lg:block' : '',
        ]"
      >
        <RouterView v-slot="{ Component, route: currentRoute }">
          <Transition
            :name="routeTransitionName"
            :mode="routeTransitionMode"
            class="chat-route-transition h-full"
          >
            <component
              :is="Component"
              :key="currentRoute.fullPath"
              class="chat-route-panel h-full"
            />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>
