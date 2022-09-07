/**
 * Run async tasks with a concurrency limit.
 * @template T
 * @param {number} limit
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<void>} worker
 */
export async function asyncPool(limit, items, worker) {
  const queue = items.slice();
  if (!queue.length) return;

  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const index = items.length - queue.length;
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item, index);
    }
  });

  await Promise.all(workers);
}
