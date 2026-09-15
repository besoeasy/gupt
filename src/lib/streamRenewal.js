import { RETENTION_DAYS } from "@/config/retention";

/**
 * Shared renewal policy for encrypted Kind-1 streams
 * (bookmarks, passwords, notes).
 *
 * Two selection modes:
 * 1. minAgeMs (background worker): renew items not written in the last
 *    minAgeMs (RETENTION_DAYS / 2), oldest first, up to a limit.
 * 2. Default (urgent + opportunistic): renew items within URGENT_WITHIN_MS of
 *    expiry (up to URGENT_LIMIT); if none, with OPPORTUNISTIC_CHANCE renew the
 *    single oldest live item not written in the last OPPORTUNISTIC_INTERVAL_MS.
 */

// Urgent window scales with the retention period: items renew during the last
// third of their lifetime, so it stays proportional if RETENTION_DAYS changes.
export const STREAM_URGENT_WITHIN_MS = (RETENTION_DAYS / 3) * 24 * 60 * 60 * 1000;
export const STREAM_URGENT_LIMIT = 3;
export const STREAM_OPPORTUNISTIC_CHANCE = 0.5;
export const STREAM_OPPORTUNISTIC_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/** True when an item should be treated as urgently near expiry. */
export function isUrgentExpiry(item, now = Date.now(), withinMs = STREAM_URGENT_WITHIN_MS) {
  if (!item?.expiresAt || item.deleted) return false;
  return item.expiresAt - now < withinMs;
}

/**
 * True when an item is old enough to be worth an opportunistic renewal.
 * Renewals and user edits both bump `updatedAt`, so this throttles how often
 * a single item gets re-published.
 */
export function isOpportunisticEligible(
  item,
  now = Date.now(),
  minAgeMs = STREAM_OPPORTUNISTIC_INTERVAL_MS,
) {
  if (!item?.expiresAt || item.deleted) return false;
  return now - (item.updatedAt || item.createdAt || 0) >= minAgeMs;
}

/**
 * Pick which items to renew this visit.
 * @param {Array<{ id: string, expiresAt?: number, updatedAt?: number, deleted?: boolean }>} items
 * @param {{ now?: number, random?: () => number, minAgeMs?: number, limit?: number }} [opts]
 */
export function selectStreamRenewals(items, opts = {}) {
  const now = opts.now ?? Date.now();
  const random = opts.random ?? Math.random;

  const live = (items || []).filter((item) => item && !item.deleted && item.expiresAt);
  if (!live.length) return [];

  const minAgeMs = opts.minAgeMs ?? 0;
  if (minAgeMs > 0) {
    const limit = opts.limit ?? STREAM_URGENT_LIMIT;
    return live
      .filter((item) => now - (item.updatedAt || item.createdAt || 0) >= minAgeMs)
      .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
      .slice(0, limit);
  }

  const byExpiry = [...live].sort((a, b) => a.expiresAt - b.expiresAt);
  const urgent = byExpiry.filter((item) => isUrgentExpiry(item, now)).slice(0, STREAM_URGENT_LIMIT);
  if (urgent.length) return urgent;

  if (random() < STREAM_OPPORTUNISTIC_CHANCE) {
    const eligible = byExpiry.filter((item) => isOpportunisticEligible(item, now));
    if (eligible.length) return [eligible[0]];
  }
  return [];
}

/**
 * Apply renewal policy: renew selected items via `renewOne(item)`.
 * Returns a new list sorted by updatedAt desc.
 *
 * @param {Array} items
 * @param {(item: any) => Promise<any>} renewOne
 * @param {{ now?: number, random?: () => number, onError?: (item: any, err: any) => void }} [opts]
 */
export async function renewStreamItems(items, renewOne, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const selected = selectStreamRenewals(list, opts);
  if (!selected.length) return list;

  const byId = new Map(list.map((item) => [item.id, item]));
  const onError =
    opts.onError ||
    ((item, err) => {
      console.warn("Failed to renew stream item", item?.id, err);
    });

  for (const item of selected) {
    try {
      const renewed = await renewOne(item);
      if (renewed?.id) byId.set(renewed.id, renewed);
    } catch (err) {
      onError(item, err);
    }
  }

  return [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
