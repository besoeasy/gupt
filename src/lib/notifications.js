// Browser Notifications API helper — no server required.
// Works whenever the app is running (background tab, installed PWA).
// Notifications are not shown when the app window is visible.

// ─── Sound ───────────────────────────────────────────────────────────────────

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if the context was suspended (browser autoplay policy)
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

/**
 * Play a soft two-tone ping — fires even when the tab is visible,
 * identical to WhatsApp/Telegram web behaviour.
 */
export function playMessageSound() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    // Rising tone: A5 → E6
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.01);   // fast attack
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35); // gentle decay

    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // AudioContext blocked before first user interaction — silently ignore
  }
}

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
