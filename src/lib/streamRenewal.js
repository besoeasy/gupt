/**
 * Shared renewal policy for encrypted Kind-1 streams
 * (bookmarks, passwords, notes).
 *
 * On each route load:
 * 1. Always renew items within URGENT_WITHIN_MS of expiry (up to URGENT_LIMIT).
 * 2. If nothing is urgent, with OPPORTUNISTIC_CHANCE renew the single oldest
 *    live item (earliest expiresAt) so the 3y lifetime stays healthy.
 */

export const STREAM_URGENT_WITHIN_MS = 90 * 24 * 60 * 60 * 1000;
export const STREAM_URGENT_LIMIT = 3;
export const STREAM_OPPORTUNISTIC_CHANCE = 0.5;

/** True when an item should be treated as urgently near expiry. */
export function isUrgentExpiry(item, now = Date.now(), withinMs = STREAM_URGENT_WITHIN_MS) {
  if (!item?.expiresAt || item.deleted) return false;
  return item.expiresAt - now < withinMs;
}

/**
 * Pick which items to renew this visit.
 * @param {Array<{ id: string, expiresAt?: number, deleted?: boolean }>} items
 * @param {{ now?: number, random?: () => number }} [opts]
 */
export function selectStreamRenewals(items, opts = {}) {
  const now = opts.now ?? Date.now();
  const random = opts.random ?? Math.random;

  const live = (items || []).filter((item) => item && !item.deleted && item.expiresAt);
  if (!live.length) return [];

  const byExpiry = [...live].sort((a, b) => a.expiresAt - b.expiresAt);
  const urgent = byExpiry.filter((item) => isUrgentExpiry(item, now)).slice(0, STREAM_URGENT_LIMIT);
  if (urgent.length) return urgent;

  if (random() < STREAM_OPPORTUNISTIC_CHANCE) {
    return [byExpiry[0]];
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
