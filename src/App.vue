<script setup>
import { computed, watch, ref } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import AppNavbar from "@/components/AppNavbar.vue";
import AppIncomingCallBanner from "@/components/AppIncomingCallBanner.vue";
import AppCallPiP from "@/components/AppCallPiP.vue";
import NotificationBanner from "@/components/NotificationBanner.vue";

import { callPathForPubkey } from "@/composables/useCallNavigation";

import { shortId } from "@/lib/crypto";
import { logStartupOnce } from "@/lib/startupMetrics";
import { reconcileFromRelays, startAppSync, setCallSignalHandler } from "@/lib/sync";
import { useReplicationWorker } from "@/composables/useReplicationWorker";
import { useIdentityStore } from "@/stores/identity";
import { useCallStore } from "@/stores/calls";
import { warmUpAudio } from "@/lib/notifications";
import { routeTransitionName, routeTransitionMode } from "@/composables/useRouteTransition";

const identity = useIdentityStore();
const callStore = useCallStore();
const { startWorker: startReplicationWorker } = useReplicationWorker();
const route = useRoute();
const router = useRouter();

const notifBanner = ref(null);

const isChatViewRoute = computed(() => route.path.startsWith("/chat"));
const isCallRoute = computed(() => route.path.startsWith("/call/"));
const isNotesRoute = computed(() => route.path.startsWith("/notes"));
const isPasswordsRoute = computed(() => route.path.startsWith("/passwords"));
const isBookmarksRoute = computed(() => route.path.startsWith("/bookmarks"));
const isFullHeightRoute = computed(
  () =>
    isCallRoute.value ||
    isChatViewRoute.value ||
    isNotesRoute.value ||
    isPasswordsRoute.value ||
    isBookmarksRoute.value,
);

const showNavbar = computed(() => {
  if (isCallRoute.value || route.path.startsWith("/donate-timer")) return false;
  if (isChatViewRoute.value) {
    const isMobile = !window.matchMedia("(min-width: 1024px)").matches;
    const hasActiveConv = route.params.conversationId;
    if (isMobile && hasActiveConv) return false;
    return true;
  }
  return true;
});

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

identity.init().then(() => {
  logStartupOnce("identity-ready", "identity:ready", { pubkey: shortId(identity.pubkeyHex) });
  logStartupOnce("sync-started", "sync:started");
  setCallSignalHandler((row) => callStore.handleSignalRow(row));
  void startAppSync(identity);
  startReplicationWorker();

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
    class="relative isolate flex w-full flex-col bg-(--app-bg) text-(--app-text)"
    :class="isFullHeightRoute ? 'h-dvh overflow-hidden' : 'min-h-dvh'"
    @click.once="warmUpAudio"
    @keydown.once="warmUpAudio"
  >
    <NotificationBanner ref="notifBanner" />
    <AppNavbar v-if="showNavbar" />
    <AppIncomingCallBanner v-if="showIncomingBanner" :below-nav="showNavbar" />
    <AppCallPiP v-if="showCallPiP" />

    <div class="flex min-h-0 w-full flex-1">
      <!-- Main content -->
      <main
        class="min-h-0 min-w-0 flex-1"
        :class="isCallRoute || isChatViewRoute ? 'h-full overflow-hidden' : 'overflow-y-auto'"
      >
        <RouterView v-slot="{ Component, route: currentRoute }">
          <Transition
            :name="routeTransitionName"
            :mode="routeTransitionMode"
            class="relative isolate h-full overflow-hidden"
          >
            <component
              :is="Component"
              :key="currentRoute.fullPath"
              class="h-full will-change-transform"
            />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>
