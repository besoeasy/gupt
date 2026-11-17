import test from "node:test";
import assert from "node:assert/strict";
import {
  MediaDownloadQueue,
  createMediaDownloadQueue,
  MAX_CONCURRENT_DOWNLOADS,
} from "../src/lib/mediaDownloadQueue.js";

test("MAX_CONCURRENT_DOWNLOADS is 3", () => {
  assert.equal(MAX_CONCURRENT_DOWNLOADS, 3);
});

test("MediaDownloadQueue runs at most 3 downloads concurrently when 100 are enqueued", async () => {
  const queue = createMediaDownloadQueue({ maxConcurrency: 3 });
  let currentActive = 0;
  let maxObservedActive = 0;
  let completedCount = 0;

  const tasks = Array.from({ length: 100 }, (_, i) => {
    const id = `attachment-${i}`;
    return queue.enqueue(id, async () => {
      currentActive++;
      maxObservedActive = Math.max(maxObservedActive, currentActive);

      // Simulate download time
      await new Promise((resolve) => setTimeout(resolve, 5));

      currentActive--;
      completedCount++;
      return `result-${i}`;
    });
  });

  const results = await Promise.all(tasks);

  assert.equal(results.length, 100);
  assert.equal(completedCount, 100);
  assert.equal(maxObservedActive, 3, "Never exceeded 3 active downloads concurrently");
  assert.equal(currentActive, 0);
  assert.equal(queue.getStatus().activeCount, 0);
  assert.equal(queue.getStatus().queuedCount, 0);
});

test("every download must wait for previous downloads to finish before starting", async () => {
  const queue = createMediaDownloadQueue({ maxConcurrency: 3 });
  const startOrder = [];
  const finishOrder = [];

  // Create resolver hooks for the first 3 tasks
  const resolvers = [];

  const p0 = queue.enqueue("file-0", () => new Promise((res) => {
    startOrder.push(0);
    resolvers[0] = () => { finishOrder.push(0); res("done-0"); };
  }));

  const p1 = queue.enqueue("file-1", () => new Promise((res) => {
    startOrder.push(1);
    resolvers[1] = () => { finishOrder.push(1); res("done-1"); };
  }));

  const p2 = queue.enqueue("file-2", () => new Promise((res) => {
    startOrder.push(2);
    resolvers[2] = () => { finishOrder.push(2); res("done-2"); };
  }));

  // File 3 is enqueued when 3 downloads are already running
  let file3Started = false;
  const p3 = queue.enqueue("file-3", async () => {
    file3Started = true;
    startOrder.push(3);
    finishOrder.push(3);
    return "done-3";
  });

  // Give microtasks time to run
  await new Promise((r) => setTimeout(r, 10));

  assert.deepEqual(startOrder, [0, 1, 2]);
  assert.equal(file3Started, false, "file-3 must wait in queue while 3 downloads run");
  assert.equal(queue.getStatus().activeCount, 3);
  assert.equal(queue.getStatus().queuedCount, 1);
  assert.equal(queue.isQueued("file-3"), true);

  // Finish file 1
  resolvers[1]();
  await p1;

  // Now file-3 should have started and completed
  await p3;
  assert.equal(file3Started, true, "file-3 started after file-1 finished");
  assert.deepEqual(startOrder, [0, 1, 2, 3]);

  // Finish remaining
  resolvers[0]();
  resolvers[2]();
  await Promise.all([p0, p2]);

  assert.deepEqual(finishOrder, [1, 3, 0, 2]);
});

test("when a download fails with error, waiting downloads still proceed immediately", async () => {
  const queue = createMediaDownloadQueue({ maxConcurrency: 3 });
  let file3Ran = false;

  const resolvers = [];
  const p0 = queue.enqueue("fail-0", () => new Promise((res) => { resolvers[0] = res; }));
  const p1 = queue.enqueue("fail-1", () => new Promise((_, rej) => { resolvers[1] = rej; }));
  const p2 = queue.enqueue("fail-2", () => new Promise((res) => { resolvers[2] = res; }));

  const p3 = queue.enqueue("fail-3", async () => {
    file3Ran = true;
    return "file-3-ok";
  });

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(file3Ran, false, "file-3 waiting because 3 are active");

  // Fail download 1 with an error
  resolvers[1](new Error("Network connection dropped HTTP 500"));

  await assert.rejects(p1, /Network connection dropped HTTP 500/);

  // file-3 must have started despite file-1 failing!
  const res3 = await p3;
  assert.equal(res3, "file-3-ok");
  assert.equal(file3Ran, true, "file-3 proceeded even after file-1 failed");

  resolvers[0]("ok-0");
  resolvers[2]("ok-2");
  await Promise.all([p0, p2]);
});

test("deduplicates identical download IDs and preserves existing promise", async () => {
  const queue = createMediaDownloadQueue({ maxConcurrency: 3 });
  let runCount = 0;

  const p1 = queue.enqueue("duplicate-id", async () => {
    runCount++;
    await new Promise((r) => setTimeout(r, 15));
    return "dup-result";
  });

  const p2 = queue.enqueue("duplicate-id", async () => {
    runCount++;
    return "duplicate-should-not-run";
  });

  assert.equal(p1, p2, "Returns the exact same in-flight promise");
  const [res1, res2] = await Promise.all([p1, p2]);
  assert.equal(res1, "dup-result");
  assert.equal(res2, "dup-result");
  assert.equal(runCount, 1, "Only ran once");
});

test("priority downloads jump to the head of the waiting queue", async () => {
  const queue = createMediaDownloadQueue({ maxConcurrency: 1 });
  let resolveActive;
  const executionOrder = [];

  const pActive = queue.enqueue("active", () => new Promise((res) => {
    resolveActive = res;
  }));

  // Enqueue regular tasks 1 and 2
  queue.enqueue("normal-1", async () => { executionOrder.push(1); return 1; });
  queue.enqueue("normal-2", async () => { executionOrder.push(2); return 2; });

  // Enqueue priority task 3 (e.g. user taps to download file #3)
  queue.enqueue("priority-3", async () => { executionOrder.push(3); return 3; }, { priority: true });

  resolveActive("done-active");
  await pActive;

  // Let remaining drain
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(executionOrder, [3, 1, 2], "Priority item #3 executed before #1 and #2");
});

test("cancel removes waiting download from queue", async () => {
  const queue = createMediaDownloadQueue({ maxConcurrency: 1 });
  let resolveActive;

  const pActive = queue.enqueue("active", () => new Promise((res) => {
    resolveActive = res;
  }));

  const pQueued = queue.enqueue("waiting", async () => "should-not-run");

  assert.equal(queue.isQueued("waiting"), true);
  const cancelled = queue.cancel("waiting");
  assert.equal(cancelled, true);
  assert.equal(queue.isQueued("waiting"), false);

  await assert.rejects(pQueued, /Download cancelled/);

  resolveActive("done");
  await pActive;
});
