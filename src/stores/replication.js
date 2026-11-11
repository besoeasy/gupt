import { ref, watch } from "vue";
import { defineStore } from "pinia";
import { requestEngineSync } from "@/lib/engine";
import { clearDecryptCache } from "@/lib/decryptCache";
import { useSettingsStore } from "@/stores/settings";
import { useIdentityStore } from "@/stores/identity";
import { getBookmarksCached, renewExpiringBookmarks } from "@/lib/bookmarks";
import { getNotesCached, renewExpiringNotes } from "@/lib/notes";
import { getPasswordsCached, renewExpiringPasswords } from "@/lib/passwords";

const BASE_INTERVAL_MS = 15_000;
const MAX_INTERVAL_MS = 120_000;
const HISTORY_CAP = 5;
const FAILURE_THRESHOLD = 0.8;
const JITTER_RATIO = 0.25;

let intervalId = null;
let visibilityHandler = null;
let onlineHandler = null;
let inFlight = false;
let currentIntervalMs = BASE_INTERVAL_MS;
let consecutiveFailures = 0;

export const useReplicationStore = defineStore("replication", () => {
  const active = ref(false);
  const lastTickAt = ref(null);
  const published = ref(0);
  const errors = ref(0);
  const history = ref([]);

  const settingsStore = useSettingsStore();
  const identityStore = useIdentityStore();

  function getEffectiveInterval() {
    const connection =
      typeof navigator !== "undefined" && navigator.connection ? navigator.connection : null;
    if (connection && connection.saveData) return currentIntervalMs * 3;
    return currentIntervalMs;
  }

  function jitter(ms) {
    const spread = ms * JITTER_RATIO;
    return ms + (Math.random() * 2 - 1) * spread;
  }

  function scheduleNext(identity) {
    if (intervalId) clearInterval(intervalId);
    const ms = jitter(getEffectiveInterval());
    intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      runMaintenance(identity);
    }, ms);
  }

  function applyBackoff(identity, publishedCount, errorCount) {
    const total = publishedCount + errorCount;
    if (total > 0 && errorCount / total > FAILURE_THRESHOLD) {
      consecutiveFailures++;
      if (currentIntervalMs < MAX_INTERVAL_MS) {
        currentIntervalMs = Math.min(currentIntervalMs * 2, MAX_INTERVAL_MS);
        scheduleNext(identity);
      }
    } else if (publishedCount > 0) {
      consecutiveFailures = 0;
      if (currentIntervalMs !== BASE_INTERVAL_MS) {
        currentIntervalMs = BASE_INTERVAL_MS;
        scheduleNext(identity);
      }
    }
  }

  // Vault events expire on relays, so the oldest live items get re-encrypted
  // and republished through the engine well before their TTL runs out.
  async function renewStreams(identity) {
    if (!identity?.pubkeyHex) return { renewed: 0, errors: 0 };
    const { privkeyHex, pubkeyHex } = identity;
    const streams = [
      [getBookmarksCached, renewExpiringBookmarks],
      [getNotesCached, renewExpiringNotes],
      [getPasswordsCached, renewExpiringPasswords],
    ];
    let renewed = 0;
    let errorCount = 0;
    for (const [getCached, renewExpiring] of streams) {
      try {
        const cached = await getCached(privkeyHex, pubkeyHex);
        if (cached?.items?.length) {
          const res = await renewExpiring(privkeyHex, pubkeyHex, cached.items);
          renewed += res?.renewedCount || 0;
        }
      } catch (err) {
        console.warn("[maintenance] stream renewal failed:", err);
        errorCount++;
      }
    }
    return { renewed, errors: errorCount };
  }

  async function runMaintenance(identity) {
    if (!identity) throw new Error("[maintenance] run requires the identity store.");
    if (inFlight) return;
    inFlight = true;
    active.value = true;
    try {
      const result = await renewStreams(identity);
      const entry = {
        published: result.renewed,
        errors: result.errors,
        at: Date.now(),
        ok: result.errors === 0,
      };
      history.value = [...history.value, entry].slice(-HISTORY_CAP);
      lastTickAt.value = entry.at;
      published.value = entry.published;
      errors.value = entry.errors;
      applyBackoff(identity, entry.published, entry.errors);
    } catch (err) {
      console.warn("[maintenance] tick failed:", err);
      const entry = { published: 0, errors: 1, at: Date.now(), ok: false };
      history.value = [...history.value, entry].slice(-HISTORY_CAP);
      lastTickAt.value = entry.at;
      applyBackoff(identity, 0, 1);
    } finally {
      inFlight = false;
    }
  }

  function startWorker(identity) {
    if (!identity) throw new Error("[maintenance] startWorker requires the identity store.");
    if (!settingsStore.replicationEnabled) return;
    if (intervalId) return;
    currentIntervalMs = BASE_INTERVAL_MS;
    consecutiveFailures = 0;
    runMaintenance(identity);
    scheduleNext(identity);

    visibilityHandler = () => {
      if (typeof document !== "undefined" && !document.hidden && settingsStore.replicationEnabled) {
        runMaintenance(identity);
      }
    };
    onlineHandler = () => {
      if (settingsStore.replicationEnabled) runMaintenance(identity);
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", visibilityHandler);
      window.addEventListener("online", onlineHandler);
    }
  }

  function stopWorker() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (typeof document !== "undefined") {
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
        visibilityHandler = null;
      }
      if (onlineHandler) {
        window.removeEventListener("online", onlineHandler);
        onlineHandler = null;
      }
    }
    currentIntervalMs = BASE_INTERVAL_MS;
    consecutiveFailures = 0;
    active.value = false;
    clearDecryptCache();
  }

  async function triggerSyncNow(identity) {
    if (!identity) throw new Error("[maintenance] sync requires the identity store.");
    await requestEngineSync({ timeoutMs: 30000, reconcile: true });
    await runMaintenance(identity);
  }

  watch(
    () => settingsStore.replicationEnabled,
    (enabled) => {
      if (enabled) {
        startWorker(identityStore);
      } else {
        stopWorker();
      }
    },
  );

  return {
    active,
    lastTickAt,
    published,
    errors,
    history,
    startWorker,
    stopWorker,
    triggerSyncNow,
  };
});
