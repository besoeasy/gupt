const ADDRESS = "bc1q7kaqey6665a2sfg004xjykjyuwwscmmkqz6rx6";
export const GOAL_SAT = 2_500_000; // 0.025 BTC in satoshis
const WINDOW_DAYS = 30;
const CACHE_KEY = "gupt_funding_status";
const STATS_CACHE_KEY = "gupt_funding_stats";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // re-check every 6 hours
const DISMISS_KEY = "gupt_funding_dismissed";
const DISMISS_TTL_MS = 60 * 60 * 1000; // re-show after 1 hour

/** Fetch and parse txs, with a shared 6-hour cache. Returns null on failure. */
async function fetchTxs() {
  try {
    const res = await fetch(`https://mempool.space/api/address/${ADDRESS}/txs`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Returns true if we received >= 0.025 BTC in the last 30 days.
 * Fails open (returns true) on any network/parse error so the banner
 * is never shown due to a transient API failure.
 */
export async function checkRecentFunding() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, funded } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL_MS) return funded;
    }
  } catch {
    // ignore corrupt cache
  }

  const txs = await fetchTxs();
  if (!txs) return true; // fail open

  const cutoff = Math.floor((Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000);

  const funded = txs.some((tx) => {
    const time = tx.status?.block_time;
    if (!time || time < cutoff) return false;
    const received = tx.vout
      .filter((o) => o.scriptpubkey_address === ADDRESS)
      .reduce((sum, o) => sum + o.value, 0);
    return received >= GOAL_SAT;
  });

  localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), funded }));
  return funded;
}

/**
 * Returns { receivedSat, goalSat } for the current calendar month.
 * receivedSat is 0 on any failure so the progress bar shows 0% rather than hiding.
 */
export async function getMonthlyStats() {
  try {
    const cached = localStorage.getItem(STATS_CACHE_KEY);
    if (cached) {
      const { ts, receivedSat } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL_MS) return { receivedSat, goalSat: GOAL_SAT };
    }
  } catch {
    // ignore
  }

  const txs = await fetchTxs();
  if (!txs) return { receivedSat: 0, goalSat: GOAL_SAT };

  const now = new Date();
  const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);

  const receivedSat = txs
    .filter((tx) => (tx.status?.block_time ?? 0) >= monthStart)
    .reduce((sum, tx) => {
      const out = tx.vout
        .filter((o) => o.scriptpubkey_address === ADDRESS)
        .reduce((s, o) => s + o.value, 0);
      return sum + out;
    }, 0);

  localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ ts: Date.now(), receivedSat }));
  return { receivedSat, goalSat: GOAL_SAT };
}

/** Returns true if the user dismissed the banner recently. */
export function isFundingBannerDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const { ts } = JSON.parse(raw);
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Synchronously returns cached monthly stats from localStorage, or null if no valid cache.
 * Does NOT make any network requests.
 */
export function getCachedMonthlyStatsSync() {
  try {
    const cached = localStorage.getItem(STATS_CACHE_KEY);
    if (cached) {
      const { ts, receivedSat } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL_MS) return { receivedSat, goalSat: GOAL_SAT };
    }
  } catch {
    // ignore
  }
  return null;
}

/** Record a dismissal so the banner stays hidden for 7 days. */
export function dismissFundingBanner() {
  localStorage.setItem(DISMISS_KEY, JSON.stringify({ ts: Date.now() }));
}
