import { ref, watch } from "vue";
import { defineStore } from "pinia";
import { replicationTick } from "@/lib/replication";
import { clearDecryptCache } from "@/lib/decryptCache";
import { pendingCount } from "@/lib/sendQueue";
import { useSettingsStore } from "@/stores/settings";

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

  function scheduleNext() {
    if (intervalId) clearInterval(intervalId);
    const ms = jitter(getEffectiveInterval());
    intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      runTick();
    }, ms);
  }

  function applyBackoff(publishedCount, errorCount) {
    const total = publishedCount + errorCount;
    if (total > 0 && errorCount / total > FAILURE_THRESHOLD) {
      consecutiveFailures++;
      if (currentIntervalMs < MAX_INTERVAL_MS) {
        currentIntervalMs = Math.min(currentIntervalMs * 2, MAX_INTERVAL_MS);
        scheduleNext();
      }
    } else if (publishedCount > 0) {
      consecutiveFailures = 0;
      if (currentIntervalMs !== BASE_INTERVAL_MS) {
        currentIntervalMs = BASE_INTERVAL_MS;
        scheduleNext();
      }
    }
  }

  async function runTick() {
    if (inFlight) return;
    if (pendingCount.value > 0) {
      console.info("[replication] skipped — send queue has", pendingCount.value, "pending task(s)");
      return;
    }
    inFlight = true;
    active.value = true;
    try {
      const result = await replicationTick();
      const entry = {
        published: result.published,
        errors: result.errors,
        at: Date.now(),
        ok: result.errors === 0,
      };
      history.value = [...history.value, entry].slice(-HISTORY_CAP);
      lastTickAt.value = entry.at;
      published.value = entry.published;
      errors.value = entry.errors;
      applyBackoff(result.published, result.errors);
    } catch (err) {
      console.warn("[replication] tick failed:", err);
      const entry = { published: 0, errors: 1, at: Date.now(), ok: false };
      history.value = [...history.value, entry].slice(-HISTORY_CAP);
      lastTickAt.value = entry.at;
      applyBackoff(0, 1);
    } finally {
      inFlight = false;
    }
  }

  function startWorker() {
    if (!settingsStore.replicationEnabled) return;
    if (intervalId) return;
    currentIntervalMs = BASE_INTERVAL_MS;
    consecutiveFailures = 0;
    runTick();
    scheduleNext();

    visibilityHandler = () => {
      if (typeof document !== "undefined" && !document.hidden && settingsStore.replicationEnabled) {
        runTick();
      }
    };
    onlineHandler = () => {
      if (settingsStore.replicationEnabled) runTick();
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

  watch(
    () => settingsStore.replicationEnabled,
    (enabled) => {
      if (enabled) {
        startWorker();
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
    triggerReplicationTick: runTick,
  };
});
