import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { normalizeRelayUrl, readConfiguredRelays, saveConfiguredRelays } from "@/config/servers.js";
import { EXPLOIT_SLOTS, EXPLORE_SLOTS } from "./constants.js";
import { getRelayRanking, deleteRelayStats } from "../idb.js";

export const MAX_KNOWN_RELAYS_THRESHOLD = 100;
export const BATCH_EVICT_COUNT = 10;
export const TERRIBLE_SCORE_THRESHOLD = 0.15;
export const HINT_MIN_SCORE = 0.5;

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

let knownRelays = dedupeRelays(readConfiguredRelays());
let hintRelays = [];

function refreshKnownRelays(extraRelays = []) {
  const configured = readConfiguredRelays();
  knownRelays = dedupeRelays([...configured, ...hintRelays, ...extraRelays]);
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

export function relayHintHash(relay) {
  return bytesToHex(sha256(new TextEncoder().encode(normalizeRelay(relay) || String(relay))));
}

/**
 * Picks the relay to advertise in the `p` tag hint.
 * Random among relays scoring >= HINT_MIN_SCORE; when none qualify, falls back
 * to the highest-scoring relay with sha256(url) as a deterministic tie-breaker.
 */
export async function pickRelayHint() {
  const ranking = await getRelayRanking();
  if (!ranking.length) return null;

  const healthy = ranking.filter((r) => (r.score ?? 0) >= HINT_MIN_SCORE);
  if (healthy.length) {
    return healthy[Math.floor(Math.random() * healthy.length)].relay;
  }

  const best = Math.max(...ranking.map((r) => r.score ?? 0));
  const tied = ranking.filter((r) => (r.score ?? 0) === best);
  return tied.reduce((a, b) => (relayHintHash(a.relay) < relayHintHash(b.relay) ? a : b)).relay;
}

export function getCustomRelays() {
  return readConfiguredRelays();
}

export function addCustomRelay(url) {
  const normalized = normalizeRelay(url);
  if (!normalized) return null;

  const current = readConfiguredRelays();
  if (current.includes(normalized)) return null;

  current.push(normalized);
  saveConfiguredRelays(current);
  refreshKnownRelays();
  return normalized;
}

export function removeCustomRelay(url) {
  const normalized = normalizeRelay(url);
  if (!normalized) return false;

  const current = readConfiguredRelays();
  const idx = current.indexOf(normalized);
  if (idx === -1) return false;

  current.splice(idx, 1);
  saveConfiguredRelays(current);
  refreshKnownRelays();
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

/**
 * Calculates the average health score of active relays (exploit + explore slots).
 */
export async function getAvgActiveRelayScore() {
  const ranking = await getRelayRanking();
  if (!ranking.length) return 0;
  const active = ranking.slice(0, EXPLOIT_SLOTS + EXPLORE_SLOTS);
  if (!active.length) return 0;
  const sum = active.reduce((acc, r) => acc + (r.score ?? 0), 0);
  return sum / active.length;
}

/**
 * Queries public relays for recent GUPT DM events (#t: ["gupt-dm"])
 * to discover active relays currently used by other GUPT users across the network.
 */
export async function discoverRelaysFromNetwork() {
  try {
    const { queryMany } = await import("./subscribe.js");
    const events = await queryMany([{ kinds: [4], "#t": ["gupt-dm"], limit: 30 }], 5000);
    let addedCount = 0;
    for (const ev of events) {
      const pTag = ev.tags?.find((t) => t[0] === "p");
      const hint = pTag?.[2];
      if (hint) {
        const added = addHintRelay(hint);
        if (added) addedCount++;
      }
    }
    return addedCount;
  } catch {
    return 0;
  }
}

let discoveryLoopStarted = false;

/**
 * Starts a 60-second ticker loop that runs network relay discovery:
 * 25% chance every 1 minute IF average score of active relays is below 0.6.
 */
export function startNetworkDiscoveryLoop() {
  if (discoveryLoopStarted) return;
  discoveryLoopStarted = true;

  setInterval(async () => {
    // 1. Roll 25% chance (1 in 4)
    if (Math.random() >= 0.25) return;

    // 2. Check if average active relay score is below 0.6
    const avgScore = await getAvgActiveRelayScore();
    if (avgScore < 0.6) {
      await discoverRelaysFromNetwork();
    }
  }, 60_000);
}
