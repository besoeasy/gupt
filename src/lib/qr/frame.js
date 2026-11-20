/**
 * Framing rules for the camera scanner, kept DOM-free so they can be tested.
 *
 * The guide frame sits in the middle of the preview, so decoding a centered
 * square spends pixels on the code instead of the background. A full-frame
 * pass still runs every few frames for a code held outside the guide.
 */

export const SCAN_CROP_RATIO = 0.78;
export const SCAN_CONFIRM_FRAMES = 2;
export const SCAN_CONFIRM_WINDOW_MS = 1500;
export const SCAN_FULL_FRAME_EVERY = 3;

/** A centered square source region, in pixels, for `drawImage`. */
export function centerCrop(width, height, ratio = SCAN_CROP_RATIO) {
  const w = Math.max(0, Math.floor(Number(width) || 0));
  const h = Math.max(0, Math.floor(Number(height) || 0));
  if (!w || !h) return { sx: 0, sy: 0, size: 0 };
  const requested = Number(ratio);
  const share = Math.min(
    1,
    Math.max(0.1, Number.isFinite(requested) ? requested : SCAN_CROP_RATIO),
  );
  const size = Math.max(1, Math.round(Math.min(w, h) * share));
  return {
    sx: Math.floor((w - size) / 2),
    sy: Math.floor((h - size) / 2),
    size,
  };
}

/**
 * Require the same payload on two frames before handing it to the app. A
 * single misread that survives Reed–Solomon is unlikely, but confirming costs
 * one frame and keeps a shaky camera from opening the wrong conversation.
 *
 * @param {{text: string, count: number, seenAt: number} | null} previous
 * @param {string | null} text
 * @param {number} now
 * @param {{frames?: number, windowMs?: number}} [options]
 * @returns {{candidate: {text: string, count: number, seenAt: number} | null, confirmed: boolean}}
 */
export function confirmScan(previous, text, now, options = {}) {
  const frames = Math.max(2, Number(options.frames) || SCAN_CONFIRM_FRAMES);
  const windowMs = Math.max(0, options.windowMs ?? SCAN_CONFIRM_WINDOW_MS);

  if (!text) {
    if (previous && now - previous.seenAt > windowMs) return { candidate: null, confirmed: false };
    return { candidate: previous, confirmed: false };
  }

  if (previous && previous.text === text && now - previous.seenAt <= windowMs) {
    const count = previous.count + 1;
    return {
      candidate: { text, count, seenAt: now },
      confirmed: count >= frames,
    };
  }

  return { candidate: { text, count: 1, seenAt: now }, confirmed: false };
}
