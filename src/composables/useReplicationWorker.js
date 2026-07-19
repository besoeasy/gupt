import { ref, onUnmounted } from "vue";
import { replicationTick } from "@/lib/replication";
import { clearDecryptCache } from "@/lib/decryptCache";

const REPLICATION_INTERVAL_MS = 15_000;

const state = ref({
  active: false,
  lastTickAt: null,
  published: 0,
  errors: 0,
});

let intervalId = null;
let visibilityHandler = null;
let inFlight = false;

async function runTick() {
  if (inFlight) return;
  inFlight = true;
  state.value = { ...state.value, active: true };
  try {
    const result = await replicationTick();
    state.value = {
      active: true,
      lastTickAt: Date.now(),
      published: result.published,
      errors: result.errors,
    };
  } catch (err) {
    console.warn("[replication] tick failed:", err);
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
