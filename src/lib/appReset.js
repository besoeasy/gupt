import { clearAllCaches, deleteCacheDatabase } from "@/lib/idb";
import { useProfileStore } from "@/stores/profiles";
import { useIdentityStore } from "@/stores/identity";
import { clearDecryptCache } from "@/lib/decryptCache";
import { messenger } from "@/stores/messenger";
import { reconcileFromRelays } from "@/lib/sync";
import {
  getSecurePrivkey,
  getSecureSessionMode,
  restoreSecureSession,
  wipeSecureSession,
} from "@/lib/secureKey";

async function clearSessionState() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.clear();
}

function clearLocalCache() {
  if (typeof localStorage === "undefined") return;
  // Nothing in localStorage needs preserving anymore: the account key is
  // session-only, so a plain clear removes only settings/cache keys.
  localStorage.clear();
}

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

  // Pin the account before wiping anything: after clearSessionState() the
  // session mirror is gone, so this is what messenger.start() must come back to.
  const accountKey = store.privkeyHex;

  messenger.stop();
  await clearAllCaches();
  clearDecryptCache();
  useProfileStore().clear();
  await clearSessionState();
  clearLocalCache();

  // Re-establish the same identity rather than letting init() run free and
  // decide on its own — a "keep my keys" action must never rotate the account.
  await store.repinAccount(accountKey);

  await messenger.start(store);
  await reconcileFromRelays(store);
}

export async function resetPersistedStateForPwaUpdate() {
  // Pin the account across the wipe: the key is session-only now, so it must
  // be written back before the update reload, or every update logs users out.
  const activePrivkey = getSecurePrivkey();
  const activeMode = getSecureSessionMode();

  await Promise.allSettled([deleteCacheDatabase(), clearSessionState()]);
  clearLocalCache();

  if (activePrivkey && activeMode === "account") restoreSecureSession(activePrivkey, activeMode);
}

export async function logoutAndWipeAll() {
  messenger.stop();
  wipeSecureSession();
  await Promise.allSettled([deleteCacheDatabase(), clearSessionState()]);
  if (typeof localStorage !== "undefined") localStorage.clear();
  useIdentityStore().forgetAccount();
}
