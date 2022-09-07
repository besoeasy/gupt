// In-app message sound — fires when the tab is visible (WhatsApp/Telegram-style).

import { useSettingsStore } from "@/stores/settings";

function settings() {
  try {
    return useSettingsStore();
  } catch {
    return null;
  }
}

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
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.start(now);
    osc.stop(now + 0.35);
    console.log("[gupt-audio] ping scheduled OK");
  } catch (err) {
    console.warn("[gupt-audio] playMessageSound failed:", err);
  }
}
