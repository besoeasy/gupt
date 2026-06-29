import { clearAllCaches, deleteCacheDatabase } from "@/lib/idb";
import { clearProfileCache } from "@/composables/useProfileCache";
import { messenger } from "@/stores/messenger";
import { reconcileFromRelays } from "@/lib/sync";
import { invalidateVaultCache } from "@/lib/vault";

const LS_PRIVKEY = "gupt_privkey";

/** Identity keys + profile fields — everything else is disposable local cache. */
const ACCOUNT_LOCAL_STORAGE_KEYS = [
  LS_PRIVKEY,
  "gupt_profile_name",
  "gupt_profile_about",
  "gupt_profile_picture",
  "gupt_profile_website",
  "gupt_profile_status",
];

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
 * Wipe cached messages, media, profiles, and sync cursors while keeping the
 * active account (private key + local profile). Restarts sync from relays.
 */
export async function cleanupLocalDataKeepingAccount(identity) {
  if (!identity?.pubkeyHex || !identity?.privkeyHex) {
    throw new Error("Identity not initialized.");
  }

  messenger.stop();
  await clearAllCaches();
  invalidateVaultCache(identity.pubkeyHex);
  clearProfileCache();
  await clearSessionState();
  preserveKeysAndClearLocalStorage(ACCOUNT_LOCAL_STORAGE_KEYS);

  await messenger.start(identity);
  await reconcileFromRelays(identity);
}

export async function resetPersistedStateForPwaUpdate() {
  // Do NOT clear Cache Storage here — the new SW's precache lives there.
  // Nuking it would force a full network re-fetch on the post-update reload
  // and break offline support on first load after an update.
  // Stale caches are already removed by cleanupOutdatedCaches() inside sw.js.
  await Promise.allSettled([deleteCacheDatabase(), clearSessionState()]);
  resetLocalStorage();
}
