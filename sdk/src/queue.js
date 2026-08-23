export const BASE_DELAY_MS = 1_000;
export const MAX_DELAY_MS = 3 * 60_000;
export const MAX_ATTEMPTS = 8;
export const GLOBAL_THROTTLE_MS = 1_200;
export const MAX_PENDING_SENDS = 1_000;

export class PermanentSendError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "PermanentSendError";
  }
}

export class SendQueue {
  constructor({
    baseDelayMs = BASE_DELAY_MS,
    maxDelayMs = MAX_DELAY_MS,
    maxAttempts = MAX_ATTEMPTS,
    throttleMs = GLOBAL_THROTTLE_MS,
    maxPending = MAX_PENDING_SENDS,
    clock = Date.now,
  } = {}) {
    this.baseDelayMs = Math.max(0, Number(baseDelayMs) || 0);
    this.maxDelayMs = Math.max(this.baseDelayMs, Number(maxDelayMs) || 0);
    this.maxAttempts = Math.max(1, Math.floor(Number(maxAttempts) || 1));
    this.throttleMs = Math.max(0, Number(throttleMs) || 0);
    this.maxPending = Math.max(1, Math.floor(Number(maxPending) || 1));
    this.clock = clock;
    this.lastStartedAt = 0;
    this.pendingCount = 0;
    this.lanes = new Map();
    this.ids = new Set();
    this.waiters = new Set();
    this.dispatchChain = Promise.resolve();
    this.stopped = false;
  }

  enqueue({ id, lane = "__default__", fn }) {
    const taskId = String(id || "").trim();
    const laneId = String(lane || "__default__");
    if (this.stopped) return Promise.reject(new Error("Send queue is stopped"));
    if (!taskId) return Promise.reject(new TypeError("Send task id is required"));
    if (typeof fn !== "function") return Promise.reject(new TypeError("Send task fn is required"));
    if (this.ids.has(taskId)) return Promise.reject(new Error(`Duplicate send task: ${taskId}`));
    if (this.pendingCount >= this.maxPending)
      return Promise.reject(new Error("Send queue is full"));

    let resolveTask;
    let rejectTask;
    const result = new Promise((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    const task = {
      id: taskId,
      fn,
      attempts: 0,
      resolve: resolveTask,
      reject: rejectTask,
    };

    if (!this.lanes.has(laneId)) this.lanes.set(laneId, { running: false, tasks: [] });
    this.lanes.get(laneId).tasks.push(task);
    this.ids.add(taskId);
    this.pendingCount++;
    void this.drainLane(laneId);
    return result;
  }

  retryDelay(attempts) {
    return Math.min(this.baseDelayMs * 2 ** Math.max(0, attempts - 1), this.maxDelayMs);
  }

  acquireThrottle() {
    const turn = this.dispatchChain.then(async () => {
      const waitMs = Math.max(0, this.lastStartedAt + this.throttleMs - this.clock());
      if (waitMs) await this.wait(waitMs);
      if (this.stopped) throw new Error("Send queue is stopped");
      this.lastStartedAt = this.clock();
    });
    this.dispatchChain = turn.catch(() => {});
    return turn;
  }

  wait(delayMs) {
    return new Promise((resolve) => {
      const waiter = {
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          resolve();
        }, delayMs),
        resolve,
      };
      this.waiters.add(waiter);
    });
  }

  async drainLane(laneId) {
    const lane = this.lanes.get(laneId);
    if (!lane || lane.running) return;
    lane.running = true;

    try {
      while (lane.tasks.length) {
        const task = lane.tasks[0];
        let completed = false;

        while (!completed && task.attempts < this.maxAttempts) {
          try {
            await this.acquireThrottle();
            task.attempts++;
            const value = await task.fn({ attempt: task.attempts });
            this.finishTask(lane, task);
            task.resolve(value);
            completed = true;
          } catch (error) {
            const final =
              this.stopped ||
              error instanceof PermanentSendError ||
              task.attempts >= this.maxAttempts;
            if (final) {
              this.finishTask(lane, task);
              task.reject(error);
              completed = true;
            } else {
              await this.wait(this.retryDelay(task.attempts));
            }
          }
        }
      }
    } finally {
      lane.running = false;
      if (!lane.tasks.length) this.lanes.delete(laneId);
    }
  }

  finishTask(lane, task) {
    if (lane.tasks[0] === task) lane.tasks.shift();
    else lane.tasks.splice(lane.tasks.indexOf(task), 1);
    this.ids.delete(task.id);
    this.pendingCount = Math.max(0, this.pendingCount - 1);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
    this.waiters.clear();

    for (const lane of this.lanes.values()) {
      for (const task of lane.tasks) task.reject(new Error("Send queue is stopped"));
      lane.tasks.length = 0;
    }
    this.lanes.clear();
    this.ids.clear();
    this.pendingCount = 0;
  }

  snapshot() {
    return {
      stopped: this.stopped,
      pendingCount: this.pendingCount,
      lanes: Object.fromEntries(
        [...this.lanes].map(([laneId, lane]) => [
          laneId,
          lane.tasks.map((task) => ({ id: task.id, attempts: task.attempts })),
        ]),
      ),
    };
  }
}
