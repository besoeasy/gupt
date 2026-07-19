import { ref, onUnmounted } from "vue";
import { replicationTick } from "@/lib/replication";
import { clearDecryptCache } from "@/lib/decryptCache";

const BASE_INTERVAL_MS = 15_000;
const MAX_INTERVAL_MS = 120_000;
const HISTORY_CAP = 5;
const FAILURE_THRESHOLD = 0.8;

const state = ref({
  active: false,
  lastTickAt: null,
  published: 0,
  errors: 0,
  history: [],
});

/** Read-only state for components that just want to observe, not manage lifecycle. */
export const replicationState = state;

let intervalId = null;
let visibilityHandler = null;
let onlineHandler = null;
let inFlight = false;
let currentIntervalMs = BASE_INTERVAL_MS;
let consecutiveFailures = 0;

function getEffectiveInterval() {
  const connection =
    typeof navigator !== "undefined" && navigator.connection
      ? navigator.connection
      : null;
  if (connection && connection.saveData) return currentIntervalMs * 3;
  return currentIntervalMs;
}

function scheduleNext() {
  if (intervalId) clearInterval(intervalId);
  const ms = getEffectiveInterval();
  intervalId = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    runTick();
  }, ms);
}

function applyBackoff(published, errors) {
  const total = published + errors;
  if (total > 0 && errors / total > FAILURE_THRESHOLD) {
    consecutiveFailures++;
    if (currentIntervalMs < MAX_INTERVAL_MS) {
      currentIntervalMs = Math.min(currentIntervalMs * 2, MAX_INTERVAL_MS);
      scheduleNext();
    }
  } else if (published > 0) {
    consecutiveFailures = 0;
    if (currentIntervalMs !== BASE_INTERVAL_MS) {
      currentIntervalMs = BASE_INTERVAL_MS;
      scheduleNext();
    }
  }
}

async function runTick() {
  if (inFlight) return;
  inFlight = true;
  state.value = { ...state.value, active: true };
  try {
    const result = await replicationTick();
    const entry = {
      published: result.published,
      errors: result.errors,
      at: Date.now(),
      ok: result.errors === 0,
    };
    const history = [...state.value.history, entry].slice(-HISTORY_CAP);
    state.value = {
      active: true,
      lastTickAt: entry.at,
      published: entry.published,
      errors: entry.errors,
      history,
    };
    applyBackoff(result.published, result.errors);
  } catch (err) {
    console.warn("[replication] tick failed:", err);
    const entry = { published: 0, errors: 1, at: Date.now(), ok: false };
    const history = [...state.value.history, entry].slice(-HISTORY_CAP);
    state.value = { ...state.value, lastTickAt: entry.at, history };
    applyBackoff(0, 1);
  } finally {
    inFlight = false;
  }
}

export function useReplicationWorker() {
  function startWorker() {
    if (intervalId) return;
    currentIntervalMs = BASE_INTERVAL_MS;
    consecutiveFailures = 0;
    runTick();
    scheduleNext();

    visibilityHandler = () => {
      if (typeof document !== "undefined" && !document.hidden) runTick();
    };
    onlineHandler = () => runTick();
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
    state.value = { ...state.value, active: false };
    clearDecryptCache();
  }

  onUnmounted(stopWorker);

  return {
    replicationState: state,
    startWorker,
    stopWorker,
  };
}
