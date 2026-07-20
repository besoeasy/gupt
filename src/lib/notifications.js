

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

export function warmUpAudio() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
  } catch (err) {
    console.warn("[gupt-audio] warmUpAudio failed:", err);
  }
}

export async function playMessageSound() {
  try {
    if (settings()?.soundEnabled === false) return;
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const now = ctx.currentTime;

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
  } catch (err) {
    console.warn("[gupt-audio] playMessageSound failed:", err);
  }
}
