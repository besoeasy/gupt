import {
  DEFAULT_RELAYS,
  normalizeRelayUrl,
  readConfiguredRelays,
  saveConfiguredRelays,
} from "../../config/servers.js";
import { EXPLOIT_SLOTS, EXPLORE_SLOTS } from "./constants.js";
import { getRelayRanking } from "../idb.js";

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

export function getKnownRelays() {
  const configured = readConfiguredRelays();
  return dedupeRelays(configured.length ? configured : DEFAULT_RELAYS);
}

export async function readRelays() {
  const allKnown = getKnownRelays();
  if (!allKnown.length) return [...DEFAULT_RELAYS];

  try {
    const ranking = await getRelayRanking();
    if (!ranking.length) return allKnown;

    const ranked = new Set(ranking.map((r) => r.relay));
    const exploitSet = ranking.slice(0, EXPLOIT_SLOTS).map((r) => r.relay);
    const untested = allKnown.filter((url) => !ranked.has(url));
    const exploreSet = shuffle(untested).slice(0, EXPLORE_SLOTS);

    const merged = dedupeRelays([...exploitSet, ...exploreSet]);
    return merged.length ? merged : allKnown;
  } catch {
    return allKnown;
  }
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
  return true;
}

/**
 * Calculates the average health score of active relays.
 */
export async function getAvgActiveRelayScore() {
  try {
    const ranking = await getRelayRanking();
    if (!ranking.length) return 1.0;
    const active = ranking.slice(0, EXPLOIT_SLOTS + EXPLORE_SLOTS);
    if (!active.length) return 1.0;
    const sum = active.reduce((acc, r) => acc + (r.score ?? 0), 0);
    return sum / active.length;
  } catch {
    return 1.0;
  }
}
