/**
 * Managed long-lived relay subscription with self-healing restart.
 *
 * Handles connect retries (exponential backoff), auto-resubscribe on
 * error/complete, offline/online awareness, and clean teardown — so callers
 * never hand-roll restart logic. `start(observer)` is async and may reject
 * when no relay is reachable; the monitor catches that, backs off, and
 * retries until `shouldRestart()` returns false or `stop()` is called.
 */
export function createLiveSubscription({ start, next, shouldRestart = () => true }) {
  const BASE_RETRY_MS = 1_000;
  const MAX_RETRY_MS = 30_000;

  let rawSub = null;
  let timer = null;
  let retryDelay = BASE_RETRY_MS;
  let stopped = false;
  let running = false;

  function isOnline() {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  function onOnline() {
    if (stopped) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    retryDelay = BASE_RETRY_MS;
    void attempt();
  }

  function scheduleRestart() {
    if (stopped || timer || !shouldRestart()) return;
    timer = setTimeout(() => {
      timer = null;
      if (stopped || !shouldRestart()) return;
      void attempt();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  }

  function handleDown() {
    rawSub = null;
    if (stopped) return;
    scheduleRestart();
  }

  async function attempt() {
    if (stopped || running || !shouldRestart()) return;
    if (!isOnline()) return;

    running = true;
    try {
      rawSub?.unsubscribe?.();
      rawSub = await start({
        next,
        error() {
          handleDown();
        },
        complete() {
          handleDown();
        },
      });
      retryDelay = BASE_RETRY_MS;
    } catch {
      rawSub = null;
      handleDown();
    } finally {
      running = false;
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
  }

  void attempt();

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
      rawSub?.unsubscribe?.();
      rawSub = null;
    },
  };
}
