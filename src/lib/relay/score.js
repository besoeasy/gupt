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

export function publishSamples(row) {
  return Math.max(0, toNumber(row?.publishOk, 0)) + Math.max(0, toNumber(row?.publishFail, 0));
}

export function querySamples(row) {
  return Math.max(0, toNumber(row?.queryOk, 0)) + Math.max(0, toNumber(row?.queryFail, 0));
}

export function trafficSamples(row) {
  return publishSamples(row) + querySamples(row);
}

/**
 * Rank from observed publish (write: EVENT+OK) and query (read: REQ+EOSE) only.
 * Connect handshakes and seeded values do not count. Untested → NEUTRAL_SCORE.
 * When both dimensions have samples, take the min so a write-only or read-only
 * success cannot hide failure on the other side.
 */
export function relayScore(row) {
  const writes = publishSamples(row);
  const reads = querySamples(row);
  const publish = toNumber(row?.publishOkEwma, 0);
  const query = toNumber(row?.queryOkEwma, 0);
  if (writes && reads) return Math.min(publish, query);
  if (writes) return publish;
  if (reads) return query;
  return NEUTRAL_SCORE;
}

export function rankingLatencyMs(row) {
  const writes = publishSamples(row);
  const reads = querySamples(row);
  const publishMs = toNumber(row?.publishLatencyEwmaMs, 0);
  const queryMs = toNumber(row?.queryLatencyEwmaMs, 0);
  if (writes && publishMs) return publishMs;
  if (reads && queryMs) return queryMs;
  return publishMs || queryMs || 0;
}
