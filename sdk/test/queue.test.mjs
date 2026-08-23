import assert from "node:assert/strict";
import test from "node:test";

import { PermanentSendError, SendQueue } from "../src/queue.js";

test("serializes tasks in a lane and retries transient failures", async () => {
  const queue = new SendQueue({
    baseDelayMs: 1,
    maxDelayMs: 1,
    throttleMs: 0,
  });
  const order = [];
  let attempts = 0;

  const first = queue.enqueue({
    id: "first",
    lane: "peer",
    async fn() {
      attempts++;
      order.push(`first-${attempts}`);
      if (attempts === 1) throw new Error("temporary");
      return "sent";
    },
  });
  const second = queue.enqueue({
    id: "second",
    lane: "peer",
    async fn() {
      order.push("second");
    },
  });

  assert.equal(await first, "sent");
  await second;
  assert.deepEqual(order, ["first-1", "first-2", "second"]);
  assert.equal(queue.snapshot().pendingCount, 0);
  queue.stop();
});

test("does not retry permanent failures", async () => {
  const queue = new SendQueue({ throttleMs: 0 });
  let attempts = 0;
  const result = queue.enqueue({
    id: "permanent",
    async fn() {
      attempts++;
      throw new PermanentSendError("rejected");
    },
  });

  await assert.rejects(result, /rejected/);
  assert.equal(attempts, 1);
  queue.stop();
});

test("rejects duplicate ids and bounded-queue overflow", async () => {
  const queue = new SendQueue({ maxPending: 1, throttleMs: 0 });
  let release;
  const blocked = queue.enqueue({
    id: "blocked",
    fn: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });

  await assert.rejects(queue.enqueue({ id: "blocked", fn() {} }), /Duplicate/);
  await assert.rejects(queue.enqueue({ id: "other", fn() {} }), /full/);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await blocked;
  queue.stop();
});
