const STORAGE_KEY = "gupt_bot_sightings_v1";
const KEEP_MS = 120 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 1000;

/**
 * Relays delete expired beacons, so a 30-day history can only come from what
 * this device has actually seen. It is a small, spoof-proof trust signal: a
 * freshly minted key can never look established here.
 */
function readAll() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(sightings) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(sightings));
  } catch {
    // Storage full or disabled: the directory still works, it just forgets.
  }
}

export function readBotSightings() {
  const all = readAll();
  const out = {};
  for (const [pubkey, entry] of Object.entries(all)) {
    if (!entry || typeof entry !== "object") continue;
    const first = Number(entry.first);
    const last = Number(entry.last);
    if (Number.isFinite(first) && Number.isFinite(last)) out[pubkey] = { first, last };
  }
  return out;
}

/** Upsert every bot seen in this load, then drop stale entries. */
export function recordBotSightings(bots, now = Date.now()) {
  const all = readBotSightings();
  for (const bot of bots || []) {
    if (!bot?.pubkey) continue;
    const prev = all[bot.pubkey];
    all[bot.pubkey] = { first: prev?.first || now, last: now };
  }

  const cutoff = now - KEEP_MS;
  let entries = Object.entries(all).filter(([, entry]) => entry.last >= cutoff);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.sort((a, b) => b[1].last - a[1].last).slice(0, MAX_ENTRIES);
  }

  const next = Object.fromEntries(entries);
  writeAll(next);
  return next;
}

/** Whole days this device has known a bot, or null when unseen. */
export function botKnownDays(sighting, now = Date.now()) {
  const first = Number(sighting?.first);
  if (!Number.isFinite(first) || first <= 0) return null;
  return Math.max(0, Math.floor((now - first) / (24 * 60 * 60 * 1000)));
}
