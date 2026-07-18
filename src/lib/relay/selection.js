/**
 * Relay selection — ε-greedy multi-armed bandit for smart relay selection,
 * plus relay set management (known, active, read, write sets).
 */

import { normalizeRelayUrl, DEFAULT_RELAYS } from "@/config/servers.js";
import {
  BANDIT_ALPHA,
  BANDIT_DECAY_HALF_LIFE_MS,
  BANDIT_DEFAULT_SCORE,
  BANDIT_PERSIST_DEBOUNCE_MS,
  BANDIT_EXPLOIT_COUNT,
  BANDIT_EXPLORE_COUNT,
  MAX_ACTIVE_RELAYS,
  HINT_BOOST,
  classifyScore,
} from "./constants.js";

const STORAGE_KEY = "gupt-relay-bandit-scores";

// ---------------------------------------------------------------------------
// Score map — in-memory, flushed to localStorage periodically
// ---------------------------------------------------------------------------

/** @type {Map<string, { score: number, ops: number, lastSeenAt: number | null }>} */
let scoreMap = new Map();
let persistTimer = null;
let loaded = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeRelay(relay) {
  return normalizeRelayUrl(relay);
}

export function dedupeRelays(relays) {
  return [...new Set(relays.map(normalizeRelay).filter(Boolean))];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

      let score = clamp(entry.score, 0, 1);
      const lastSeenAt = entry.lastSeenAt || null;
      if (lastSeenAt) {
        const ageMs = now - lastSeenAt;
        const decayFactor = Math.pow(0.5, ageMs / BANDIT_DECAY_HALF_LIFE_MS);
        score = BANDIT_DEFAULT_SCORE + (score - BANDIT_DEFAULT_SCORE) * decayFactor;
        score = clamp(score, 0, 1);
      }

      scoreMap.set(url, {
        score,
        ops: Math.max(0, Number(entry.ops || 0)),
        lastSeenAt,
      });
    }
  } catch {
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
      // Ignore
    }
  }, BANDIT_PERSIST_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Core EWA update
// ---------------------------------------------------------------------------

/**
 * Record the outcome of an operation on a single relay.
 * @param {string} url
 * @param {boolean} success
 */
export function recordBanditOutcome(url, success) {
  if (!url) return;
  loadScores();

  const existing = scoreMap.get(url);
  const oldScore = existing?.score ?? BANDIT_DEFAULT_SCORE;
  const reward = success ? 1.0 : 0.0;
  const newScore = clamp((1 - BANDIT_ALPHA) * oldScore + BANDIT_ALPHA * reward, 0, 1);

  scoreMap.set(url, {
    score: newScore,
    ops: (existing?.ops ?? 0) + 1,
    lastSeenAt: Date.now(),
  });

  schedulePersist();
}

/**
 * Record outcomes for multiple relays at once.
 * @param {{ relay: string, ok: boolean }[]} outcomes
 */
export function recordBanditOutcomes(outcomes) {
  if (!Array.isArray(outcomes) || !outcomes.length) return;
  loadScores();
  for (const { relay, ok } of outcomes) {
    if (relay) recordBanditOutcome(relay, Boolean(ok));
  }
}

/**
 * Give a small score boost to a newly discovered relay (ops === 0).
 * Once the bandit has recorded real outcomes (ops > 0), this becomes a no-op
 * so the score reflects actual performance.
 * @param {string} url
 */
export function boostBanditScore(url) {
  if (!url) return;
  loadScores();
  const existing = scoreMap.get(url);
  if (existing && existing.ops > 0) return;
  const oldScore = existing?.score ?? BANDIT_DEFAULT_SCORE;
  const newScore = clamp(oldScore + HINT_BOOST, 0, 1);
  scoreMap.set(url, {
    score: newScore,
    ops: existing?.ops ?? 0,
    lastSeenAt: Date.now(),
  });
  schedulePersist();
}

// ---------------------------------------------------------------------------
// Relay selection (ε-greedy)
// ---------------------------------------------------------------------------

/**
 * Select the active relay set.
 * Returns BANDIT_EXPLOIT_COUNT top-scored + BANDIT_EXPLORE_COUNT random from rest.
 * If pool is smaller than both, returns all relays.
 *
 * @param {string[]} allRelays
 * @returns {string[]}
 */
export function selectRelays(allRelays) {
  if (!allRelays.length) return [];
  loadScores();

  const scored = allRelays.map((url) => ({
    url,
    score: scoreMap.get(url)?.score ?? BANDIT_DEFAULT_SCORE,
  }));

  scored.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  if (scored.length <= BANDIT_EXPLOIT_COUNT + BANDIT_EXPLORE_COUNT) {
    return scored.map((r) => r.url);
  }

  const exploitSet = scored.slice(0, BANDIT_EXPLOIT_COUNT).map((r) => r.url);
  const explorePool = scored.slice(BANDIT_EXPLOIT_COUNT).map((r) => r.url);
  const exploreSet = shuffle(explorePool).slice(0, BANDIT_EXPLORE_COUNT);

  return [...exploitSet, ...exploreSet];
}

// ---------------------------------------------------------------------------
// Stats / leaderboard
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
      tier: classifyScore(entry.score, entry.ops),
    });
  }
  entries.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return entries;
}

/**
 * Returns the current active selection: { exploitRelays, exploreRelays }.
 * @param {string[]} allRelays
 */
export function getBanditSelection(allRelays) {
  loadScores();
  const scored = allRelays.map((url) => ({
    url,
    score: scoreMap.get(url)?.score ?? BANDIT_DEFAULT_SCORE,
  }));
  scored.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  if (scored.length <= BANDIT_EXPLOIT_COUNT + BANDIT_EXPLORE_COUNT) {
    return { exploitRelays: scored.map((r) => r.url), exploreRelays: [] };
  }

  const exploitRelays = scored.slice(0, BANDIT_EXPLOIT_COUNT).map((r) => r.url);
  const explorePool = scored.slice(BANDIT_EXPLOIT_COUNT).map((r) => r.url);
  const exploreRelays = shuffle(explorePool).slice(0, BANDIT_EXPLORE_COUNT);

  return { exploitRelays, exploreRelays };
}

/**
 * Force-flush scores to localStorage immediately.
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
 * Reset all scores.
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

// ---------------------------------------------------------------------------
// Relay set management (module-level state)
// ---------------------------------------------------------------------------

let knownRelays = dedupeRelays(DEFAULT_RELAYS);
let activeRelays = [];
let hintRelays = [];

function refreshKnownRelays(extraRelays = []) {
  const custom = loadCustomRelays();
  knownRelays = dedupeRelays([...DEFAULT_RELAYS, ...custom, ...hintRelays, ...extraRelays]);
}

function setActiveRelays(relays) {
  const deduped = dedupeRelays(relays);
  activeRelays =
    deduped.length > MAX_ACTIVE_RELAYS
      ? deduped.slice(deduped.length - MAX_ACTIVE_RELAYS)
      : deduped;
}

/**
 * Learn about a relay discovered through a peer hint.
 * Adds it to the known set so the bandit can select it, and gives it a small
 * score boost if it hasn't been tested yet.
 * @param {string} relay
 * @returns {string|null} normalized relay URL
 */
export function addHintRelay(relay) {
  const normalized = normalizeRelay(relay);
  if (!normalized) return null;
  if (!hintRelays.includes(normalized)) {
    hintRelays = [...hintRelays, normalized];
    refreshKnownRelays();
  }
  boostBanditScore(normalized);
  return normalized;
}

export { setActiveRelays };

export function getKnownRelays() {
  refreshKnownRelays();
  return [...knownRelays];
}

export function getActiveRelays() {
  return [...activeRelays];
}

export function readRelays() {
  const candidates = knownRelays.length ? [...knownRelays] : [...DEFAULT_RELAYS];
  return dedupeRelays([...selectRelays(candidates)]);
}

export function writeRelays() {
  return activeRelays.length ? [...activeRelays] : readRelays();
}

// ---------------------------------------------------------------------------
// Custom relays — user-added relays persisted to localStorage
// ---------------------------------------------------------------------------

const CUSTOM_RELAYS_KEY = "gupt_custom_relays";

function loadCustomRelays() {
  try {
    const raw = localStorage.getItem(CUSTOM_RELAYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeRelays(parsed.map(normalizeRelay).filter(Boolean));
  } catch {
    return [];
  }
}

function saveCustomRelays(relays) {
  try {
    localStorage.setItem(CUSTOM_RELAYS_KEY, JSON.stringify(relays));
  } catch {}
}

/**
 * Get all user-added custom relays.
 * @returns {string[]}
 */
export function getCustomRelays() {
  return loadCustomRelays();
}

/**
 * Add a custom relay. Returns the normalized URL on success, null if invalid/duplicate.
 * @param {string} url
 * @returns {string|null}
 */
export function addCustomRelay(url) {
  const normalized = normalizeRelay(url);
  if (!normalized) return null;

  const custom = loadCustomRelays();
  if (custom.includes(normalized)) return null;

  custom.push(normalized);
  saveCustomRelays(custom);
  refreshKnownRelays(custom);
  return normalized;
}

/**
 * Remove a custom relay.
 * @param {string} url
 * @returns {boolean} true if removed
 */
export function removeCustomRelay(url) {
  const normalized = normalizeRelay(url);
  if (!normalized) return false;

  const custom = loadCustomRelays();
  const idx = custom.indexOf(normalized);
  if (idx === -1) return false;

  custom.splice(idx, 1);
  saveCustomRelays(custom);
  refreshKnownRelays(custom);
  return true;
}

export { setActiveRelays as _setActiveRelays, refreshKnownRelays as _refreshKnownRelays };

/**
 * Store a relay hint: normalize, add to known set, connect if needed.
 * @param {string} relay
 * @returns {Promise<string|null>} normalized relay URL
 */
export async function rememberRelayHint(relay) {
  const normalized = normalizeRelay(relay);
  if (!normalized) return null;
  refreshKnownRelays([normalized]);
  if (!activeRelays.includes(normalized)) {
    try {
      const { pool } = await import("./pool.js");
      const { CONNECT_TIMEOUT_MS } = await import("./constants.js");
      await pool.ensureRelay(normalized, { connectionTimeout: CONNECT_TIMEOUT_MS });
      setActiveRelays([...activeRelays, normalized]);
    } catch {
      // The relay may still be readable/writable later even if the initial probe fails.
    }
  }
  return normalized;
}
