import { WRITER_VERSION } from "./writerVersion.js";

/**
 * Versioned localStorage map.
 *
 * Shape: `{ v, w, data: { <key>: entry } }`. The header is what lets a later
 * release add a field or reshape an entry without renaming the storage key and
 * losing the user's data. A map written by an older release is rewritten in the
 * current shape the first time a reader loads it (AGENTS.md read-repair) —
 * `data` carries the entries across, so nothing is dropped.
 */
export const STORED_MAP_VERSION = 1;

/** Reads the map under `storageKey`, repairing a stale header in place. */
export function readStoredMap(storageKey) {
  const storage = globalThis.localStorage;
  if (!storage) return {};

  let parsed = null;
  try {
    parsed = JSON.parse(storage.getItem(storageKey) || "null");
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const data = parsed.data && typeof parsed.data === "object" ? parsed.data : {};
  if (Number(parsed.v) !== STORED_MAP_VERSION || parsed.w !== WRITER_VERSION) {
    writeStoredMap(storageKey, data);
  }
  return data;
}

/** Writes the map in the current shape. Never throws when storage is full. */
export function writeStoredMap(storageKey, data) {
  const storage = globalThis.localStorage;
  if (!storage) return false;
  try {
    storage.setItem(
      storageKey,
      JSON.stringify({ v: STORED_MAP_VERSION, w: WRITER_VERSION, data: data || {} }),
    );
    return true;
  } catch {
    // Storage full or disabled: the caller keeps working from memory.
    return false;
  }
}
