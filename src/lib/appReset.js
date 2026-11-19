import { clearOutboxQueue, deleteCacheDatabase } from "@/lib/idb";
import { useIdentityStore } from "@/stores/identity";
import { messenger } from "@/stores/messenger";
import { reconcileFromCache } from "@/lib/sync";
import {
  clearLocalCache,
  clearBrowserCacheStorage,
  wipeAllCachesForFreshLogin,
} from "@/lib/cacheWipe";
import { wipeSecureSession } from "@/lib/secureKey";

/**
 * Drop cached data but keep the account. The identity argument is optional: it
 * falls back to the store so callers cannot accidentally pass nothing and get
 * a silent "not initialized" failure.
 */
export async function cleanupLocalDataKeepingAccount(identity) {
  const store = identity ?? useIdentityStore();
  if (!store.isReady || !store.pubkeyHex || !store.privkeyHex) {
    throw new Error("Identity not initialized. Open /welcome to restore an account first.");
  }

  // Capture the key before the wipe: repinAccount() below must land on the same
  // account, and the in-memory copy is the only one this function can trust.
  const accountKey = store.privkeyHex;

  await wipeAllCachesForFreshLogin();

  // Re-establish the same identity rather than letting init() run free and
  // decide on its own — a "keep my keys" action must never rotate the account.
  await store.repinAccount(accountKey);

  await messenger.start(store);
  await reconcileFromCache(store);
}

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

/**
 * The one place that destroys the remembered device: caches, outbox, the
 * in-memory key and the vault. Only recovery with secret/file + PIN brings the
 * account back, and only because the account itself lives on relays.
 */
export async function logoutAndWipeAll() {
  await wipeAllCachesForFreshLogin();
  clearOutboxQueue();
  wipeSecureSession();
  await Promise.allSettled([deleteCacheDatabase(), clearBrowserCacheStorage()]);
  clearLocalCache({ preserveTheme: true });
  await useIdentityStore().forgetAccount();
}
