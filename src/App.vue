<script setup>
import { computed, onUnmounted, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import AppNavbar from "@/components/AppNavbar.vue";
import AppIncomingCallBanner from "@/components/AppIncomingCallBanner.vue";
import AppCallPiP from "@/components/AppCallPiP.vue";

import { callPathForPubkey } from "@/composables/useCallNavigation";

import { shortId } from "@/lib/crypto";
import { logStartupOnce } from "@/lib/startupMetrics";
import { reconcileFromRelays, startAppSync, setCallSignalHandler } from "@/lib/sync";
import { useReplicationStore } from "@/stores/replication";
import { useIdentityStore } from "@/stores/identity";
import { useCallStore } from "@/stores/calls";
import { warmUpAudio } from "@/lib/notifications";
import { routeTransitionName, routeTransitionMode } from "@/composables/useRouteTransition";

const identity = useIdentityStore();
const callStore = useCallStore();
const replicationStore = useReplicationStore();
onUnmounted(() => replicationStore.stopWorker());
const route = useRoute();
const router = useRouter();

const isChatViewRoute = computed(() => route.path.startsWith("/chat"));
const isCallRoute = computed(() => route.path.startsWith("/call/"));
const isFullHeightRoute = computed(() => isCallRoute.value || isChatViewRoute.value);

const showNavbar = computed(() => {
  if (isCallRoute.value || route.path.startsWith("/donate-timer")) return false;
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
  replicationStore.startWorker();

  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else if (Date.now() - hiddenAt > 10_000) {
      void reconcileFromRelays(identity);
    }
  });
});

watch(
  () => identity.pubkeyHex,
  (pk, prev) => {
    if (!pk || pk === prev) return;
    void startAppSync(identity);
  },
);
</script>

<template>
  <div
    class="relative isolate flex w-full flex-col bg-(--app-bg) text-(--app-text)"
    :class="isFullHeightRoute ? 'h-dvh overflow-hidden' : 'min-h-dvh'"
    @click.once="warmUpAudio"
    @keydown.once="warmUpAudio"
  >
    <AppNavbar v-if="showNavbar" />
    <AppIncomingCallBanner v-if="showIncomingBanner" :below-nav="showNavbar" />
    <AppCallPiP v-if="showCallPiP" />

    <div class="flex min-h-0 w-full flex-1">
      <!-- Main content -->
      <main
        class="min-h-0 min-w-0 flex-1"
        :class="isFullHeightRoute ? 'h-full overflow-hidden' : 'overflow-y-auto'"
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
