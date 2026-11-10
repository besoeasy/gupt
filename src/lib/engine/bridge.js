// Main-thread bridge to the replication worker: spawns it, feeds it identity
// + relay config, surfaces logs, and fans worker events into the app.
import { DEFAULT_RELAYS, readConfiguredRelays } from "@/config/servers.js";
import { debugLog } from "@/lib/debugLog.js";
import { notifyRelayAck, setOutboxNotifier, setSyncRequester } from "@/lib/engine/index.js";

let worker = null;
let currentPubkey = null;
let relayListenerAttached = false;
const ingestedListeners = new Set();
const ackedListeners = new Set();
const summaryListeners = new Set();

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("../../workers/replication.worker.js", import.meta.url), {
    type: "module",
    name: "gupt-rabta-engine",
  });
  worker.onmessage = (msg) => {
    const { type } = msg?.data || {};
    if (type === "log") {
      debugLog(`[engine] ${msg.data.msg}`);
    } else if (type === "summary") {
      const s = msg.data;
      debugLog(
        `[engine] cycle ${s.cycle}: pushed=${s.pushedEvents} pulled=${s.pulledEvents} blobs=${s.pushedBlobs}+${s.pulledBlobs || 0} errors=${s.errors?.length || 0} ${s.durationMs}ms`,
      );
      if (s.errors?.length) {
        for (const err of s.errors) debugLog(`[engine] error: ${err}`);
      }
      for (const listener of summaryListeners) {
        try {
          listener(s);
        } catch {}
      }
    } else if (type === "ingested") {
      for (const listener of ingestedListeners) {
        try {
          listener(msg.data.ids || []);
        } catch {}
      }
    } else if (type === "acked") {
      const ids = msg.data.ids || [];
      debugLog(`[engine] acked ${ids.map((id) => String(id).slice(0, 8)).join(",")}`);
      for (const id of ids) notifyRelayAck(id);
      for (const listener of ackedListeners) {
        try {
          listener(ids);
        } catch {}
      }
    }
  };
  worker.onerror = (err) => {
    debugLog(`[engine] worker error: ${err?.message || err}`);
  };
  return worker;
}

export function syncWorkerConfig(pubkeyHex) {
  const pubkey = String(pubkeyHex || "").toLowerCase();
  if (!pubkey) return;
  // An in-flight cycle holds the previous identity's store; kill it so a
  // switched account can never push the old account's rows.
  if (worker && currentPubkey && currentPubkey !== pubkey) {
    worker.postMessage({ type: "stop" });
    worker.terminate();
    worker = null;
  }
  currentPubkey = pubkey;
  const configured = readConfiguredRelays();
  const relays = configured.length ? configured : [...DEFAULT_RELAYS];
  ensureWorker().postMessage({
    type: "config",
    pubkeyHex: pubkey,
    relays,
  });
}

/** Nudge the worker immediately after a local publish. */
export function wakeEngine() {
  if (!currentPubkey) return;
  ensureWorker().postMessage({ type: "tick" });
}

export function onEngineIngested(listener) {
  ingestedListeners.add(listener);
  return () => ingestedListeners.delete(listener);
}

export function onEngineAcked(listener) {
  ackedListeners.add(listener);
  return () => ackedListeners.delete(listener);
}

export function onEngineSummary(listener) {
  summaryListeners.add(listener);
  return () => summaryListeners.delete(listener);
}

/** Wake the worker and resolve after the next completed sync cycle. */
export function requestEngineSync({ timeoutMs = 20000 } = {}) {
  if (!currentPubkey) return Promise.resolve(false);
  return new Promise((resolve) => {
    let timer = null;
    const unsubscribe = onEngineSummary(() => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
    timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    wakeEngine();
  });
}

export function startEngineBridge(pubkeyHex) {
  setOutboxNotifier(wakeEngine);
  setSyncRequester(requestEngineSync);
  syncWorkerConfig(pubkeyHex);
  if (typeof window !== "undefined" && !relayListenerAttached) {
    relayListenerAttached = true;
    window.addEventListener("gupt:relays-changed", onRelaysChanged);
  }
  return stopEngineBridge;
}

function onRelaysChanged() {
  if (currentPubkey) syncWorkerConfig(currentPubkey);
}

export function stopEngineBridge() {
  if (typeof window !== "undefined" && relayListenerAttached) {
    relayListenerAttached = false;
    window.removeEventListener("gupt:relays-changed", onRelaysChanged);
  }
  setOutboxNotifier(null);
  setSyncRequester(null);
  ingestedListeners.clear();
  ackedListeners.clear();
  summaryListeners.clear();
  if (worker) {
    worker.postMessage({ type: "stop" });
    worker.terminate();
    worker = null;
  }
  currentPubkey = null;
}
