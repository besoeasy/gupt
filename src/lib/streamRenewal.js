import { RETENTION_DAYS } from "../config/retention.js";

/**
 * Shared renewal policy for encrypted vault streams
 * (bookmarks, passwords, notes).
 *
 * Items confirmed missing from every relay are renewed first, regardless of
 * age; the rest of the budget goes to items not written in the last
 * STREAM_RENEWAL_MIN_AGE_MS (RETENTION_DAYS / 2), oldest first.
 */

export const STREAM_RENEWAL_MIN_AGE_MS = (RETENTION_DAYS / 2) * 24 * 60 * 60 * 1000;
export const STREAM_RENEWAL_LIMIT = 3;

/**
 * Pick which items to renew this tick. Missing items (audited against the
 * relays) outrank age-based picks.
 * @param {Array<{ id: string, eventId?: string, expiresAt?: number, updatedAt?: number, createdAt?: number, deleted?: boolean }>} items
 * @param {{ now?: number, minAgeMs?: number, limit?: number, missingEventIds?: Set<string> }} [opts]
 */
export function selectStreamRenewals(items, opts = {}) {
  const now = opts.now ?? Date.now();
  const minAgeMs = opts.minAgeMs ?? STREAM_RENEWAL_MIN_AGE_MS;
  const limit = opts.limit ?? STREAM_RENEWAL_LIMIT;
  const missing = opts.missingEventIds instanceof Set ? opts.missingEventIds : null;

  const live = (items || []).filter((item) => item && !item.deleted && item.expiresAt);
  if (!live.length) return [];

  const selected = [];
  const picked = new Set();

  if (missing?.size) {
    const lost = live
      .filter((item) => item.eventId && missing.has(String(item.eventId).toLowerCase()))
      .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    for (const item of lost) {
      if (selected.length >= limit) break;
      selected.push(item);
      picked.add(item.id);
    }
  }

  const aged = live
    .filter(
      (item) => !picked.has(item.id) && now - (item.updatedAt || item.createdAt || 0) >= minAgeMs,
    )
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  for (const item of aged) {
    if (selected.length >= limit) break;
    selected.push(item);
  }

  return selected;
}

/**
 * Apply renewal policy: renew selected items via `renewOne(item)`.
 * `opts.audit`, when provided, is called with the item list and may return a
 * Set (or array) of event ids that no longer have a live relay copy; those
 * items are renewed first.
 * Returns a new list sorted by updatedAt desc with a `renewedCount` property.
 *
 * @param {Array} items
 * @param {(item: any) => Promise<any>} renewOne
 * @param {{ now?: number, minAgeMs?: number, limit?: number, missingEventIds?: Set<string>, audit?: (items: any[]) => Promise<Set<string>|string[]|null>, onError?: (item: any, err: any) => void }} [opts]
 */
export async function renewStreamItems(items, renewOne, opts = {}) {
  const list = Array.isArray(items) ? items : [];

  let missingEventIds = opts.missingEventIds || null;
  if (!missingEventIds && typeof opts.audit === "function") {
    try {
      const audited = await opts.audit(list);
      if (audited instanceof Set) missingEventIds = audited;
      else if (Array.isArray(audited)) missingEventIds = new Set(audited);
      else if (audited?.missingEventIds instanceof Set) missingEventIds = audited.missingEventIds;
    } catch {
      // An unreachable relay must never block renewal.
      missingEventIds = null;
    }
  }

  const selected = selectStreamRenewals(list, { ...opts, missingEventIds });
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
