import { ref, shallowRef, onUnmounted } from "vue";
import { deepSyncVault, getLastDeepSyncAt } from "@/lib/vault";

const DEEP_SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// Module-level singleton state (shared across all consumers)
const state = ref({
  active: false,
  round: 0,
  batch: 0,
  totalRounds: 7,
  totalBatches: 4,
  published: 0,
  errors: 0,
  done: false,
  lastSyncAt: getLastDeepSyncAt(),
});

let activeController = null;

export function useVaultDeepSync() {
  async function startDeepSync(privkeyHex, pubkeyHex, { force = false } = {}) {
    // Skip if already running
    if (state.value.active) return;

    // Skip if last sync was < 24h ago (unless forced)
    if (!force && state.value.lastSyncAt && Date.now() - state.value.lastSyncAt < DEEP_SYNC_COOLDOWN_MS) {
      return;
    }

    // Cancel any previous controller
    if (activeController) activeController.abort();
    const controller = new AbortController();
    activeController = controller;

    state.value = {
      active: true,
      round: 0,
      batch: 0,
      totalRounds: 7,
      totalBatches: 4,
      published: 0,
      errors: 0,
      done: false,
      lastSyncAt: state.value.lastSyncAt,
    };

    try {
      await deepSyncVault(privkeyHex, pubkeyHex, {
        signal: controller.signal,
        onProgress(progress) {
          state.value = {
            ...state.value,
            round: progress.round,
            batch: progress.batch,
            published: progress.published,
            errors: progress.errors,
            done: progress.done,
            active: !progress.done,
            lastSyncAt: progress.done ? Date.now() : state.value.lastSyncAt,
          };
        },
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("[vault-deep-sync] failed:", err);
        state.value = { ...state.value, active: false, done: true };
      }
    } finally {
      activeController = null;
    }
  }

  function cancelDeepSync() {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    state.value = { ...state.value, active: false };
  }

  return {
    deepSyncState: state,
    startDeepSync,
    cancelDeepSync,
  };
}
