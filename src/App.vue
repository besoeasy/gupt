<script setup>
import { computed, onUnmounted, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import AppNavbar from "@/components/AppNavbar.vue";
import AppRouteSkeleton from "@/components/AppRouteSkeleton.vue";
import AppIncomingCallBanner from "@/components/AppIncomingCallBanner.vue";
import AppCallPiP from "@/components/AppCallPiP.vue";
import RelayNudgeBanner from "@/components/RelayNudgeBanner.vue";
import RabtaBottomStatusBar from "@/components/rabta/RabtaBottomStatusBar.vue";

import { callPathForPubkey } from "@/composables/useCallNavigation";

import { shortId } from "@/lib/crypto";
import { logStartupOnce } from "@/lib/startupMetrics";
import { reconcileFromCache, startAppSync, setCallSignalHandler } from "@/lib/sync";
import { useReplicationStore } from "@/stores/replication";
import { useRabtaSyncStore } from "@/stores/rabtaSync";
import { useIdentityStore } from "@/stores/identity";
import { useCallStore } from "@/stores/calls";
import { warmUpAudio } from "@/lib/notifications";
import { routeTransitionName, routeTransitionMode } from "@/composables/useRouteTransition";

const identity = useIdentityStore();
const callStore = useCallStore();
const replicationStore = useReplicationStore();
const rabtaSyncStore = useRabtaSyncStore();

// Mount the independent Rabta server sync worker to root
rabtaSyncStore.initWorker();

onUnmounted(() => {
  replicationStore.stopWorker();
  rabtaSyncStore.stopWorker();
});
const route = useRoute();
const router = useRouter();

const isChatViewRoute = computed(() => route.path.startsWith("/chat"));
const isCallRoute = computed(() => route.path.startsWith("/call/"));
const isFullHeightRoute = computed(() => isCallRoute.value || isChatViewRoute.value);

const showNavbar = computed(() => {
  if (isCallRoute.value) return false;
  return true;
});

const showBottomBar = computed(() => {
  if (isCallRoute.value) return false;
  if (route.path === "/rabta-sync") return false;
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
  replicationStore.startWorker(identity);

  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      // Opening the app is what restarts the 30-hour window; browsing then
      // backgrounding must not look like inactivity.
      void identity.touchVault();
      return;
    }

    // A tab left open for days is not an opened account: re-check the vault
    // TTL on the way back in, and fall back to /welcome if it lapsed.
    void identity.validateVault().then((stillValid) => {
      if (!stillValid) {
        void router.replace({ path: "/welcome", query: { next: route.fullPath } });
      }
    });

    if (Date.now() - hiddenAt > 10_000) {
      void reconcileFromCache(identity);
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
    class="app__block"
    :class="isFullHeightRoute ? 'app__block--variant-1' : 'app__block--variant-2'"
    @click.once="warmUpAudio"
    @keydown.once="warmUpAudio"
  >
    <AppNavbar v-if="showNavbar" />
    <RelayNudgeBanner v-if="showNavbar" />
    <AppIncomingCallBanner v-if="showIncomingBanner" :below-nav="showNavbar" />
    <AppCallPiP v-if="showCallPiP" />

    <div class="app__block-2">
      <!-- Main content -->
      <main
        class="app__main"
        :class="isFullHeightRoute ? 'app__main--variant-1' : 'app__main--variant-2'"
      >
        <RouterView v-slot="{ Component, route: currentRoute }">
          <Suspense :timeout="0">
            <Transition :name="routeTransitionName" :mode="routeTransitionMode">
              <component
                :is="Component"
                :key="currentRoute.fullPath"
                class="app__component"
              />
            </Transition>
            <template #fallback>
              <AppRouteSkeleton
                :kind="currentRoute.meta.skeleton || 'list'"
                :key="`skeleton-${currentRoute.fullPath}`"
              />
            </template>
          </Suspense>
        </RouterView>
      </main>
    </div>

    <!-- Sticky bottom status bar for Rabta mesh sync -->
    <RabtaBottomStatusBar v-if="showBottomBar" />
  </div>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
.app__block {
  position: relative;
}

.app__main {
  position: relative;
}

.app__component {
  position: relative;
}

.app__block {
  isolation: isolate;
}

.app__main {
  isolation: isolate;
}

.app__component {
  isolation: isolate;
}

.app__block {
  display: flex;
}

.app__block-2 {
  display: flex;
}

.app__block--variant-1 {
  height: 100dvh;
}

.app__main--variant-1 {
  height: 100%;
}

.app__component {
  height: 100%;
}

.app__block-2 {
  min-height: 0;
}

.app__main {
  min-height: 0;
}

.app__block--variant-2 {
  min-height: 100dvh;
}

.app__block {
  width: 100%;
}

.app__block-2 {
  width: 100%;
}

.app__main {
  min-width: 0;
}

.app__block-2 {
  flex: 1;
}

.app__main {
  flex: 1;
}

.app__block {
  flex-direction: column;
}

.app__block--variant-1 {
  overflow: hidden;
}

.app__main--variant-1 {
  overflow: hidden;
}

.app__component {
  overflow: hidden;
}

.app__main--variant-2 {
  overflow-y: auto;
}

.app__block {
  background-color: var(--app-bg);
}

.app__block {
  color: var(--app-text);
}

.app__component {
  will-change: transform;
}
}
</style>
