/**
 * sendQueue — standardized outbound message engine with per-conversation
 * queues, serial ordering within each conversation, exponential back-off
 * retries, timing metrics, and structured debug logs.
 *
 * Behaviour:
 *   - Each conversationId gets its own independent drain loop so a slow
 *     or retrying message in conversation A never blocks conversation B.
 *   - Within a single conversation messages are still drained serially,
 *     preserving send order.
 *   - Each task is retried with exponential back-off (1 s → 2 s → 4 s … up to
 *     MAX_DELAY_MS) for up to MAX_ATTEMPTS total tries.
 *   - When the browser reports it is back online all conversation queues
 *     drain immediately.
 *   - Per-attempt and end-to-end timings are persisted for avg/min/max stats.
 */

const LOG_PREFIX = "[gupt-send]";

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 8;

/** @typedef {{\n *   kind?: "dm" | "group",\n *   conversationId?: string,\n *   messageType?: string,\n * }} SendMeta */

/** @typedef {{\n *   id: string,\n *   fn: () => Promise<any>,\n *   attempts: number,\n *   enqueuedAt: number,\n *   attemptDurations: number[],\n *   meta: SendMeta,\n *   onFailed: (err: Error) => void,\n *   onSuccess?: () => void,\n * }} Task */

/**
 * Per-conversation queue state.
 * @type {Map<string, { queue: Task[], running: boolean, retryTimer: ReturnType<typeof setTimeout>|null }>}
 */
const lanes = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(level, event, detail = {}) {
  const payload = { t: Date.now(), ...detail };
  if (level === "error") console.error(`${LOG_PREFIX} ${event}`, payload);
  else if (level === "warn") console.warn(`${LOG_PREFIX} ${event}`, payload);
  else console.info(`${LOG_PREFIX} ${event}`, payload);
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

/** Return (creating if needed) the lane for a given conversationId. */
function getLane(conversationId) {
  if (!lanes.has(conversationId)) {
    lanes.set(conversationId, { queue: [], running: false, retryTimer: null });
  }
  return lanes.get(conversationId);
}

/** Remove the lane entirely when it becomes empty and idle. */
function maybeCleanLane(conversationId) {
  const lane = lanes.get(conversationId);
  if (lane && !lane.running && lane.queue.length === 0 && lane.retryTimer === null) {
    lanes.delete(conversationId);
  }
}

function clearLaneRetryTimer(lane) {
  if (lane.retryTimer) {
    clearTimeout(lane.retryTimer);
    lane.retryTimer = null;
  }
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

// ---------------------------------------------------------------------------
// Per-lane drain loop
// ---------------------------------------------------------------------------

/** Drain the next pending task in the given conversation's lane. */
async function drain(conversationId) {
  const lane = getLane(conversationId);
  if (lane.running || lane.queue.length === 0) return;

  const task = lane.queue[0];
  lane.running = true;

  const attemptStart = Date.now();
  const attemptNum = task.attempts + 1;
  let shouldDrainNext = false;

  log("info", "attempt-start", {
    id: task.id,
    attempt: attemptNum,
    maxAttempts: MAX_ATTEMPTS,
    queueDepth: lane.queue.length,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    ...task.meta,
  });

  try {
    await task.fn();

    const attemptMs = Date.now() - attemptStart;
    task.attemptDurations.push(attemptMs);
    task.attempts = attemptNum;

    lane.queue.shift();
    clearLaneRetryTimer(lane);
    shouldDrainNext = true;

    const responseMs = Date.now() - task.enqueuedAt;
    log("info", "success", {
      id: task.id,
      attempt: attemptNum,
      attemptMs,
      responseMs,
      attempts: attemptNum,
      queueDepth: lane.queue.length,
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
      lane.queue.shift();
      clearLaneRetryTimer(lane);
      shouldDrainNext = true;

      const responseMs = Date.now() - task.enqueuedAt;
      log("error", "exhausted-retries", {
        id: task.id,
        attempts: task.attempts,
        attemptMs,
        responseMs,
        error: error.message,
        attemptDurations: task.attemptDurations,
        queueDepth: lane.queue.length,
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
      scheduleLaneRetry(conversationId, lane, delayMs);
    }
  } finally {
    lane.running = false;
    if (shouldDrainNext) {
      if (lane.queue.length > 0) {
        void drain(conversationId);
      } else {
        maybeCleanLane(conversationId);
      }
    }
  }
}

function scheduleLaneRetry(conversationId, lane, delayMs) {
  clearLaneRetryTimer(lane);
  log("info", "retry-scheduled", {
    delayMs,
    queueDepth: lane.queue.length,
    conversationId,
  });
  lane.retryTimer = setTimeout(() => {
    lane.retryTimer = null;
    void drain(conversationId);
  }, delayMs);
}

// On reconnect, flush every active lane immediately.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    const laneCount = lanes.size;
    log("info", "online-flush", { laneCount });
    for (const [conversationId, lane] of lanes.entries()) {
      clearLaneRetryTimer(lane);
      void drain(conversationId);
    }
  });
}

// ---------------------------------------------------------------------------
// Public API — signatures are unchanged from the single-queue version
// ---------------------------------------------------------------------------

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

  const normalized = normalizeMeta(meta);
  const conversationId = normalized.conversationId || "__default__";
  const lane = getLane(conversationId);

  if (lane.queue.some((t) => t.id === taskId)) {
    log("warn", "enqueue-skipped", { id: taskId, reason: "duplicate", ...normalized });
    return;
  }

  const task = {
    id: taskId,
    fn,
    attempts: 0,
    enqueuedAt: Date.now(),
    attemptDurations: [],
    meta: normalized,
    onFailed,
    onSuccess,
  };

  lane.queue.push(task);
  log("info", "enqueued", {
    id: taskId,
    conversationId,
    queueDepth: lane.queue.length,
    running: lane.running,
    ...normalized,
  });
  void drain(conversationId);
}

/**
 * Remove a task from the queue (e.g. when the user deletes a pending message).
 *
 * @param {string} id
 */
export function dequeueTask(id) {
  const taskId = String(id || "").trim();

  for (const [conversationId, lane] of lanes.entries()) {
    const idx = lane.queue.findIndex((t) => t.id === taskId);
    if (idx === -1) continue;

    if (idx === 0 && lane.running) {
      log("warn", "dequeue-blocked", { id: taskId, reason: "in-flight" });
      return;
    }

    const [removed] = lane.queue.splice(idx, 1);
    log("info", "dequeued", {
      id: taskId,
      conversationId,
      queueDepth: lane.queue.length,
      ...removed.meta,
    });

    if (idx === 0) {
      clearLaneRetryTimer(lane);
      if (lane.queue.length > 0) void drain(conversationId);
    }

    maybeCleanLane(conversationId);
    return;
  }
}

/**
 * Cancel and discard all queued tasks across all lanes (e.g. on identity sign-out).
 */
export function cancelAllTasks() {
  let removed = 0;
  for (const [conversationId, lane] of lanes.entries()) {
    const keepHead = lane.running && lane.queue.length > 0;
    const count = keepHead ? lane.queue.length - 1 : lane.queue.length;
    lane.queue.splice(keepHead ? 1 : 0);
    clearLaneRetryTimer(lane);
    removed += count;
    if (!keepHead) lanes.delete(conversationId);
  }
  if (removed > 0) {
    log("info", "cancelled", { removed, lanesCleared: lanes.size });
  }
}

/** Snapshot of queue state across all lanes for debugging. */
export function getSendQueueSnapshot() {
  const allTasks = [];
  let totalRunning = 0;

  for (const [conversationId, lane] of lanes.entries()) {
    if (lane.running) totalRunning++;
    for (const task of lane.queue) {
      allTasks.push({
        id: task.id,
        conversationId,
        attempts: task.attempts,
        waitedMs: Date.now() - task.enqueuedAt,
        ...task.meta,
      });
    }
  }

  return {
    running: totalRunning > 0,
    laneCount: lanes.size,
    queueDepth: allTasks.length,
    retryScheduled: [...lanes.values()].some((l) => l.retryTimer !== null),
    tasks: allTasks,
  };
}

export { MAX_ATTEMPTS, BASE_DELAY_MS, MAX_DELAY_MS };
