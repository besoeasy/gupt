/**
 * Probe a relay by opening a real WebSocket connection and measuring the time
 * to the `open` event. Returns { url, ms, tier } where tier is fast|ok|slow|offline.
 */
export function probeRelay(wssUrl) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let settled = false;

    function done(ms) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ms === null) {
        resolve({ url: wssUrl, ms: null, tier: "offline" });
      } else {
        const tier = ms < 150 ? "fast" : ms < 500 ? "ok" : "slow";
        resolve({ url: wssUrl, ms, tier });
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }

    const timer = setTimeout(() => done(null), 4000);

    let ws;
    try {
      ws = new WebSocket(wssUrl);
    } catch {
      done(null);
      return;
    }

    ws.onopen = () => done(Math.round(performance.now() - t0));
    ws.onerror = () => done(null);
    ws.onclose = () => {
      if (!settled) done(null);
    };
  });
}

export function formatTrafficRate(rate) {
  return rate === null || rate === undefined ? "—" : `${rate}%`;
}

export function trafficTierBadgeClass(tier) {
  if (tier === "good") return "bg-emerald-500/15 text-emerald-400";
  if (tier === "degraded") return "bg-yellow-500/15 text-yellow-400";
  if (tier === "replace") return "bg-red-500/15 text-red-400";
  return "bg-white/8 text-zinc-400";
}

export function probeBadgeClass(tier) {
  if (tier === "fast") return "bg-emerald-500/15 text-emerald-400";
  if (tier === "ok") return "bg-yellow-500/15 text-yellow-400";
  if (tier === "slow") return "bg-orange-500/15 text-orange-400";
  if (tier === "offline") return "bg-red-500/15 text-red-400";
  return "bg-white/8 text-zinc-400";
}

export function tierDot(tier) {
  if (tier === "checking") return "bg-zinc-600 animate-pulse";
  if (tier === "fast") return "bg-emerald-400";
  if (tier === "ok") return "bg-yellow-400";
  if (tier === "slow") return "bg-orange-400";
  return "bg-red-500";
}
