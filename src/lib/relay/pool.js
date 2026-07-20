import { CONNECT_TIMEOUT_MS } from "./constants.js";

export class WsPool {
  constructor() {
    this.sockets = new Map();
    this.subs = new Map();
    this._publishHandlers = new Map();
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
          resolve(ws);
        });

        ws.addEventListener("error", () => {
          clearTimeout(timeout);
          reject(new Error(`Failed to connect to ${url}`));
        });

        ws.addEventListener("close", () => {
          this.sockets.delete(url);
        });

        ws.addEventListener("message", (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data[0] === "EVENT") {
              const sub = this.subs.get(data[1]);
              if (sub?.onevent) sub.onevent(data[2]);
            } else if (data[0] === "EOSE") {
              const sub = this.subs.get(data[1]);
              if (sub?.oneose) sub.oneose();
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

  async querySync(urls, filters, { maxWait = 3000 } = {}) {
    const events = [];
    const seenIds = new Set();

    const fArray = Array.isArray(filters) ? filters : [filters];
    const requests = urls.flatMap((url) => fArray.map((filter) => ({ url, filter })));

    return new Promise((resolve) => {
      let timer;
      const sub = this.subscribeMap(requests, {
        onevent: (event) => {
          if (seenIds.has(event.id)) return;
          seenIds.add(event.id);
          events.push(event);
        },
        onclose: () => {
          clearTimeout(timer);
          resolve(events);
        },
      });

      let eoseCount = 0;
      const totalUrls = new Set(requests.map((r) => r.url)).size;
      const originalOneose = sub.oneose;
      sub.oneose = () => {
        if (originalOneose) originalOneose();
        eoseCount++;
        if (eoseCount >= totalUrls) sub.close();
      };

      timer = setTimeout(() => {
        sub.close();
      }, maxWait);
    });
  }

  subscribeMap(requests, { maxWait, onevent, oneose, onclose }) {
    const subId = "sub_" + Math.random().toString(36).slice(2);

    const filtersByUrl = new Map();
    for (const req of requests) {
      if (!filtersByUrl.has(req.url)) filtersByUrl.set(req.url, []);
      filtersByUrl.get(req.url).push(req.filter);
    }

    this.subs.set(subId, { onevent, oneose });

    let isClosed = false;

    for (const [url, filters] of filtersByUrl.entries()) {
      this.ensureRelay(url)
        .then((ws) => {
          if (isClosed) return;
          ws.send(JSON.stringify(["REQ", subId, ...filters]));
        })
        .catch(() => {});
    }

    return {
      oneose,
      close: (reason) => {
        if (isClosed) return;
        isClosed = true;
        this.subs.delete(subId);

        for (const url of filtersByUrl.keys()) {
          const ws = this.sockets.get(url);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(["CLOSE", subId]));
          }
        }

        if (onclose) onclose([reason || "closed by client"]);
      },
    };
  }

  close(urls) {
    for (const url of urls) {
      const ws = this.sockets.get(url);
      if (ws) {
        ws.close();
        this.sockets.delete(url);
      }
    }
  }
}

export const pool = new WsPool();
