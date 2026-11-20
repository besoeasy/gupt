export const CONNECT_TIMEOUT_MS = 3_000;
export const QUERY_TIMEOUT_MS = 5_000;
export const PUBLISH_TIMEOUT_MS = 6_000;
export const SUBSCRIBE_EOSE_MS = 5_000;

export const RelayTier = Object.freeze({
  CHAMPION: "champion",
  GOOD: "good",
  DEGRADED: "degraded",
  POOR: "poor",
  NEW: "new",
  UNKNOWN: "unknown",
  OFFLINE: "offline",
});

export function classifyTraffic(publishRate, publishTotal, queryRate, queryTotal) {
  if (publishTotal >= 10 && publishRate !== null && publishRate < 50) return RelayTier.POOR;
  if (publishTotal >= 5 && publishRate !== null && publishRate < 70) return RelayTier.DEGRADED;
  if (queryTotal >= 5 && queryRate !== null && queryRate < 50) return RelayTier.POOR;
  if (queryTotal >= 3 && queryRate !== null && queryRate < 70) return RelayTier.DEGRADED;
  if (publishTotal >= 3 && publishRate !== null && publishRate >= 80) return RelayTier.GOOD;
  if (queryTotal >= 3 && queryRate !== null && queryRate >= 80) return RelayTier.GOOD;
  return RelayTier.UNKNOWN;
}

const BADGE_BASE = "relay-tier-badge relay-tier-badge--muted";

export function tierBadgeClass(tier) {
  switch (tier) {
    case RelayTier.CHAMPION:
    case RelayTier.GOOD:
      return "relay-tier-badge relay-tier-badge--success";
    case RelayTier.DEGRADED:
      return "relay-tier-badge relay-tier-badge--warning";
    case RelayTier.POOR:
    case RelayTier.OFFLINE:
      return "relay-tier-badge relay-tier-badge--danger";
    default:
      return BADGE_BASE;
  }
}

export function tierDotClass(tier) {
  switch (tier) {
    case RelayTier.CHAMPION:
    case RelayTier.GOOD:
      return "relay-tier-dot relay-tier-dot--success";
    case RelayTier.DEGRADED:
      return "relay-tier-dot relay-tier-dot--warning";
    case RelayTier.POOR:
    case RelayTier.OFFLINE:
      return "relay-tier-dot relay-tier-dot--danger";
    default:
      return "relay-tier-dot relay-tier-dot--muted";
  }
}

export function formatTrafficRate(rate) {
  return rate === null || rate === undefined ? "—" : `${rate}%`;
}
