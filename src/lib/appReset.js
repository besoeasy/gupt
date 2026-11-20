import { deleteCacheDatabase } from "@/lib/idb";
import { wipeAllCachesForFreshLogin } from "@/lib/cacheWipe";
import { clearBrowserCacheStorage } from "@/lib/cacheWipe";

/**
 * Wipe everything a deploy can invalidate, keeping the remembered device. The
 * vault lives in its own database (`gupt_vault_v1`), which `deleteCacheDatabase`
 * cannot reach, so the reload after an update unlocks silently instead of
 * asking for the secret again.
 */
export async function resetPersistedStateForPwaUpdate() {
  // Kill the worker before the delete: an in-flight cycle would otherwise
  // auto-reopen the database mid-wipe.
  await wipeAllCachesForFreshLogin();
  await Promise.allSettled([deleteCacheDatabase(), clearBrowserCacheStorage()]);
}
