import { ref, onUnmounted } from "vue";
import { liveSyncTick } from "@/lib/vault";

const LIVE_SYNC_INTERVAL_MS = 15_000;

// Module-level singleton state (shared across all consumers).
// Sync only runs while a vault page is mounted and the tab is visible.
const state = ref({
  active: false,
  lastTickAt: null,
  published: 0,
  errors: 0,
});

let intervalId = null;
let visibilityHandler = null;
let inFlight = false;
let pendingPrivkey = null;
let pendingPubkey = null;

async function runTick() {
  if (inFlight) return;
  if (!pendingPrivkey || !pendingPubkey) return;
  inFlight = true;
  state.value = { ...state.value, active: true };
  try {
    const result = await liveSyncTick(pendingPrivkey, pendingPubkey);
    state.value = {
      active: true,
      lastTickAt: Date.now(),
      published: result.published,
      errors: result.errors,
    };
  } catch (err) {
    console.warn("[vault-live-sync] tick failed:", err);
  } finally {
    inFlight = false;
  }
}

export function useVaultLiveSync() {
  function startLiveSync(privkeyHex, pubkeyHex) {
    pendingPrivkey = privkeyHex;
    pendingPubkey = pubkeyHex;
    if (intervalId) return; // already running

    // Run one tick immediately so the user sees activity without waiting 15s.
    runTick();

    intervalId = setInterval(() => {
      // Skip ticks while the tab is hidden — saves battery and bandwidth.
      if (typeof document !== "undefined" && document.hidden) return;
      runTick();
    }, LIVE_SYNC_INTERVAL_MS);

    // Resume with an immediate tick when the tab becomes visible again.
    visibilityHandler = () => {
      if (typeof document !== "undefined" && !document.hidden) runTick();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", visibilityHandler);
    }
  }

  function stopLiveSync() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
    pendingPrivkey = null;
    pendingPubkey = null;
    state.value = { ...state.value, active: false };
  }

  onUnmounted(stopLiveSync);

  return {
    liveSyncState: state,
    startLiveSync,
    stopLiveSync,
  };
}
