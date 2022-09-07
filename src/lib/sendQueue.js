/**
 * sendQueue — standardized outbound message engine with serial queueing,
 * exponential back-off retries, timing metrics, and structured debug logs.
 *
 * Behaviour:
 *   - Each task is retried with exponential back-off (1 s → 2 s → 4 s … up to
 *     MAX_DELAY_MS) for up to MAX_ATTEMPTS total tries.
 *   - When the browser reports it is back online the queue drains immediately.
 *   - Tasks run one at a time (serial) so ordering is preserved per conversation.
 *   - Per-attempt and end-to-end timings are persisted for avg/min/max stats.
 */

const LOG_PREFIX = "[gupt-send]";

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 8;

/** @typedef {{
 *   kind?: "dm" | "group",
 *   conversationId?: string,
 *   messageType?: string,
 * }} SendMeta */

/** @typedef {{
 *   id: string,
 *   fn: () => Promise<any>,
 *   attempts: number,
 *   enqueuedAt: number,
 *   attemptDurations: number[],
 *   meta: SendMeta,
 *   onFailed: (err: Error) => void,
 *   onSuccess?: () => void,
 * }} Task */

/** @type {Task[]} */
const queue = [];
let running = false;
let retryTimer = null;

function log(level, event, detail = {}) {
  const payload = { t: Date.now(), ...detail };
  if (level === "error") console.error(`${LOG_PREFIX} ${event}`, payload);
  else if (level === "warn") console.warn(`${LOG_PREFIX} ${event}`, payload);
  else console.info(`${LOG_PREFIX} ${event}`, payload);
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function retryDelayMs(attempts) {
  return Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
}

function normalizeMeta(meta = {}) {
  return {
    kind: meta.kind === "group" ? "group" : "dm",
    conversationId: String(meta.conversationId || ""),
    messageType: String(meta.messageType || ""),
  };
}

async function persistTiming(task, outcome, lastError = "") {
  const completedAt = Date.now();
  try {
    const { recordSendTiming } = await import("@/lib/idb");
    await recordSendTiming({
      id: task.id,
      kind: task.meta.kind,
      conversationId: task.meta.conversationId,
      messageType: task.meta.messageType,
      enqueuedAt: task.enqueuedAt,
      completedAt,
      responseMs: completedAt - task.enqueuedAt,
      attempts: task.attempts,
      outcome,
      attemptDurations: task.attemptDurations.slice(),
      lastError,
    });
  } catch (err) {
    log("warn", "timing-persist-failed", {
      id: task.id,
      error: err instanceof Error ? err.message : String(err),
      ...task.meta,
    });
  }
}

/** Drain the next pending task. */
async function drain() {
  if (running || queue.length === 0) return;

  const task = queue[0];
  running = true;

  const attemptStart = Date.now();
  const attemptNum = task.attempts + 1;
  let shouldDrainNext = false;

  log("info", "attempt-start", {
    id: task.id,
    attempt: attemptNum,
    maxAttempts: MAX_ATTEMPTS,
    queueDepth: queue.length,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    ...task.meta,
  });

  try {
    await task.fn();

    const attemptMs = Date.now() - attemptStart;
    task.attemptDurations.push(attemptMs);
    task.attempts = attemptNum;

    queue.shift();
    clearRetryTimer();
    shouldDrainNext = true;

    const responseMs = Date.now() - task.enqueuedAt;
    log("info", "success", {
      id: task.id,
      attempt: attemptNum,
      attemptMs,
      responseMs,
      attempts: attemptNum,
      queueDepth: queue.length,
      ...task.meta,
    });

    void persistTiming(task, "success");
    task.onSuccess?.();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const attemptMs = Date.now() - attemptStart;
    task.attemptDurations.push(attemptMs);
    task.attempts = attemptNum;

    if (task.attempts >= MAX_ATTEMPTS) {
      queue.shift();
      clearRetryTimer();
      shouldDrainNext = true;

      const responseMs = Date.now() - task.enqueuedAt;
      log("error", "exhausted-retries", {
        id: task.id,
        attempts: task.attempts,
        attemptMs,
        responseMs,
        error: error.message,
        attemptDurations: task.attemptDurations,
        queueDepth: queue.length,
        ...task.meta,
      });

      void persistTiming(task, "failed", error.message);
      task.onFailed(error);
    } else {
      const delayMs = retryDelayMs(task.attempts);
      log("warn", "attempt-failed", {
        id: task.id,
        attempt: attemptNum,
        attemptMs,
        error: error.message,
        nextAttempt: attemptNum + 1,
        retryInMs: delayMs,
        waitedMs: Date.now() - task.enqueuedAt,
        ...task.meta,
      });
      scheduleRetry(delayMs);
    }
  } finally {
    running = false;
    if (shouldDrainNext && queue.length > 0) void drain();
  }
}

function scheduleRetry(delayMs) {
  clearRetryTimer();
  log("info", "retry-scheduled", { delayMs, queueDepth: queue.length });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void drain();
  }, delayMs);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    log("info", "online-flush", { queueDepth: queue.length });
    clearRetryTimer();
    void drain();
  });
}

/**
 * Enqueue a send task.
 *
 * @param {object} opts
 * @param {string} opts.id - Stable message id (for dedup).
 * @param {() => Promise<any>} opts.fn - The async publish function to call.
 * @param {(err: Error) => void} opts.onFailed - Called when all retries are exhausted.
 * @param {() => void} [opts.onSuccess] - Called after a successful publish.
 * @param {SendMeta} [opts.meta] - Conversation context for logs and timing stats.
 */
export function enqueueSend({ id, fn, onFailed, onSuccess, meta }) {
  const taskId = String(id || "").trim();
  if (!taskId) {
    log("error", "enqueue-rejected", { reason: "missing-id", ...normalizeMeta(meta) });
    return;
  }

  if (queue.some((t) => t.id === taskId)) {
    log("warn", "enqueue-skipped", { id: taskId, reason: "duplicate", ...normalizeMeta(meta) });
    return;
  }

  const task = {
    id: taskId,
    fn,
    attempts: 0,
    enqueuedAt: Date.now(),
    attemptDurations: [],
    meta: normalizeMeta(meta),
    onFailed,
    onSuccess,
  };

  queue.push(task);
  log("info", "enqueued", {
    id: taskId,
    queueDepth: queue.length,
    running,
    ...task.meta,
  });
  void drain();
}

/**
 * Remove a task from the queue (e.g. when the user deletes a pending message).
 *
 * @param {string} id
 */
export function dequeueTask(id) {
  const taskId = String(id || "").trim();
  const idx = queue.findIndex((t) => t.id === taskId);
  if (idx === -1) return;

  if (idx === 0 && running) {
    log("warn", "dequeue-blocked", { id: taskId, reason: "in-flight" });
    return;
  }

  const [removed] = queue.splice(idx, 1);
  log("info", "dequeued", {
    id: taskId,
    queueDepth: queue.length,
    ...removed.meta,
  });

  if (idx === 0) {
    clearRetryTimer();
    if (queue.length > 0) void drain();
  }
}

/**
 * Cancel and discard all queued tasks (e.g. on identity sign-out).
 */
export function cancelAllTasks() {
  const keepHead = running && queue.length > 0;
  const removed = keepHead ? queue.length - 1 : queue.length;
  queue.splice(keepHead ? 1 : 0);
  clearRetryTimer();
  if (removed > 0) {
    log("info", "cancelled", { removed, keepInFlight: keepHead });
  }
}

/** Snapshot of queue state for debugging. */
export function getSendQueueSnapshot() {
  return {
    running,
    queueDepth: queue.length,
    retryScheduled: retryTimer !== null,
    tasks: queue.map((task) => ({
      id: task.id,
      attempts: task.attempts,
      waitedMs: Date.now() - task.enqueuedAt,
      ...task.meta,
    })),
  };
}

export { MAX_ATTEMPTS, BASE_DELAY_MS, MAX_DELAY_MS };
