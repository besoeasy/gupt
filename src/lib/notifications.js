// Browser Notifications API helper — no server required.
// Works whenever the app is running (background tab, installed PWA).
// Notifications are not shown when the app window is visible.

export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function canNotify() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

/**
 * Show a browser notification.
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.body]
 * @param {string} [opts.tag]  - deduplicates per-room: only the latest notification per tag is shown
 */
export function showIncomingNotification({ title = "GUPT", body = "New message", tag } = {}) {
  console.log("[gupt-notif] showIncomingNotification called", {
    canNotify: canNotify(),
    hidden: document.hidden,
    tag,
  });
  if (!canNotify()) return;
  // Suppress when the user is already looking at the app
  if (!document.hidden) return;

  const n = new Notification(title, {
    body,
    icon: "/pwa-192x192.svg",
    badge: "/pwa-192x192.svg",
    tag: tag ?? "gupt-message",
    renotify: false,
  });

  n.onclick = () => {
    window.focus();
    n.close();
  };
}

/**
 * Show a mention notification — fires even when the app tab is visible,
 * so the user always gets alerted when someone @-tags them (Telegram-style).
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.body]
 * @param {string} [opts.tag]
 */
export function showMentionNotification({
  title = "GUPT — Mentioned you",
  body = "Someone mentioned you",
  tag,
} = {}) {
  if (!canNotify()) return;
  const n = new Notification(title, {
    body,
    icon: "/pwa-192x192.svg",
    badge: "/pwa-192x192.svg",
    tag: tag ? `mention-${tag}` : "gupt-mention",
    renotify: true,
  });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}
