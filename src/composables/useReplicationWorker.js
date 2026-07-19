import { ref, onUnmounted } from "vue";
import { replicationTick } from "@/lib/replication";
import { clearDecryptCache } from "@/lib/decryptCache";

const REPLICATION_INTERVAL_MS = 15_000;
const HISTORY_CAP = 5;

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
let inFlight = false;

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
  } catch (err) {
    console.warn("[replication] tick failed:", err);
    const entry = { published: 0, errors: 1, at: Date.now(), ok: false };
    const history = [...state.value.history, entry].slice(-HISTORY_CAP);
    state.value = { ...state.value, lastTickAt: entry.at, history };
  } finally {
    inFlight = false;
  }
}

export function useReplicationWorker() {
  function startWorker() {
    if (intervalId) return;
    runTick();

    intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      runTick();
    }, REPLICATION_INTERVAL_MS);

    visibilityHandler = () => {
      if (typeof document !== "undefined" && !document.hidden) runTick();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", visibilityHandler);
    }
  }

  function stopWorker() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
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
