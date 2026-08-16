import { clearAllCaches, deleteCacheDatabase } from "@/lib/idb";
import { clearProfileCache } from "@/composables/useProfileCache";
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

export async function cleanupLocalDataKeepingAccount(identity) {
  if (!identity?.pubkeyHex || !identity?.privkeyHex) {
    throw new Error("Identity not initialized.");
  }

  messenger.stop();
  await clearAllCaches();
  clearDecryptCache();
  clearProfileCache();
  await clearSessionState();
  preserveKeysAndClearLocalStorage(ACCOUNT_LOCAL_STORAGE_KEYS);

  await messenger.start(identity);
  await reconcileFromRelays(identity);
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
}
