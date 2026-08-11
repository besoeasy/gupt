import { CONNECT_TIMEOUT_MS } from "./constants.js";
import { recordOutcomes } from "./outcomes.js";

export class WsPool {
  constructor() {
    this.sockets = new Map();
    this.subs = new Map();
    this._subsByUrl = new Map();
    this._publishHandlers = new Map();
    this._clientClosedSubs = new Set();
  }

  async ensureRelay(url, options = {}) {
    if (this.sockets.has(url)) {
      const ws = this.sockets.get(url);
      if (ws.readyState === WebSocket.OPEN) return ws;
      if (ws.readyState === WebSocket.CONNECTING) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Timeout")),
            options.connectionTimeout || CONNECT_TIMEOUT_MS,
          );
          ws.addEventListener(
            "open",
            () => {
              clearTimeout(timeout);
              resolve(ws);
            },
            { once: true },
          );
        });
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        this.sockets.set(url, ws);

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error(`Timeout connecting to ${url}`));
        }, options.connectionTimeout || CONNECT_TIMEOUT_MS);

        ws.addEventListener("open", () => {
          clearTimeout(timeout);
          ws.__wasOpen = true;
          resolve(ws);
        });

        ws.addEventListener("error", () => {
          clearTimeout(timeout);
          reject(new Error(`Failed to connect to ${url}`));
        });

        ws.addEventListener("close", () => {
          this.sockets.delete(url);
          if (ws.__wasOpen && !ws.__intentionalClose) {
            recordOutcomes("connect", [{ relay: url, ok: false, error: "socket closed" }]);
          }
          const subsForUrl = this._subsByUrl.get(url);
          if (subsForUrl) {
            for (const subId of [...subsForUrl]) {
              const sub = this.subs.get(subId);
              if (sub?.close) sub.close("socket closed");
            }
            this._subsByUrl.delete(url);
          }
        });

        ws.addEventListener("message", (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data[0] === "EVENT") {
              const sub = this.subs.get(data[1]);
              if (sub?.onevent) sub.onevent(data[2]);
            } else if (data[0] === "EOSE") {
              const sub = this.subs.get(data[1]);
              if (sub?.oneose) sub.oneose(url);
            } else if (data[0] === "CLOSE") {
              const reason = String(data[2] || "closed by relay");
              const echoKey = `${url}::${data[1]}`;
              const clientClosed = this._clientClosedSubs.delete(echoKey);
              if (!clientClosed && !reason.startsWith("auth-required:")) {
                recordOutcomes("query", [{ relay: url, ok: false, error: `close: ${reason}` }]);
              }
              const sub = this.subs.get(data[1]);
              if (sub?.close) sub.close(reason);
            } else if (data[0] === "OK") {
              const handlers = this._publishHandlers.get(data[1]);
              if (handlers) {
                for (const fn of handlers) fn(url, data[2], data[3] || "");
              }
            }
          } catch {
            // Ignore parse errors
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Publish an event to multiple relays.
   * Resolves when minOk relays acknowledge, or rejects if all fail.
   * @param {string[]} urls
   * @param {object} event
   * @param {{ maxWait?: number }} [options]
   * @returns {Promise<{ urls: string[], ok: boolean }>}
   */
  async publish(urls, event, { maxWait = 3000 } = {}) {
    const eventId = event.id;
    let resolved = false;
    const sendTimes = new Map();

    return new Promise((resolve, reject) => {
      let failCount = 0;
      let okCount = 0;
      const expected = urls.length;
      if (expected === 0) return reject(new Error("No relays"));
      const minOk = 2;
      const successfulUrls = [];
      const latencies = {};

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (okCount > 0) resolve({ urls: successfulUrls, ok: true, latencies });
          else reject(new Error("Publish timed out"));
        }
      }, maxWait);

      const handlers = this._publishHandlers.get(eventId) || [];
      handlers.push((url, ok, msg) => {
        const latencyMs = sendTimes.has(url) ? Date.now() - sendTimes.get(url) : 0;
        if (ok && !resolved) {
          okCount++;
          successfulUrls.push(url);
          latencies[url] = latencyMs;
          if (okCount >= minOk) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ urls: successfulUrls, ok: true, latencies });
          } else if (okCount + failCount === expected) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ urls: successfulUrls, ok: true, latencies });
          }
        } else if (!ok && !resolved) {
          failCount++;
          if (okCount + failCount === expected) {
            resolved = true;
            clearTimeout(timeout);
            if (okCount > 0) resolve({ urls: successfulUrls, ok: true, latencies });
            else reject(new Error("All relays rejected the event"));
          }
        }
      });
      this._publishHandlers.set(eventId, handlers);

      setTimeout(() => this._publishHandlers.delete(eventId), maxWait + 1000);

      urls.forEach(async (url) => {
        const ws = await this.ensureRelay(url, { connectionTimeout: 3000 }).catch(() => null);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          const hs = this._publishHandlers.get(eventId);
          if (hs) for (const fn of hs) fn(url, false, "Not connected");
          return;
        }
        sendTimes.set(url, Date.now());
        ws.send(JSON.stringify(["EVENT", event]));
      });
    });
  }

  /**
   * Run a one-shot REQ over the given relays and resolve with deduped events.
   * Resolves as soon as every reachable relay has EOSE'd (or failed to
   * connect), or when maxWait elapses. Records a per-relay `query` outcome
   * so read health feeds the relay ranking shown on the Servers route.
   */
  async querySync(urls, filters, { maxWait = 3000 } = {}) {
    const events = [];
    const seenIds = new Set();

    const fArray = Array.isArray(filters) ? filters : [filters];
    const requests = urls.flatMap((url) => fArray.map((filter) => ({ url, filter })));
    const totalUrls = new Set(requests.map((r) => r.url)).size;

    return new Promise((resolve) => {
      let resolved = false;
      let timer;
      const startTime = Date.now();
      const relayEoseTimes = {};
      const failedUrls = new Set();

      function finish(reason) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        sub.close();

        const elapsed = Date.now() - startTime;
        const outcomes = [...new Set(requests.map((r) => r.url))].map((url) => {
          const eoseAt = relayEoseTimes[url];
          if (eoseAt) return { relay: url, ok: true, latencyMs: eoseAt - startTime };
          return {
            relay: url,
            ok: false,
            latencyMs: elapsed,
            error: `query ${reason}: no EOSE within ${maxWait}ms`,
          };
        });
        recordOutcomes("query", outcomes);

        resolve(events);
      }

      function allSettled() {
        return relayEoseTimes.size + failedUrls.size >= totalUrls;
      }

      const sub = this.subscribeMap(requests, {
        onevent: (event) => {
          if (seenIds.has(event.id)) return;
          seenIds.add(event.id);
          events.push(event);
        },
        oneose: (url) => {
          if (url && !relayEoseTimes[url]) relayEoseTimes[url] = Date.now();
          if (allSettled()) finish("all relays responded");
        },
        onRelayError: (url) => {
          failedUrls.add(url);
          if (allSettled()) finish("remaining relays unreachable");
        },
        onclose: () => {
          finish("subscription closed");
        },
      });

      if (totalUrls === 0) {
        finish("no relays");
        return;
      }

      timer = setTimeout(() => {
        finish("TIMEOUT");
      }, maxWait);
    });
  }

  subscribeMap(requests, { maxWait, onevent, oneose, onclose, onRelayError }) {
    const subId = "sub_" + Math.random().toString(36).slice(2);

    const filtersByUrl = new Map();
    for (const req of requests) {
      if (!filtersByUrl.has(req.url)) filtersByUrl.set(req.url, []);
      filtersByUrl.get(req.url).push(req.filter);
    }

    let isClosed = false;

    const doClose = (reason) => {
      if (isClosed) return;
      isClosed = true;
      this.subs.delete(subId);

      for (const url of filtersByUrl.keys()) {
        const subs = this._subsByUrl.get(url);
        if (subs) subs.delete(subId);
        const ws = this.sockets.get(url);
        if (ws && ws.readyState === WebSocket.OPEN) {
          this._clientClosedSubs.add(`${url}::${subId}`);
          ws.send(JSON.stringify(["CLOSE", subId]));
        }
      }

      if (onclose) onclose([reason || "closed by client"]);
    };

    this.subs.set(subId, { onevent, oneose, close: doClose });

    for (const url of filtersByUrl.keys()) {
      if (!this._subsByUrl.has(url)) this._subsByUrl.set(url, new Set());
      this._subsByUrl.get(url).add(subId);
    }

    for (const [url, filters] of filtersByUrl.entries()) {
      this.ensureRelay(url)
        .then((ws) => {
          if (isClosed) return;
          ws.send(JSON.stringify(["REQ", subId, ...filters]));
        })
        .catch(() => {
          onRelayError?.(url);
        });
    }

    return {
      oneose,
      close: doClose,
    };
  }

  close(urls) {
    for (const url of urls) {
      const ws = this.sockets.get(url);
      if (ws) {
        ws.__intentionalClose = true;
        ws.close();
        this.sockets.delete(url);
        const subsForUrl = this._subsByUrl.get(url);
        if (subsForUrl) {
          for (const subId of [...subsForUrl]) {
            const sub = this.subs.get(subId);
            if (sub?.close) sub.close("pool closed");
          }
          this._subsByUrl.delete(url);
        }
      }
    }
  }
}

export const pool = new WsPool();
