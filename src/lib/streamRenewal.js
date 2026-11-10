import { RETENTION_DAYS } from "@/config/retention";

/**
 * Shared renewal policy for encrypted vault streams
 * (bookmarks, passwords, notes).
 *
 * The maintenance scheduler renews items not written in the last
 * STREAM_RENEWAL_MIN_AGE_MS (RETENTION_DAYS / 2), oldest first, up to
 * STREAM_RENEWAL_LIMIT per tick. Renewed events go through the engine.
 */

export const STREAM_RENEWAL_MIN_AGE_MS = (RETENTION_DAYS / 2) * 24 * 60 * 60 * 1000;
export const STREAM_RENEWAL_LIMIT = 3;

/**
 * Pick which items to renew this tick: the oldest live items not written in
 * the last minAgeMs, up to `limit`.
 * @param {Array<{ id: string, expiresAt?: number, updatedAt?: number, deleted?: boolean }>} items
 * @param {{ now?: number, minAgeMs?: number, limit?: number }} [opts]
 */
export function selectStreamRenewals(items, opts = {}) {
  const now = opts.now ?? Date.now();
  const minAgeMs = opts.minAgeMs ?? STREAM_RENEWAL_MIN_AGE_MS;
  const limit = opts.limit ?? STREAM_RENEWAL_LIMIT;

  const live = (items || []).filter((item) => item && !item.deleted && item.expiresAt);
  if (!live.length) return [];

  return live
    .filter((item) => now - (item.updatedAt || item.createdAt || 0) >= minAgeMs)
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    .slice(0, limit);
}

/**
 * Apply renewal policy: renew selected items via `renewOne(item)`.
 * Returns a new list sorted by updatedAt desc with a `renewedCount` property.
 *
 * @param {Array} items
 * @param {(item: any) => Promise<any>} renewOne
 * @param {{ now?: number, minAgeMs?: number, limit?: number, onError?: (item: any, err: any) => void }} [opts]
 */
export async function renewStreamItems(items, renewOne, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const selected = selectStreamRenewals(list, opts);
  if (!selected.length) {
    list.renewedCount = 0;
    return list;
  }

  const byId = new Map(list.map((item) => [item.id, item]));
  const onError =
    opts.onError ||
    ((item, err) => {
      console.warn("Failed to renew stream item", item?.id, err);
    });

  let renewedCount = 0;
  for (const item of selected) {
    try {
      const renewed = await renewOne(item);
      if (renewed?.id) {
        byId.set(renewed.id, renewed);
        renewedCount++;
      }
    } catch (err) {
      onError(item, err);
    }
  }

  const result = [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  result.renewedCount = renewedCount;
  return result;
}
