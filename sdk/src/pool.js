import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isPrivateRelayHostname } from "./relayBook.js";

export const CONNECT_TIMEOUT_MS = 5_000;
export const PUBLISH_TIMEOUT_MS = 5_000;
export const MAX_RECONNECT_DELAY_MS = 30_000;
export const MAX_RELAY_FRAME_BYTES = 256 * 1024;

async function assertPublicRelayAddress(relay, allowPrivateRelays) {
  if (allowPrivateRelays) return;
  const { hostname } = new URL(relay);
  if (isPrivateRelayHostname(hostname)) throw new Error(`Private relay address rejected: ${relay}`);
  if (isIP(hostname.replace(/^\[|\]$/g, ""))) return;
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateRelayHostname(address))) {
    throw new Error(`Relay resolved to a private address: ${relay}`);
  }
}

function messageText(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  return "";
}

export class RelayPool {
  constructor({
    WebSocketImpl = globalThis.WebSocket,
    allowPrivateRelays = false,
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
    publishTimeoutMs = PUBLISH_TIMEOUT_MS,
    maxFrameBytes = MAX_RELAY_FRAME_BYTES,
    onEvent = null,
    onRelayError = null,
  } = {}) {
    if (!WebSocketImpl) throw new Error("Node.js 22.12 or newer is required for WebSocket support");
    this.WebSocketImpl = WebSocketImpl;
    this.allowPrivateRelays = allowPrivateRelays;
    this.connectTimeoutMs = connectTimeoutMs;
    this.publishTimeoutMs = publishTimeoutMs;
    this.maxFrameBytes = maxFrameBytes;
    this.onEvent = onEvent;
    this.onRelayError = onRelayError;
    this.states = new Map();
    this.desired = new Set();
    this.pendingPublishes = new Map();
    this.filterFactory = null;
    this.running = false;
  }

  async start(relays, filterFactory) {
    if (this.running) return;
    this.running = true;
    this.filterFactory =
      typeof filterFactory === "function" ? filterFactory : () => ({ ...(filterFactory || {}) });
    const results = await Promise.allSettled(relays.map((relay) => this.addRelay(relay)));
    if (!results.some((result) => result.status === "fulfilled")) {
      this.stop();
      throw new Error("Could not connect to any configured relay");
    }
  }

  async addRelay(relay) {
    this.desired.add(relay);
    try {
      return await this.connect(relay);
    } catch (error) {
      if (this.running) this.scheduleReconnect(relay);
      throw error;
    }
  }

  stateFor(relay) {
    if (!this.states.has(relay)) {
      this.states.set(relay, {
        socket: null,
        connectPromise: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        subId: null,
      });
    }
    return this.states.get(relay);
  }

  async connect(relay) {
    const state = this.stateFor(relay);
    if (state.socket?.readyState === this.WebSocketImpl.OPEN) return state.socket;
    if (state.connectPromise) return state.connectPromise;

    state.connectPromise = (async () => {
      await assertPublicRelayAddress(relay, this.allowPrivateRelays);
      return new Promise((resolve, reject) => {
        const socket = new this.WebSocketImpl(relay);
        state.socket = socket;
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          socket.close();
          reject(new Error(`Timed out connecting to ${relay}`));
        }, this.connectTimeoutMs);

        socket.addEventListener("open", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          state.reconnectAttempts = 0;
          state.subId = `gupt_bot_${crypto.randomUUID().replaceAll("-", "")}`;
          if (this.filterFactory) {
            socket.send(JSON.stringify(["REQ", state.subId, this.filterFactory(relay)]));
          }
          resolve(socket);
        });

        socket.addEventListener("message", (message) => this.handleMessage(relay, state, message));

        socket.addEventListener("error", () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            socket.close();
            reject(new Error(`Failed to connect to ${relay}`));
          }
        });

        socket.addEventListener("close", () => {
          clearTimeout(timeout);
          if (!settled) {
            settled = true;
            reject(new Error(`Connection closed before opening: ${relay}`));
          }
          if (state.socket === socket) {
            state.socket = null;
            state.subId = null;
          }
          this.rejectPendingForRelay(relay, new Error(`Relay connection closed: ${relay}`));
          if (this.running && this.desired.has(relay)) this.scheduleReconnect(relay);
        });
      });
    })();

    try {
      return await state.connectPromise;
    } finally {
      state.connectPromise = null;
    }
  }

  handleMessage(relay, state, message) {
    const text = messageText(message.data);
    if (!text || Buffer.byteLength(text, "utf8") > this.maxFrameBytes) return;

    let frame;
    try {
      frame = JSON.parse(text);
    } catch {
      return;
    }
    if (!Array.isArray(frame)) return;

    if (frame[0] === "EVENT" && frame[1] === state.subId && frame[2]) {
      this.onEvent?.(frame[2], relay);
      return;
    }
    if (frame[0] === "OK" && typeof frame[1] === "string") {
      const key = `${relay}:${frame[1]}`;
      const pending = this.pendingPublishes.get(key);
      if (!pending) return;
      this.pendingPublishes.delete(key);
      clearTimeout(pending.timer);
      if (frame[2]) pending.resolve({ relay, id: frame[1] });
      else pending.reject(new Error(`Relay rejected event: ${String(frame[3] || "rejected")}`));
      return;
    }
    if (frame[0] === "CLOSED" && frame[1] === state.subId) {
      this.onRelayError?.(
        new Error(`Relay closed subscription: ${String(frame[2] || relay)}`),
        relay,
      );
    }
  }

  scheduleReconnect(relay) {
    const state = this.stateFor(relay);
    if (state.reconnectTimer || state.connectPromise) return;
    state.reconnectAttempts++;
    const ceiling = Math.min(1_000 * 2 ** (state.reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
    const delay = Math.floor(ceiling / 2 + Math.random() * (ceiling / 2));
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      this.connect(relay).catch((error) => {
        this.onRelayError?.(error, relay);
        this.scheduleReconnect(relay);
      });
    }, delay);
  }

  publish(relays, event, { timeoutMs = this.publishTimeoutMs } = {}) {
    const targets = [...new Set(relays)].filter(Boolean);
    if (!targets.length) return Promise.reject(new Error("No relay available for reply"));
    return Promise.any(targets.map((relay) => this.publishOne(relay, event, timeoutMs))).catch(
      (error) => {
        const reasons = error?.errors?.map((entry) => entry.message).filter(Boolean) || [];
        throw new Error(reasons.length ? reasons.join(" | ") : "All relays rejected the event");
      },
    );
  }

  async publishOne(relay, event, timeoutMs) {
    const socket = await this.connect(relay);
    return new Promise((resolve, reject) => {
      const key = `${relay}:${event.id}`;
      if (this.pendingPublishes.has(key)) {
        reject(new Error(`Event ${event.id} is already pending on ${relay}`));
        return;
      }
      const timer = setTimeout(() => {
        this.pendingPublishes.delete(key);
        reject(new Error(`Timed out publishing to ${relay}`));
      }, timeoutMs);
      this.pendingPublishes.set(key, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify(["EVENT", event]));
      } catch (error) {
        clearTimeout(timer);
        this.pendingPublishes.delete(key);
        reject(error);
      }
    });
  }

  rejectPendingForRelay(relay, error) {
    for (const [key, pending] of this.pendingPublishes) {
      if (!key.startsWith(`${relay}:`)) continue;
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingPublishes.delete(key);
    }
  }

  stop() {
    this.running = false;
    for (const state of this.states.values()) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
      state.socket?.close();
      state.socket = null;
    }
    for (const pending of this.pendingPublishes.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Relay pool stopped"));
    }
    this.pendingPublishes.clear();
    this.desired.clear();
  }

  snapshot() {
    return {
      running: this.running,
      relays: Object.fromEntries(
        [...this.states].map(([relay, state]) => [
          relay,
          {
            desired: this.desired.has(relay),
            connected: state.socket?.readyState === this.WebSocketImpl.OPEN,
            reconnectAttempts: state.reconnectAttempts,
          },
        ]),
      ),
    };
  }
}
