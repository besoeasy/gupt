import { clearAllCaches, deleteCacheDatabase } from "@/lib/idb";
import { useProfileStore } from "@/stores/profiles";
import { useIdentityStore } from "@/stores/identity";
import { clearDecryptCache } from "@/lib/decryptCache";
import { messenger } from "@/stores/messenger";
import { reconcileFromRelays } from "@/lib/sync";
import { wipeSecureSession } from "@/lib/secureKey";

const LS_PRIVKEY = "gupt_privkey";

const ACCOUNT_LOCAL_STORAGE_KEYS = [LS_PRIVKEY];

async function clearSessionState() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.clear();
}

function preserveKeysAndClearLocalStorage(keys) {
  if (typeof localStorage === "undefined") return;
  const preserved = {};
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value !== null) preserved[key] = value;
  }
  localStorage.clear();
  for (const [key, value] of Object.entries(preserved)) {
    localStorage.setItem(key, value);
  }
}

function resetLocalStorage() {
  preserveKeysAndClearLocalStorage([LS_PRIVKEY]);
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
  preserveKeysAndClearLocalStorage(ACCOUNT_LOCAL_STORAGE_KEYS);

  // Re-establish the same identity rather than letting init() run free and
  // decide on its own — a "keep my keys" action must never rotate the account.
  await store.restorePrivateKey(accountKey);

  await messenger.start(store);
  await reconcileFromRelays(store);
}

export async function resetPersistedStateForPwaUpdate() {
  await Promise.allSettled([deleteCacheDatabase(), clearSessionState()]);
  resetLocalStorage();
}

export async function logoutAndWipeAll() {
  messenger.stop();
  wipeSecureSession();
  await Promise.allSettled([deleteCacheDatabase(), clearSessionState()]);
  if (typeof localStorage !== "undefined") localStorage.clear();
  useIdentityStore().forgetAccount();
}
