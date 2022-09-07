const CHANNEL_NAME = "gupt-messenger-sync";

let broadcaster = null;
let channel = null;

export function initCacheBroadcast(handler) {
  if (typeof BroadcastChannel === "undefined") return () => {};

  channel?.close?.();
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    handler?.(event.data);
  };

  broadcaster = (payload) => {
    try {
      channel?.postMessage(payload);
    } catch {
      // Ignore cross-tab broadcast failures.
    }
  };

  return broadcaster;
}

export function broadcastCacheEvent(payload) {
  broadcaster?.(payload);
}

export function closeCacheBroadcast() {
  channel?.close?.();
  channel = null;
  broadcaster = null;
}
