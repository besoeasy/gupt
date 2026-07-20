const DNS_TXT_DOMAIN = "btc.besoeasy.com";
const DNS_CACHE_KEY = "gupt_btc_address";
const DNS_CACHE_TTL_MS = 60 * 60 * 1000; 

export const GOAL_SAT = 2_500_000; 
const STATS_CACHE_KEY = "gupt_funding_stats";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; 
const DISMISS_KEY = "gupt_funding_dismissed";
const DISMISS_TTL_MS = 60 * 60 * 1000; 

export async function getFundingAddress() {
  
  try {
    const cached = localStorage.getItem(DNS_CACHE_KEY);
    if (cached) {
      const { ts, address } = JSON.parse(cached);
      if (Date.now() - ts < DNS_CACHE_TTL_MS) return address || null;
    }
  } catch {
    
  }

  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${DNS_TXT_DOMAIN}&type=TXT`,
      { headers: { Accept: "application/dns-json" } },
    );
    if (!res.ok) throw new Error("DNS query failed");
    const data = await res.json();
    
    const raw = data?.Answer?.find((r) => r.type === 16)?.data ?? "";
    const address = raw.replace(/^"|"$/g, "").trim() || null;
    localStorage.setItem(DNS_CACHE_KEY, JSON.stringify({ ts: Date.now(), address }));
    return address;
  } catch {
    return null;
  }
}

async function fetchTxs(address) {
  try {
    const res = await fetch(`https://mempool.space/api/address/${address}/txs`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getMonthlyStats({ force = false } = {}) {
  if (force) localStorage.removeItem(STATS_CACHE_KEY);

  try {
    const cached = localStorage.getItem(STATS_CACHE_KEY);
    if (cached) {
      const { ts, receivedSat } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL_MS) return { receivedSat, goalSat: GOAL_SAT };
    }
  } catch {
    
  }

  const address = await getFundingAddress();
  if (!address) return { receivedSat: 0, goalSat: GOAL_SAT };

  const txs = await fetchTxs(address);
  if (!txs) return { receivedSat: 0, goalSat: GOAL_SAT };

  const now = new Date();
  const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);

  const receivedSat = txs
    .filter((tx) => (tx.status?.block_time ?? 0) >= monthStart)
    .reduce((sum, tx) => {
      const out = tx.vout
        .filter((o) => o.scriptpubkey_address === address)
        .reduce((s, o) => s + o.value, 0);
      return sum + out;
    }, 0);

  localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ ts: Date.now(), receivedSat }));
  return { receivedSat, goalSat: GOAL_SAT };
}

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

export function getCachedMonthlyStatsSync() {
  try {
    const cached = localStorage.getItem(STATS_CACHE_KEY);
    if (cached) {
      const { ts, receivedSat } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL_MS) return { receivedSat, goalSat: GOAL_SAT };
    }
  } catch {
    
  }
  return null;
}

export function dismissFundingBanner() {
  localStorage.setItem(DISMISS_KEY, JSON.stringify({ ts: Date.now() }));
}
