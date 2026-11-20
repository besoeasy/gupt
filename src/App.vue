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
import { VAULT_TTL_MS } from "@/lib/keyVault";
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

let vaultWatchdog = 0;
let hiddenAt = 0;

identity.init().then(() => {
  logStartupOnce("identity-ready", "identity:ready", { pubkey: shortId(identity.pubkeyHex) });
  logStartupOnce("sync-started", "sync:started");
  setCallSignalHandler((row) => callStore.handleSignalRow(row));
  void startAppSync(identity);
  replicationStore.startWorker(identity);
  armVaultWatchdog();

  document.addEventListener("visibilitychange", onVisibilityChange);
  // Any interaction counts as "using the app", which is what the window
  // measures. keyVault throttles the actual write, so this stays cheap.
  document.addEventListener("pointerdown", onVaultActivity, { passive: true });
  document.addEventListener("keydown", onVaultActivity, { passive: true });
  document.addEventListener("wheel", onVaultActivity, { passive: true });
});

function onVaultActivity() {
  void identity.touchVault();
}

function onVisibilityChange() {
  if (document.hidden) {
    hiddenAt = Date.now();
    // Backgrounding counts as activity; browsing then hiding must not look
    // like the window running out.
    void identity.touchVault();
    return;
  }

  // A tab left open for days is not an opened account: re-check the vault
  // window on the way back in, and fall back to /welcome if it lapsed.
  void identity.validateVault().then((stillValid) => {
    if (!stillValid) lockToWelcome();
  });

  if (Date.now() - hiddenAt > 10_000) {
    void reconcileFromCache(identity);
  }
}

function stopVaultWatchdog() {
  if (!vaultWatchdog) return;
  clearInterval(vaultWatchdog);
  vaultWatchdog = 0;
}

function lockToWelcome() {
  stopVaultWatchdog();
  void router.replace({ path: "/welcome", query: { next: route.fullPath } });
}

/**
 * A tab left visible must still lose its account when the window runs out, so
 * check four times per window (30 s – 5 min). The check never writes
 * `lastSeenAt`; only real activity does, or it would keep itself alive.
 */
function armVaultWatchdog() {
  stopVaultWatchdog();
  if (!identity.remembersDevice) return;
  const ttl = identity.vaultTtlMs || VAULT_TTL_MS;
  const every = Math.min(5 * 60 * 1000, Math.max(30 * 1000, ttl / 4));
  vaultWatchdog = setInterval(() => {
    void identity.validateVault({ touch: false }).then((stillValid) => {
      if (!stillValid) lockToWelcome();
    });
  }, every);
}

onUnmounted(() => {
  stopVaultWatchdog();
  document.removeEventListener("visibilitychange", onVisibilityChange);
  document.removeEventListener("pointerdown", onVaultActivity);
  document.removeEventListener("keydown", onVaultActivity);
  document.removeEventListener("wheel", onVaultActivity);
});

watch(
  () => identity.pubkeyHex,
  (pk, prev) => {
    if (!pk || pk === prev) return;
    void startAppSync(identity);
    armVaultWatchdog();
  },
);

// A login inside this page flips this after the vault is written; arming on the
// pubkey alone would run before the vault exists and leave no watchdog.
watch(
  () => identity.remembersDevice,
  (remembers) => {
    if (remembers) armVaultWatchdog();
    else stopVaultWatchdog();
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
