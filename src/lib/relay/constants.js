/**
 * Shared constants for the relay module.
 * Single source of truth for timeouts, tier enums, and algorithm parameters.
 */

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------

export const CONNECT_TIMEOUT_MS = 6_000;
export const QUERY_TIMEOUT_MS = 5_000;
export const PUBLISH_TIMEOUT_MS = 6_000;
export const SUBSCRIBE_EOSE_MS = 5_000;

// ---------------------------------------------------------------------------
// Unified relay tier enum
// ---------------------------------------------------------------------------

export const RelayTier = Object.freeze({
  CHAMPION: 'champion',
  GOOD: 'good',
  DEGRADED: 'degraded',
  POOR: 'poor',
  NEW: 'new',
  UNKNOWN: 'unknown',
  OFFLINE: 'offline',
});

/**
 * Classify a bandit score + operation count into a display tier.
 */
export function classifyScore(score, ops = 0) {
  if (ops < 3) return RelayTier.NEW;
  if (score >= 0.75) return RelayTier.CHAMPION;
  if (score >= 0.5) return RelayTier.GOOD;
  if (score >= 0.25) return RelayTier.DEGRADED;
  return RelayTier.POOR;
}

/**
 * Classify traffic-based health from success rates.
 * Returns a RelayTier based on publish/connect statistics.
 */
export function classifyTraffic(publishRate, publishTotal, connectRate, connectTotal) {
  if (publishTotal >= 10 && publishRate !== null && publishRate < 50) return RelayTier.POOR;
  if (publishTotal >= 5 && publishRate !== null && publishRate < 70) return RelayTier.DEGRADED;
  if (connectTotal >= 5 && connectRate !== null && connectRate < 50) return RelayTier.POOR;
  if (connectTotal >= 3 && connectRate !== null && connectRate < 70) return RelayTier.DEGRADED;
  if (publishTotal >= 3 && publishRate !== null && publishRate >= 80) return RelayTier.GOOD;
  if (connectTotal >= 3 && connectRate !== null && connectRate >= 80) return RelayTier.GOOD;
  return RelayTier.UNKNOWN;
}

// ---------------------------------------------------------------------------
// Bandit algorithm parameters
// ---------------------------------------------------------------------------

export const BANDIT_ALPHA = 0.3;
export const BANDIT_DECAY_HALF_LIFE_MS = 4 * 24 * 60 * 60 * 1000;
export const BANDIT_DEFAULT_SCORE = 0.5;
export const BANDIT_PERSIST_DEBOUNCE_MS = 10_000;
export const BANDIT_EXPLOIT_COUNT = 8;
export const BANDIT_EXPLORE_COUNT = 4;

// ---------------------------------------------------------------------------
// Tier display helpers (CSS classes for badges/dots)
// ---------------------------------------------------------------------------

const BADGE_BASE = 'bg-white/8 text-zinc-400';

export function tierBadgeClass(tier) {
  switch (tier) {
    case RelayTier.CHAMPION:
    case RelayTier.GOOD:
      return 'bg-emerald-500/15 text-emerald-400';
    case RelayTier.DEGRADED:
      return 'bg-yellow-500/15 text-yellow-400';
    case RelayTier.POOR:
    case RelayTier.OFFLINE:
      return 'bg-red-500/15 text-red-400';
    default:
      return BADGE_BASE;
  }
}

export function probeBadgeClass(tier) {
  switch (tier) {
    case 'fast':
      return 'bg-emerald-500/15 text-emerald-400';
    case 'ok':
      return 'bg-yellow-500/15 text-yellow-400';
    case 'slow':
      return 'bg-orange-500/15 text-orange-400';
    case RelayTier.OFFLINE:
      return 'bg-red-500/15 text-red-400';
    default:
      return BADGE_BASE;
  }
}

export function tierDotClass(tier) {
  switch (tier) {
    case 'checking':
      return 'bg-zinc-600 animate-pulse';
    case 'fast':
    case RelayTier.CHAMPION:
    case RelayTier.GOOD:
      return 'bg-emerald-400';
    case 'ok':
    case RelayTier.DEGRADED:
      return 'bg-yellow-400';
    case 'slow':
      return 'bg-orange-400';
    case RelayTier.POOR:
    case RelayTier.OFFLINE:
      return 'bg-red-500';
    default:
      return 'bg-zinc-400';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatScore(score) {
  return `${Math.round(score * 100)}%`;
}

export function formatTrafficRate(rate) {
  return rate === null || rate === undefined ? '—' : `${rate}%`;
}
