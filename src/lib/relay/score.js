export const EWMA_ALPHA = 0.1;
export const EWMA_FAIL_ALPHA = 0.5;
export const NEUTRAL_SCORE = 0.5;

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function updateLatencyEwma(prevEwma, prevSamples, latencyMs) {
  if (!toNumber(prevSamples, 0)) return Math.max(0, toNumber(latencyMs, 0));
  const prev = Math.max(0, toNumber(prevEwma, 0));
  return Math.round(EWMA_ALPHA * Math.max(0, toNumber(latencyMs, 0)) + (1 - EWMA_ALPHA) * prev);
}

export function updateOkEwma(prevEwma, prevSamples, ok) {
  const prev = prevSamples ? toNumber(prevEwma, NEUTRAL_SCORE) : NEUTRAL_SCORE;
  const alpha = ok ? EWMA_ALPHA : EWMA_FAIL_ALPHA;
  const reward = ok ? 1 : 0;
  return Math.round((alpha * reward + (1 - alpha) * prev) * 1000) / 1000;
}
