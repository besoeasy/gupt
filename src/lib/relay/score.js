export const EWMA_ALPHA = 0.1;
export const EWMA_FAIL_ALPHA = 0.5;
export const NEUTRAL_SCORE = 0.5;

// Relay ranking uses bounded scores, not cumulative counters. A cumulative
// score either grows without bound or needs periodic renormalisation, and a
// read-heavy relay can outrank a good writer forever. The EWMA below stays in
// 0..max, a failure feeds reward 0 so the relay loses rank without ever going
// negative, and no renormalisation is needed.
export const RELAY_SCORE_MAX = 10;
export const RELAY_SCORE_ALPHA = 0.3;
export const WRITE_SCORE_NEUTRAL = 5;
export const READ_SCORE_NEUTRAL = 0.5;
// A relay that has not been exercised for two weeks should not keep the rank
// it earned a month ago. Scores decay toward neutral, so an old champion has
// to prove itself again instead of blocking a newly added relay forever.
export const SCORE_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

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

/**
 * The user-facing reward for one answered request: a relay that answers in
 * 200ms earns 9.8, one that takes 3s earns 7, one that times out earns 0.
 */
export function scoreForLatency(latencyMs) {
  const seconds = Math.max(0, toNumber(latencyMs, 0)) / 1000;
  return Math.max(0, RELAY_SCORE_MAX - seconds);
}

export function updateRelayScore(
  prev,
  reward,
  { max = RELAY_SCORE_MAX, neutral = WRITE_SCORE_NEUTRAL, alpha = RELAY_SCORE_ALPHA } = {},
) {
  const numeric = Number(prev);
  const base = Number.isFinite(numeric) ? Math.max(0, Math.min(max, numeric)) : neutral;
  const target = Math.max(0, Math.min(max, toNumber(reward, 0)));
  return Math.round((base * (1 - alpha) + target * alpha) * 1000) / 1000;
}

/** Pull an unused relay's score back toward neutral over time. */
export function decayRelayScore(
  score,
  updatedAt,
  now = Date.now(),
  { halfLifeMs = SCORE_HALF_LIFE_MS, neutral = WRITE_SCORE_NEUTRAL } = {},
) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return numeric;
  const age = Math.max(0, toNumber(now, 0) - toNumber(updatedAt, 0));
  if (!age) return numeric;
  const factor = 0.5 ** (age / Math.max(1, halfLifeMs));
  return Math.round((neutral + (numeric - neutral) * factor) * 1000) / 1000;
}

function scoreOf(row, operation) {
  if (operation === "query") return Number(row?.readScore ?? READ_SCORE_NEUTRAL);
  if (operation === "blob") return Number(row?.blobScore ?? WRITE_SCORE_NEUTRAL);
  return Number(row?.writeScore ?? WRITE_SCORE_NEUTRAL);
}

function relayModeOf(relay, row, relayModes) {
  return String(relayModes?.[relay] || row?.batteryMode || "")
    .trim()
    .toLowerCase();
}

/**
 * Best-first relay order for one operation. Read-only nodes stay out of writes
 * and blobs. When a blob size is supplied, relays whose last telemetry says the
 * part cannot fit are dropped; an unknown capability still gets a try, because
 * stale telemetry must not make a healthy relay unusable.
 *
 * `scores` is the object returned by getRelayScores() (or a Map keyed by relay).
 * A relay with no history keeps its configured position behind scored relays.
 */
export function rankRelays(
  relays,
  scores = null,
  { operation = "publish", relayModes = null, blobSizeBytes = 0 } = {},
) {
  const list = Array.isArray(relays) ? relays.filter(Boolean) : [];
  if (!list.length) return [];
  const lookup =
    scores instanceof Map
      ? (relay) => scores.get(relay) || null
      : (relay) => (scores && typeof scores === "object" ? scores[relay] || null : null);
  const size = Math.max(0, toNumber(blobSizeBytes, 0));

  return list
    .map((relay, index) => {
      const row = lookup(relay);
      const mode = relayModeOf(relay, row, relayModes);
      const writeBlocked =
        operation !== "query" &&
        (mode === "read_only" || mode === "sync_disabled" || row?.writable === false);
      let fits = true;
      if (size > 0 && operation !== "query") {
        const maxSingleRaw = row?.maxSingleBytes;
        if (maxSingleRaw !== null && maxSingleRaw !== undefined) {
          const maxSingle = Number(maxSingleRaw);
          if (Number.isFinite(maxSingle) && maxSingle > 0 && size > maxSingle) fits = false;
        }
        const remainingRaw = row?.remainingBytes;
        if (remainingRaw !== null && remainingRaw !== undefined) {
          const remaining = Number(remainingRaw);
          if (Number.isFinite(remaining) && size > remaining) fits = false;
        }
      }
      return {
        relay,
        index,
        score: scoreOf(row, operation),
        allowed: !writeBlocked && fits,
      };
    })
    .filter((entry) => entry.allowed)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.relay);
}
