export function triggerHaptic(pattern = 10) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {}
}

export const HAPTIC = {
  tap: 8,
  swipe: 12,
  copy: 14,
  send: [8, 20, 10],
  success: [10, 30, 15],
  error: [25, 40, 25],
};
