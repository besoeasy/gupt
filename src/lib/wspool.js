export class WsPool {
  constructor() {
    this.sockets = new Map(); // url -> WebSocket
    this.subs = new Map(); // subId -> { onevent, oneose }
  }

  async ensureRelay(url, options = {}) {
    if (this.sockets.has(url)) {
      const ws = this.sockets.get(url);
      if (ws.readyState === WebSocket.OPEN) return ws;
      if (ws.readyState === WebSocket.CONNECTING) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Timeout")),
            options.connectionTimeout || 3000,
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
          reject(new Error("Timeout connecting to " + url));
        }, options.connectionTimeout || 3000);

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
              if (sub && sub.onevent) sub.onevent(data[2]);
            } else if (data[0] === "EOSE") {
              const sub = this.subs.get(data[1]);
              if (sub && sub.oneose) sub.oneose();
            } else if (data[0] === "OK") {
              if (this.publishes && this.publishes.has(data[1])) {
                this.publishes.get(data[1]).forEach((fn) => fn(url, data[2], data[3] || ""));
              }
            }
          } catch (err) {
            // Ignore parse errors
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async publish(urls, event, { maxWait = 12000 } = {}) {
    if (!this.publishes) this.publishes = new Map();
    const eventId = event.id;
    let resolved = false;

    return new Promise((resolve, reject) => {
      let failCount = 0;
      const expected = urls.length;
      if (expected === 0) return reject(new Error("No relays"));

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error("Publish timed out"));
        }
      }, maxWait);

      const handlers = this.publishes.get(eventId) || [];
      handlers.push((url, ok, msg) => {
        if (ok && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ url, ok });
        } else if (!ok) {
          failCount++;
          if (failCount >= expected && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(new Error("All relays rejected the event"));
          }
        }
      });
      this.publishes.set(eventId, handlers);

      // Clean up memory after maxWait
      setTimeout(() => this.publishes.delete(eventId), maxWait + 1000);

      urls.forEach(async (url) => {
        const ws = await this.ensureRelay(url, { connectionTimeout: 3000 }).catch(() => null);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          const hs = this.publishes.get(eventId);
          if (hs) hs.forEach((fn) => fn(url, false, "Not connected"));
          return;
        }
        ws.send(JSON.stringify(["EVENT", event]));
      });
    });
  }

  async querySync(urls, filters, { maxWait = 3000 } = {}) {
    const events = [];
    const seenIds = new Set();

    const requests = urls.flatMap((url) => {
      const fArray = Array.isArray(filters) ? filters : [filters];
      return fArray.map((filter) => ({ url, filter }));
    });

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
      // Patch oneose to resolve early if all relays EOSE
      const originalOneose = sub.oneose;
      sub.oneose = () => {
        if (originalOneose) originalOneose();
        eoseCount++;
        if (eoseCount >= totalUrls) {
          sub.close(); // will trigger resolve
        }
      };

      timer = setTimeout(() => {
        sub.close();
      }, maxWait);
    });
  }

  subscribeMap(requests, { maxWait, onevent, oneose, onclose }) {
    const subId = "sub_" + Math.random().toString(36).slice(2);

    // Group filters by URL
    const filtersByUrl = new Map();
    for (const req of requests) {
      if (!filtersByUrl.has(req.url)) filtersByUrl.set(req.url, []);
      filtersByUrl.get(req.url).push(req.filter);
    }

    this.subs.set(subId, { onevent, oneose });

    let isClosed = false;

    // Open subscriptions on each relay
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
