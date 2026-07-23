import { normalizeRelayUrl, DEFAULT_RELAYS } from "@/config/servers.js";
import { EXPLOIT_SLOTS, EXPLORE_SLOTS } from "./constants.js";
import { getRelayRanking, deleteRelayStats } from "../idb.js";

export const MAX_KNOWN_RELAYS_THRESHOLD = 100;
export const BATCH_EVICT_COUNT = 10;
export const TERRIBLE_SCORE_THRESHOLD = 0.15;

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

let knownRelays = dedupeRelays(DEFAULT_RELAYS);
let hintRelays = [];

function refreshKnownRelays(extraRelays = []) {
  const custom = loadCustomRelays();
  knownRelays = dedupeRelays([...DEFAULT_RELAYS, ...custom, ...hintRelays, ...extraRelays]);
}

/**
 * Batch-evicts worst-performing hint relays.
 * When total relays reach MAX_KNOWN_RELAYS_THRESHOLD (100), the worst BATCH_EVICT_COUNT (10)
 * hint relays are evicted in a batch to prevent list bloat without frequent churn.
 * Relays with severely failing scores (<= 0.15 with >= 3 samples) are also evicted.
 * Bootstrap/DEFAULT_RELAYS and user-added Custom relays are protected from auto-deletion.
 */
export async function evictWorstRelays() {
  if (!hintRelays.length) return [];

  const ranking = await getRelayRanking();
  const rankMap = new Map(ranking.map((r) => [r.relay, r]));

  // 1. Identify hint relays with failing scores (<= 0.15 with >= 3 samples)
  const failing = hintRelays.filter((relay) => {
    const r = rankMap.get(relay);
    return r && r.score <= TERRIBLE_SCORE_THRESHOLD && r.samples >= 3;
  });

  const totalCount = getKnownRelays().length;
  const isOverflow =
    totalCount >= MAX_KNOWN_RELAYS_THRESHOLD || hintRelays.length >= MAX_KNOWN_RELAYS_THRESHOLD;

  if (!failing.length && !isOverflow) {
    return [];
  }

  // 2. Sort hint relays ascending by score (worst first)
  const sortedHints = [...hintRelays].sort((a, b) => {
    const scoreA = rankMap.get(a)?.score ?? 0.5;
    const scoreB = rankMap.get(b)?.score ?? 0.5;
    return scoreA - scoreB;
  });

  const toEvict = new Set(failing);

  // 3. If threshold (100) reached, evict the worst BATCH_EVICT_COUNT (10) relays
  if (isOverflow && toEvict.size < BATCH_EVICT_COUNT) {
    for (const relay of sortedHints) {
      toEvict.add(relay);
      if (toEvict.size >= BATCH_EVICT_COUNT) break;
    }
  }

  const evicted = Array.from(toEvict);
  hintRelays = hintRelays.filter((r) => !toEvict.has(r));
  refreshKnownRelays();

  if (evicted.length) {
    void deleteRelayStats(evicted).catch(() => {});
  }

  return evicted;
}

export function addHintRelay(relay) {
  const normalized = normalizeRelay(relay);
  if (!normalized) return null;
  if (!knownRelays.includes(normalized)) {
    hintRelays = [...hintRelays, normalized];
    refreshKnownRelays();
    void evictWorstRelays();
  }
  return normalized;
}

export function getKnownRelays() {
  refreshKnownRelays();
  return [...knownRelays];
}

export async function readRelays() {
  const allKnown = getKnownRelays();
  if (!allKnown.length) return [...DEFAULT_RELAYS];

  const ranking = await getRelayRanking();

  if (!ranking.length) return shuffle(allKnown);

  const ranked = new Set(ranking.map((r) => r.relay));
  const exploitSet = ranking.slice(0, EXPLOIT_SLOTS).map((r) => r.relay);

  const untested = allKnown.filter((url) => !ranked.has(url));
  const exploreSet = shuffle(untested).slice(0, EXPLORE_SLOTS);

  return dedupeRelays([...exploitSet, ...exploreSet]);
}

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

export function getCustomRelays() {
  return loadCustomRelays();
}

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

export async function rememberRelayHint(relay) {
  const normalized = normalizeRelay(relay);
  if (!normalized) return null;
  addHintRelay(normalized);
  try {
    const { pool } = await import("./pool.js");
    const { CONNECT_TIMEOUT_MS } = await import("./constants.js");
    await pool.ensureRelay(normalized, { connectionTimeout: CONNECT_TIMEOUT_MS });
  } catch {}
  return normalized;
}
