
import { normalizeRelayUrl, DEFAULT_RELAYS } from "@/config/servers.js";
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





let knownRelays = dedupeRelays(DEFAULT_RELAYS);
let hintRelays = [];

function refreshKnownRelays(extraRelays = []) {
  const custom = loadCustomRelays();
  knownRelays = dedupeRelays([...DEFAULT_RELAYS, ...custom, ...hintRelays, ...extraRelays]);
}

export function addHintRelay(relay) {
  const normalized = normalizeRelay(relay);
  if (!normalized) return null;
  if (!knownRelays.includes(normalized)) {
    hintRelays = [...hintRelays, normalized];
    refreshKnownRelays();
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
  refreshKnownRelays([normalized]);
  try {
    const { pool } = await import("./pool.js");
    const { CONNECT_TIMEOUT_MS } = await import("./constants.js");
    await pool.ensureRelay(normalized, { connectionTimeout: CONNECT_TIMEOUT_MS });
  } catch {
    
  }
  return normalized;
}
