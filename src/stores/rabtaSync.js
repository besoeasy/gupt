import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { readConfiguredRelays, saveConfiguredRelays } from "@/config/servers";
import {
  queryRabtaPool,
  fetchEventFromPool,
  getPoolSummary,
  calculateWorkerBackoffDelay,
  BASE_WORKER_RESTART_DELAY_MS,
  MAX_WORKER_RESTART_DELAY_MS,
} from "@/lib/rabta/pool";
import { useIdentityStore } from "@/stores/identity";

export { calculateWorkerBackoffDelay, BASE_WORKER_RESTART_DELAY_MS, MAX_WORKER_RESTART_DELAY_MS };

export const useRabtaSyncStore = defineStore("rabtaSync", () => {
  const identityStore = useIdentityStore();
  const status = ref("idle"); // 'idle' | 'syncing' | 'synced' | 'paused' | 'offline' | 'error'
  const isAutoSync = ref(true);
  const syncIntervalSec = ref(30);
  const nextWaitSec = ref(null);
  const nextSyncAt = ref(null);
  const maxEventsPerRun = ref(50);
  const maxBudgetPerRun = ref(50);
  const budgetUsed = ref(0);
  const syncHistory = ref([]);
  const lastSyncAt = ref(null);
  const round = ref(0);
  const eventsSynced = ref(0);
  const blobsSynced = ref(0);
  const blobsSkippedQuota = ref(0);
  const blobsResumed = ref(0);
  const totalEventsSynced = ref(0);
  const totalBlobsSynced = ref(0);
  const totalBlobsSkippedQuota = ref(0);
  const totalBlobsResumed = ref(0);
  const totalDistinctEvents = ref(0);
  const ourTotalEvents = ref(0);
  const ourOutboundEvents = ref(0);
  const ourInboundEvents = ref(0);
  const consistencyPct = ref(100);
  const durationMs = ref(0);
  const servers = ref([]);
  const logs = ref([]);
  const lastError = ref(null);
  const crashCount = ref(0);
  const restartCountdown = ref(null);
  let restartTimer = null;
  let countdownInterval = null;
  let areGlobalListenersAttached = false;
  const bisection = ref({
    probesUsed: 0,
    rangesMatched: 0,
    rangesBisected: 0,
    leafReconciled: 0,
    blobsSkippedQuota: 0,
    blobsResumed: 0,
    batteryBackoffs: 0,
  });

  let worker = null;
  let isInitialized = false;

  const totalServers = computed(() => {
    if (servers.value.length) return servers.value.length;
    return readConfiguredRelays().length;
  });

  const onlineServers = computed(() => servers.value.filter((s) => s.online).length);

  const isSyncing = computed(() => status.value === "syncing");

  const navbarStatusText = computed(() => {
    if (status.value === "syncing") return "Syncing…";
    if (status.value === "paused") return "Paused";
    if (status.value === "offline") return "Offline";
    if (status.value === "error") return "Error";
    const online = onlineServers.value;
    const total = totalServers.value;
    return `Rabta ${online}/${total}`;
  });

  const navbarStatusColor = computed(() => {
    if (status.value === "syncing") return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    if (status.value === "offline" || status.value === "error")
      return "text-red-400 bg-red-500/10 border-red-500/30";
    if (status.value === "paused") return "text-zinc-400 bg-zinc-800/60 border-zinc-700/50";
    return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  });

  function appendLog(entry) {
    logs.value = [
      {
        id: Math.random().toString(36).slice(2, 9),
        timestamp: entry.timestamp || Date.now(),
        message: entry.message || String(entry),
        level: entry.level || "info",
      },
      ...logs.value.slice(0, 99),
    ];
  }

  function clearRestartTimer() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    restartCountdown.value = null;
  }

  function scheduleWorkerRestart() {
    clearRestartTimer();
    crashCount.value++;
    const delayMs = calculateWorkerBackoffDelay(crashCount.value);
    const delaySec = Math.max(1, Math.round(delayMs / 1000));
    restartCountdown.value = delaySec;

    appendLog({
      message: `Worker crash/failure detected (crash #${crashCount.value}). Auto-recovering in ${delaySec}s...`,
      level: "warn",
    });

    countdownInterval = setInterval(() => {
      if (restartCountdown.value && restartCountdown.value > 1) {
        restartCountdown.value--;
      } else {
        restartCountdown.value = null;
      }
    }, 1000);

    restartTimer = setTimeout(() => {
      clearRestartTimer();
      restartWorker();
    }, delayMs);
  }

  function restartWorker() {
    clearRestartTimer();
    appendLog({
      message: `Re-instantiating fresh Rabta sync worker thread (recovery attempt #${crashCount.value || 1})...`,
      level: "info",
    });

    if (worker) {
      try {
        worker.terminate();
      } catch (err) {
        console.warn("[rabta-sync] error terminating worker during restart:", err);
      }
      worker = null;
    }
    isInitialized = false;
    status.value = "idle";
    initWorker();
  }

  function restartWorkerNow() {
    clearRestartTimer();
    restartWorker();
    triggerSyncNow();
  }

  function setupGlobalListeners() {
    if (areGlobalListenersAttached) return;
    areGlobalListenersAttached = true;

    watch(
      () => identityStore.pubkeyHex,
      (newPubkey) => {
        if (worker) {
          worker.postMessage({
            type: "config",
            config: {
              selfPubkey: newPubkey || null,
            },
          });
        }
      },
    );

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (worker) {
          worker.postMessage({
            type: "visibility",
            hidden: document.hidden,
          });
        }
      });
    }
  }

  function initWorker() {
    if (isInitialized) return;
    if (typeof Worker === "undefined") return;

    try {
      worker = new Worker(new URL("../workers/rabta-sync.worker.js", import.meta.url), {
        type: "module",
      });

      worker.onerror = (err) => {
        console.error("[rabta-sync] worker runtime error event:", err);
        const errMsg = err?.message || "Worker thread crashed";
        status.value = "error";
        lastError.value = errMsg;
        appendLog({
          message: `Worker thread fatal crash: ${errMsg}`,
          level: "error",
        });
        scheduleWorkerRestart();
      };

      worker.onmessage = (event) => {
        const { type, ...payload } = event.data || {};

        if (type === "status") {
          status.value = payload.status || "idle";
          if (status.value === "syncing") {
            nextWaitSec.value = null;
            nextSyncAt.value = null;
          }
          if (payload.error) {
            lastError.value = payload.error;
            scheduleWorkerRestart();
          } else if (payload.status === "synced" || payload.status === "idle") {
            if (crashCount.value > 0) {
              appendLog({
                message: `Rabta sync worker recovered successfully after ${crashCount.value} failure(s).`,
                level: "info",
              });
              crashCount.value = 0;
            }
            clearRestartTimer();
            lastError.value = null;
          }
        } else if (type === "scheduled") {
          nextWaitSec.value = payload.nextWaitSec || null;
          nextSyncAt.value = payload.nextWaitMs ? Date.now() + payload.nextWaitMs : null;
        } else if (type === "summary") {
          if (crashCount.value > 0) {
            appendLog({
              message: `Rabta sync worker recovered successfully after ${crashCount.value} failure(s).`,
              level: "info",
            });
            crashCount.value = 0;
          }
          clearRestartTimer();
          lastError.value = null;

          const summary = payload.summary || payload;
          round.value = summary.round || round.value;
          durationMs.value = summary.durationMs || 0;
          eventsSynced.value = summary.eventsSynced || 0;
          budgetUsed.value = summary.budgetUsed || 0;
          blobsSynced.value = summary.blobsSynced || 0;
          blobsSkippedQuota.value = summary.blobsSkippedQuota || 0;
          blobsResumed.value = summary.blobsResumed || 0;
          totalEventsSynced.value = summary.totalEventsSynced || totalEventsSynced.value;
          totalBlobsSynced.value = summary.totalBlobsSynced || totalBlobsSynced.value;
          totalBlobsSkippedQuota.value =
            summary.totalBlobsSkippedQuota !== undefined
              ? summary.totalBlobsSkippedQuota
              : totalBlobsSkippedQuota.value;
          totalBlobsResumed.value =
            summary.totalBlobsResumed !== undefined
              ? summary.totalBlobsResumed
              : totalBlobsResumed.value;
          totalDistinctEvents.value = summary.totalDistinctEvents || totalDistinctEvents.value;
          ourTotalEvents.value =
            summary.ourTotalEvents !== undefined
              ? summary.ourTotalEvents
              : (summary.totalDistinctEvents || ourTotalEvents.value);
          ourOutboundEvents.value =
            summary.ourOutboundEvents !== undefined
              ? summary.ourOutboundEvents
              : ourOutboundEvents.value;
          ourInboundEvents.value =
            summary.ourInboundEvents !== undefined
              ? summary.ourInboundEvents
              : ourInboundEvents.value;
          consistencyPct.value =
            summary.consistencyPct !== undefined ? summary.consistencyPct : consistencyPct.value;
          if (Array.isArray(summary.servers)) {
            servers.value = summary.servers;
          }
          if (summary.bisection) {
            bisection.value = { ...summary.bisection };
          }
          const itemRound = summary.round || round.value || 0;
          const histItem = {
            round: itemRound,
            timestamp: Date.now(),
            budgetUsed: summary.budgetUsed || 0,
            maxBudget: summary.maxBudget || maxBudgetPerRun.value || 50,
            eventsSynced: summary.eventsSynced || 0,
            blobsSynced: summary.blobsSynced || 0,
            durationMs: summary.durationMs || 0,
          };
          const existingIdx = syncHistory.value.findIndex(
            (h) => h.round === itemRound && itemRound > 0,
          );
          if (existingIdx >= 0) {
            syncHistory.value[existingIdx] = histItem;
          } else {
            syncHistory.value = [...syncHistory.value.slice(-19), histItem];
          }
          lastSyncAt.value = Date.now();
        } else if (type === "log") {
          appendLog(payload);
        }
      };

      // Push initial configuration including active user identity
      const currentRelays = readConfiguredRelays();
      worker.postMessage({
        type: "config",
        config: {
          relays: currentRelays,
          intervalMs: syncIntervalSec.value * 1000,
          autoSync: isAutoSync.value,
          selfPubkey: identityStore.pubkeyHex || null,
        },
      });

      setupGlobalListeners();

      isInitialized = true;
      appendLog({ message: "Independent Rabta sync worker initialized", level: "info" });
    } catch (err) {
      console.warn("[rabta-sync] failed to initialize worker:", err);
      status.value = "error";
      lastError.value = err?.message || "Worker initialization failed";
      scheduleWorkerRestart();
    }
  }

  function triggerSyncNow() {
    clearRestartTimer();
    if (!worker || status.value === "error") {
      restartWorker();
    }
    if (worker) {
      status.value = "syncing";
      worker.postMessage({ type: "sync-now", forceAll: true });
      appendLog({ message: "Manual sync cycle triggered by user (bypassing battery backoff)", level: "info" });
    }
  }

  function toggleAutoSync() {
    isAutoSync.value = !isAutoSync.value;
    if (worker) {
      worker.postMessage({ type: isAutoSync.value ? "resume" : "pause" });
    }
  }

  function setSyncInterval(sec) {
    const s = Math.max(5, Math.min(600, Number(sec) || 30));
    syncIntervalSec.value = s;
    if (worker) {
      worker.postMessage({
        type: "config",
        config: {
          relays: readConfiguredRelays(),
          intervalMs: s * 1000,
          autoSync: isAutoSync.value,
          selfPubkey: identityStore.pubkeyHex || null,
        },
      });
    }
  }

  function addServer(url) {
    if (!url) return;
    const list = readConfiguredRelays();
    if (!list.includes(url)) {
      list.push(url);
      saveConfiguredRelays(list);
      if (worker) {
        worker.postMessage({
          type: "config",
          config: { relays: list, selfPubkey: identityStore.pubkeyHex || null },
        });
      }
      appendLog({ message: `Added new Rabta server: ${url}`, level: "info" });
    }
  }

  function removeServer(url) {
    const list = readConfiguredRelays().filter((r) => r !== url);
    saveConfiguredRelays(list);
    if (worker) {
      worker.postMessage({
        type: "config",
        config: { relays: list, selfPubkey: identityStore.pubkeyHex || null },
      });
    }
    appendLog({ message: `Removed Rabta server: ${url}`, level: "info" });
  }

  function stopWorker() {
    clearRestartTimer();
    if (worker) {
      worker.postMessage({ type: "stop" });
      try {
        worker.terminate();
      } catch {}
      worker = null;
      isInitialized = false;
      status.value = "idle";
    }
  }

  function reset() {
    clearRestartTimer();
    crashCount.value = 0;
    round.value = 0;
    eventsSynced.value = 0;
    blobsSynced.value = 0;
    blobsSkippedQuota.value = 0;
    blobsResumed.value = 0;
    totalEventsSynced.value = 0;
    totalBlobsSynced.value = 0;
    totalBlobsSkippedQuota.value = 0;
    totalBlobsResumed.value = 0;
    totalDistinctEvents.value = 0;
    ourTotalEvents.value = 0;
    ourOutboundEvents.value = 0;
    ourInboundEvents.value = 0;
    consistencyPct.value = 100;
    durationMs.value = 0;
    servers.value = [];
    logs.value = [];
    syncHistory.value = [];
    lastError.value = null;
    lastSyncAt.value = null;
    nextWaitSec.value = null;
    nextSyncAt.value = null;
    status.value = "idle";
    bisection.value = {
      probesUsed: 0,
      rangesMatched: 0,
      rangesBisected: 0,
      leafReconciled: 0,
      blobsSkippedQuota: 0,
      blobsResumed: 0,
      batteryBackoffs: 0,
    };
    if (worker) {
      worker.postMessage({ type: "reset" });
    }
  }

  // Direct pool query helper
  async function queryPool(params) {
    return queryRabtaPool(params, readConfiguredRelays());
  }

  const displayOurTotalEvents = computed(() => {
    if (ourTotalEvents.value > 0) return ourTotalEvents.value;
    if (servers.value.length) {
      return Math.max(...servers.value.map((s) => s.userEvents || 0), 0);
    }
    return 0;
  });

  return {
    status,
    isAutoSync,
    syncIntervalSec,
    nextWaitSec,
    nextSyncAt,
    maxEventsPerRun,
    maxBudgetPerRun,
    budgetUsed,
    syncHistory,
    lastSyncAt,
    round,
    eventsSynced,
    blobsSynced,
    blobsSkippedQuota,
    blobsResumed,
    totalEventsSynced,
    totalBlobsSynced,
    totalBlobsSkippedQuota,
    totalBlobsResumed,
    totalDistinctEvents,
    ourTotalEvents: displayOurTotalEvents,
    ourOutboundEvents,
    ourInboundEvents,
    consistencyPct,
    durationMs,
    servers,
    logs,
    lastError,
    crashCount,
    restartCountdown,
    bisection,
    totalServers,
    onlineServers,
    isSyncing,
    navbarStatusText,
    navbarStatusColor,
    initWorker,
    triggerSyncNow,
    restartWorkerNow,
    toggleAutoSync,
    setSyncInterval,
    addServer,
    removeServer,
    stopWorker,
    reset,
    queryPool,
    clearLogs: () => {
      logs.value = [];
    },
  };
});
