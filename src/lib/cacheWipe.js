import { CACHE_DB_REGISTRY_KEY, OUTBOX_STORAGE_KEY, clearAllCaches } from "./idb.js";
import { clearDecryptCache } from "./decryptCache.js";
import { clearEngineCache } from "./engine/core.js";
import { clearRabtaHttpCache } from "./rabta/index.js";

/**
 * Clear all localStorage items, preserving the user's theme preference and the
 * unsent-message outbox (relays cannot rebuild those rows).
 */
export function clearLocalCache({ preserveTheme = true } = {}) {
  if (typeof localStorage === "undefined") return;
  const theme = preserveTheme ? localStorage.getItem("gupt-theme") : null;
  const outbox = localStorage.getItem(OUTBOX_STORAGE_KEY);
  const dbRegistry = localStorage.getItem(CACHE_DB_REGISTRY_KEY);
  localStorage.clear();
  if (theme) {
    localStorage.setItem("gupt-theme", theme);
  }
  if (outbox) {
    localStorage.setItem(OUTBOX_STORAGE_KEY, outbox);
  }
  if (dbRegistry) {
    localStorage.setItem(CACHE_DB_REGISTRY_KEY, dbRegistry);
  }
}

/**
 * Clear all browser Cache Storage API caches (e.g. service worker / PWA HTTP caches).
 */
export async function clearBrowserCacheStorage() {
  if (typeof caches === "undefined" || !caches?.keys) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // Ignore environments where Cache Storage is restricted or disabled
  }
}

/**
 * Comprehensive cache wipe executed every time an account logs in or switches,
 * ensuring the application starts completely fresh from decentralized Rabta relays.
 * The remembered device is not touched: it lives in `gupt_vault_v1`, a database
 * this function never opens.
 */
export async function wipeAllCachesForFreshLogin() {
  // 1. Stop background sync and messenger listeners so in-flight tasks do not write old state
  try {
    const { messenger } = await import("@/stores/messenger");
    messenger?.stop?.();
  } catch {}

  try {
    const { stopEngineBridge } = await import("@/lib/engine/bridge");
    stopEngineBridge?.();
  } catch {}

  // 2. Clear in-memory caches
  try {
    clearDecryptCache();
  } catch {}

  try {
    clearEngineCache();
  } catch {}

  try {
    clearRabtaHttpCache();
  } catch {}

  // 3. Reset Pinia stores (profiles, rabtaSync, replication) only if an active Pinia instance exists
  try {
    const { getActivePinia } = await import("pinia");
    const activePinia = getActivePinia?.();
    if (activePinia) {
      try {
        const { useProfileStore } = await import("@/stores/profiles");
        useProfileStore?.(activePinia)?.clear?.();
      } catch {}

      try {
        const { useRabtaSyncStore } = await import("@/stores/rabtaSync");
        useRabtaSyncStore?.(activePinia)?.reset?.();
      } catch {}

      try {
        const { useReplicationStore } = await import("@/stores/replication");
        useReplicationStore?.(activePinia)?.stopWorker?.();
      } catch {}
    }
  } catch {}

  // 4. Wipe all IndexedDB object stores (media, rooms, groups, profiles, cursors, search, events, blobs, meta/watermarks)
  try {
    await clearAllCaches();
  } catch (err) {
    console.warn("Failed to clear IndexedDB caches:", err);
  }

  // 5. Clear application localStorage (preserves gupt-theme)
  clearLocalCache({ preserveTheme: true });

  // 6. Clear browser Cache Storage API caches
  await clearBrowserCacheStorage();
}
