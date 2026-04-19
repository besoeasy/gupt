// Browser Notifications API helper — no server required.
// Works whenever the app is running (background tab, installed PWA).
// Notifications are not shown when the app window is visible.

import { useSettingsStore } from "@/stores/settings";

function settings() {
  try {
    return useSettingsStore();
  } catch {
    return null;
  }
}

// ─── Sound ───────────────────────────────────────────────────────────────────

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

/**
 * Call once on the first user gesture (click/keydown) so the AudioContext
 * is pre-resumed and ready before any message arrives.
 */
export function warmUpAudio() {
  try {
    const ctx = getAudioCtx();
    console.log("[gupt-audio] warmUpAudio called, state:", ctx.state);
    if (ctx.state === "suspended") {
      ctx.resume().then(() => console.log("[gupt-audio] context resumed via warmUp"));
    }
  } catch (err) {
    console.warn("[gupt-audio] warmUpAudio failed:", err);
  }
}

/**
 * Play a soft two-tone ping — fires even when the tab is visible,
 * identical to WhatsApp/Telegram web behaviour.
 */
export async function playMessageSound() {
  try {
    if (settings()?.soundEnabled === false) return;
    const ctx = getAudioCtx();
    console.log("[gupt-audio] playMessageSound called, state:", ctx.state);
    // Must await resume — context starts suspended until a user gesture
    if (ctx.state === "suspended") {
      await ctx.resume();
      console.log("[gupt-audio] context resumed, new state:", ctx.state);
    }

    const now = ctx.currentTime;
    console.log("[gupt-audio] scheduling ping at currentTime:", now);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    // Rising tone: A5 → E6
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.01); // fast attack
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35); // gentle decay

    osc.start(now);
    osc.stop(now + 0.35);
    console.log("[gupt-audio] ping scheduled OK");
  } catch (err) {
    console.warn("[gupt-audio] playMessageSound failed:", err);
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
  if (settings()?.notificationsEnabled === false) return false;
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
    try {
      window.gupt?.focusWindow?.();
    } catch {
      /* web fallback below */
    }
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
    try {
      window.gupt?.focusWindow?.();
    } catch {
      /* web fallback below */
    }
    window.focus();
    n.close();
  };
}
