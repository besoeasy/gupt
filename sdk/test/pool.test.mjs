import assert from "node:assert/strict";
import test from "node:test";

import { RelayPool } from "../src/pool.js";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open", {});
    });
  }

  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(handler);
  }

  emit(name, event) {
    for (const handler of this.listeners.get(name) || []) handler(event);
  }

  send(value) {
    this.sent.push(JSON.parse(value));
    const frame = this.sent.at(-1);
    if (frame[0] === "EVENT") {
      queueMicrotask(() =>
        this.emit("message", {
          data: JSON.stringify(["OK", frame[1].id, true, "stored"]),
        }),
      );
    }
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {});
  }
}

test("subscribes per relay, preserves source URLs, and publishes with acknowledgements", async () => {
  FakeWebSocket.instances.length = 0;
  const received = [];
  const relays = ["ws://127.0.0.1:4101", "ws://127.0.0.1:4102"];
  const pool = new RelayPool({
    WebSocketImpl: FakeWebSocket,
    allowPrivateRelays: true,
    onEvent: (event, relayUrl) => received.push({ event, relayUrl }),
  });

  await pool.start(relays, () => ({ kinds: [4], "#p": ["b".repeat(64)] }));
  assert.equal(FakeWebSocket.instances.length, 2);

  const firstSocket = FakeWebSocket.instances[0];
  const request = firstSocket.sent.find((frame) => frame[0] === "REQ");
  assert.deepEqual(request[2], { kinds: [4], "#p": ["b".repeat(64)] });

  firstSocket.emit("message", {
    data: JSON.stringify(["EVENT", request[1], { id: "event-id" }]),
  });
  assert.deepEqual(received, [
    {
      event: { id: "event-id" },
      relayUrl: relays[0],
    },
  ]);

  assert.deepEqual(await pool.publish([relays[0]], { id: "signed-event" }), {
    relay: relays[0],
    id: "signed-event",
  });
  pool.stop();
});
