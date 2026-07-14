/**
 * Relay Bandit — ε-greedy multi-armed bandit for smart relay selection.
 *
 * Algorithm:
 *   - Every relay has a score in [0.0, 1.0] updated via Exponentially Weighted
 *     Average (EWA) after each real connect/publish/query operation.
 *   - On each connection cycle, pick the top EXPLOIT_COUNT (5) best-scoring
 *     relays to exploit, and EXPLORE_COUNT (2) random relays from the rest to
 *     explore. This gives a guaranteed 7-relay active set.
 *   - Scores are persisted to localStorage so they survive page reloads, with a
 *     time-decay applied on load so stale data doesn't lock in bad choices.
 *   - Relays never seen get a neutral score of 0.5 — they start competitive and
 *     get promoted or demoted by real traffic.
 *
 * Key constants:
 *   ALPHA         — EWA learning rate. Higher = adapts faster to recent results.
 *   DECAY_HALF_LIFE_MS — How long until an untouched relay's score decays 50%.
 *   EXPLOIT_COUNT — How many top-scored relays to always include.
 *   EXPLORE_COUNT — How many random non-top relays to include (exploration budget).
 */

const STORAGE_KEY = "gupt-relay-bandit-scores";
const ALPHA = 0.3; // EWA learning rate — slightly faster for large relay pools
const DECAY_HALF_LIFE_MS = 4 * 24 * 60 * 60 * 1000; // 4 days — quicker neutral reset for 313-relay pool
const DEFAULT_SCORE = 0.5; // Neutral start for unseen relays
const PERSIST_DEBOUNCE_MS = 10_000; // Flush to localStorage at most every 10s
const EXPLOIT_COUNT = 8; // Top-N relays to always use (restored to 8 since anchors were removed)
const EXPLORE_COUNT = 4; // Random explore slots

// ---------------------------------------------------------------------------
// Score map — in-memory, flushed to localStorage periodically
// ---------------------------------------------------------------------------

/**
 * @type {Map<string, { score: number, ops: number, lastSeenAt: number | null }>}
 */
let scoreMap = new Map();
let persistTimer = null;
let loaded = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function serializeScores() {
  const obj = {};
  for (const [url, entry] of scoreMap.entries()) {
    obj[url] = { score: entry.score, ops: entry.ops, lastSeenAt: entry.lastSeenAt };
  }
  return JSON.stringify(obj);
}

function loadScores() {
  if (loaded) return;
  loaded = true;

  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    const now = Date.now();
    for (const [url, entry] of Object.entries(parsed)) {
      if (!url || typeof entry?.score !== "number") continue;

      // Apply time decay based on how long ago we last saw this relay
      let score = clamp(entry.score, 0, 1);
      const lastSeenAt = entry.lastSeenAt || null;
      if (lastSeenAt) {
        const ageMs = now - lastSeenAt;
        // Half-life decay: score halves every DECAY_HALF_LIFE_MS of inactivity
        const decayFactor = Math.pow(0.5, ageMs / DECAY_HALF_LIFE_MS);
        // Decay toward 0.5 (neutral), not toward 0 — so a forgotten relay
        // gets another fair chance rather than being permanently blacklisted.
        score = DEFAULT_SCORE + (score - DEFAULT_SCORE) * decayFactor;
        score = clamp(score, 0, 1);
      }

      scoreMap.set(url, {
        score,
        ops: Math.max(0, Number(entry.ops || 0)),
        lastSeenAt,
      });
    }
  } catch {
    // Corrupt storage — start fresh
    scoreMap = new Map();
  }
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, serializeScores());
      }
    } catch {
      // Ignore storage failures
    }
  }, PERSIST_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Core EWA update
// ---------------------------------------------------------------------------

/**
 * Record the outcome of an operation on a relay.
 * @param {string} url  Relay WebSocket URL
 * @param {boolean} success  Whether the operation succeeded
 */
export function recordBanditOutcome(url, success) {
  if (!url) return;
  loadScores();

  const existing = scoreMap.get(url);
  const oldScore = existing?.score ?? DEFAULT_SCORE;
  const reward = success ? 1.0 : 0.0;
  const newScore = clamp((1 - ALPHA) * oldScore + ALPHA * reward, 0, 1);

  scoreMap.set(url, {
    score: newScore,
    ops: (existing?.ops ?? 0) + 1,
    lastSeenAt: Date.now(),
  });

  schedulePersist();
}

/**
 * Record outcomes for multiple relays at once (from recordRelayOutcomes calls).
 * @param {{ relay: string, ok: boolean }[]} outcomes
 */
export function recordBanditOutcomes(outcomes) {
  if (!Array.isArray(outcomes) || !outcomes.length) return;
  loadScores();
  for (const { relay, ok } of outcomes) {
    if (relay) recordBanditOutcome(relay, Boolean(ok));
  }
}

// ---------------------------------------------------------------------------
// Relay selection
// ---------------------------------------------------------------------------

/**
 * Fisher-Yates shuffle — returns a new array.
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Select the active relay set using the ε-greedy bandit algorithm.
 *
 * Returns EXPLOIT_COUNT top-scored relays + EXPLORE_COUNT random relays
 * from the remaining pool, deduplicated. If the pool is smaller than
 * EXPLOIT_COUNT + EXPLORE_COUNT, all relays are returned.
 *
 * @param {string[]} allRelays  Full list of candidate relay URLs
 * @returns {string[]}  Selected relay URLs (max EXPLOIT_COUNT + EXPLORE_COUNT)
 */
export function selectRelays(allRelays) {
  if (!allRelays.length) return [];
  loadScores();

  // Score every relay — unseen ones get DEFAULT_SCORE
  const scored = allRelays.map((url) => ({
    url,
    score: scoreMap.get(url)?.score ?? DEFAULT_SCORE,
  }));

  // Sort descending by score (stable, ties broken by URL for determinism)
  scored.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  if (scored.length <= EXPLOIT_COUNT + EXPLORE_COUNT) {
    // Not enough relays to split — use them all
    return scored.map((r) => r.url);
  }

  // Exploit: top EXPLOIT_COUNT
  const exploitSet = scored.slice(0, EXPLOIT_COUNT).map((r) => r.url);

  // Explore: 2 random from the remaining pool
  const explorePool = scored.slice(EXPLOIT_COUNT).map((r) => r.url);
  const exploreSet = shuffle(explorePool).slice(0, EXPLORE_COUNT);

  return [...exploitSet, ...exploreSet];
}

// ---------------------------------------------------------------------------
// Stats / leaderboard queries (for Settings / StatsView)
// ---------------------------------------------------------------------------

/**
 * Returns all scored relays sorted by score descending.
 * Each entry: { url, score, ops, lastSeenAt, tier }
 */
export function getBanditLeaderboard() {
  loadScores();
  const entries = [];
  for (const [url, entry] of scoreMap.entries()) {
    entries.push({
      url,
      score: entry.score,
      ops: entry.ops,
      lastSeenAt: entry.lastSeenAt,
      tier: scoreTier(entry.score, entry.ops),
    });
  }
  entries.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return entries;
}

/**
 * Returns the current active selection: { exploitRelays, exploreRelays }.
 * Useful for the settings page to show which relays are in which slot.
 * @param {string[]} allRelays
 */
export function getBanditSelection(allRelays) {
  loadScores();
  const scored = allRelays.map((url) => ({
    url,
    score: scoreMap.get(url)?.score ?? DEFAULT_SCORE,
  }));
  scored.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  if (scored.length <= EXPLOIT_COUNT + EXPLORE_COUNT) {
    return { exploitRelays: scored.map((r) => r.url), exploreRelays: [] };
  }

  const exploitRelays = scored.slice(0, EXPLOIT_COUNT).map((r) => r.url);
  const explorePool = scored.slice(EXPLOIT_COUNT).map((r) => r.url);
  const exploreRelays = shuffle(explorePool).slice(0, EXPLORE_COUNT);

  return { exploitRelays, exploreRelays };
}

/**
 * Classify a score into a display tier.
 * @param {number} score
 * @param {number} ops  Number of observed operations
 * @returns {'champion'|'good'|'degraded'|'poor'|'new'}
 */
export function scoreTier(score, ops = 0) {
  if (ops < 3) return "new"; // Not enough data
  if (score >= 0.75) return "champion";
  if (score >= 0.5) return "good";
  if (score >= 0.25) return "degraded";
  return "poor";
}

/**
 * Human-readable score percentage string.
 * @param {number} score
 */
export function formatScore(score) {
  return `${Math.round(score * 100)}%`;
}

/**
 * Force-flush score map to localStorage immediately.
 * Call this on page unload / visibilitychange to avoid data loss.
 */
export function flushBanditScores() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, serializeScores());
    }
  } catch {
    // Ignore
  }
}

/**
 * Reset all scores (for testing or user-initiated reset).
 */
export function resetBanditScores() {
  scoreMap = new Map();
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

export const BANDIT_EXPLOIT_COUNT = EXPLOIT_COUNT;
export const BANDIT_EXPLORE_COUNT = EXPLORE_COUNT;
