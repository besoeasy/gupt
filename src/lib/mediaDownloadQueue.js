/**
 * Media Download Concurrency Queue
 *
 * Enforces a strict maximum of 3 concurrent file downloads at a time.
 * Every download must wait for currently running downloads to finish or fail
 * before beginning execution.
 */

export const MAX_CONCURRENT_DOWNLOADS = 3;

export class MediaDownloadQueue {
  constructor({ maxConcurrency = MAX_CONCURRENT_DOWNLOADS } = {}) {
    this.maxConcurrency = Math.max(1, Number(maxConcurrency) || MAX_CONCURRENT_DOWNLOADS);
    this.activeCount = 0;
    this.queue = []; // Array<{ id, task, resolve, reject, priority, onQueued, onStart }>
    this.activeTasks = new Map(); // id -> { promise, cancel }
    this.pendingPromises = new Map(); // id -> promise
  }

  /**
   * Enqueue a download task.
   * If already active or queued for the same id, returns the existing Promise.
   * If priority is true, promotes waiting items to the front of the queue.
   */
  enqueue(id, task, { priority = false, onQueued = null, onStart = null } = {}) {
    if (!id || typeof task !== "function") {
      return Promise.reject(new Error("Invalid download task or ID"));
    }

    // Deduplicate: if already pending (active or queued), return existing promise
    if (this.pendingPromises.has(id)) {
      if (priority) {
        this.promote(id);
      }
      return this.pendingPromises.get(id);
    }

    const promise = new Promise((resolve, reject) => {
      const item = {
        id,
        task,
        resolve,
        reject,
        priority: Boolean(priority),
        onQueued,
        onStart,
      };

      if (this.activeCount < this.maxConcurrency) {
        this._runItem(item);
      } else {
        if (priority) {
          this.queue.unshift(item);
        } else {
          this.queue.push(item);
        }
        try {
          onQueued?.({
            id,
            queuePosition: this.queue.indexOf(item) + 1,
            totalQueued: this.queue.length,
          });
        } catch {}
      }
    });

    this.pendingPromises.set(id, promise);
    return promise;
  }

  /**
   * Promote an item to the front of the waiting queue.
   */
  promote(id) {
    const idx = this.queue.findIndex((item) => item.id === id);
    if (idx > 0) {
      const [item] = this.queue.splice(idx, 1);
      item.priority = true;
      this.queue.unshift(item);
    }
  }

  /**
   * Execute an item immediately.
   */
  async _runItem(item) {
    this.activeCount++;
    this.activeTasks.set(item.id, item);

    try {
      item.onStart?.({ id: item.id, activeCount: this.activeCount });
    } catch {}

    try {
      const result = await item.task();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.activeTasks.delete(item.id);
      this.pendingPromises.delete(item.id);
      this._drainNext();
    }
  }

  /**
   * Drain the next queued download when a slot becomes available.
   */
  _drainNext() {
    if (this.activeCount >= this.maxConcurrency) return;
    if (this.queue.length === 0) return;

    const next = this.queue.shift();
    if (next) {
      this._runItem(next);
    }
  }

  /**
   * Check if a download is currently active or queued.
   */
  isPending(id) {
    return this.pendingPromises.has(id);
  }

  /**
   * Check if a download is currently actively downloading.
   */
  isActive(id) {
    return this.activeTasks.has(id);
  }

  /**
   * Check if a download is currently waiting in the queue.
   */
  isQueued(id) {
    return this.queue.some((item) => item.id === id);
  }

  /**
   * Get existing pending promise for an id.
   */
  getPromise(id) {
    return this.pendingPromises.get(id) || null;
  }

  /**
   * Cancel / remove a waiting download from the queue.
   */
  cancel(id) {
    const idx = this.queue.findIndex((item) => item.id === id);
    if (idx !== -1) {
      const [item] = this.queue.splice(idx, 1);
      this.pendingPromises.delete(id);
      item.reject(new Error("Download cancelled"));
      return true;
    }
    return false;
  }

  /**
   * Return current queue state snapshot.
   */
  getStatus() {
    return {
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      activeIds: Array.from(this.activeTasks.keys()),
      queuedIds: this.queue.map((item) => item.id),
    };
  }

  /**
   * Reset / clear all waiting and active tracking.
   */
  clear() {
    for (const item of this.queue) {
      try {
        item.reject(new Error("Download queue cleared"));
      } catch {}
    }
    this.queue = [];
    this.activeTasks.clear();
    this.pendingPromises.clear();
    this.activeCount = 0;
  }
}

export function createMediaDownloadQueue(options) {
  return new MediaDownloadQueue(options);
}

// Global shared download queue ensuring at most 3 concurrent downloads across the app
export const globalMediaDownloadQueue = new MediaDownloadQueue({
  maxConcurrency: MAX_CONCURRENT_DOWNLOADS,
});
