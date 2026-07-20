import { reactive } from "vue";
import { pubkeyName } from "@/lib/crypto";
import { api } from "@/lib/api";
import { getStoredProfile, isProfileStale, peekStoredProfile, putStoredProfile } from "@/lib/idb";



const _profiles = reactive({});
const _fetching = new Set();
const _refreshing = new Set();

async function refreshProfileFromRelay(pubkey) {
  const pk = String(pubkey || "").trim();
  if (!pk || _refreshing.has(pk)) return _profiles[pk] ?? null;
  _refreshing.add(pk);
  try {
    const batch = await api.fetchProfiles([pk]);
    if (batch[pk]) {
      await putStoredProfile(pk, batch[pk]);
      _profiles[pk] = (await getStoredProfile(pk)) ?? _profiles[pk];
    }
  } catch {
    // Keep showing the stale cached profile.
  } finally {
    _refreshing.delete(pk);
  }
  return _profiles[pk] ?? null;
}

export async function fetchProfileDetails(pubkey) {
  const pk = String(pubkey || "").trim();
  if (!pk) return { name: "", about: "", picture: "", status: "" };

  const cached = await getStoredProfile(pk);
  if (cached) {
    _profiles[pk] = cached;
    if (isProfileStale(cached)) void refreshProfileFromRelay(pk);
    return cached;
  }

  const stale = await peekStoredProfile(pk);
  if (stale) {
    _profiles[pk] = stale;
    void refreshProfileFromRelay(pk);
    return stale;
  }

  let profile = { name: "", about: "", picture: "", status: "" };
  try {
    const batch = await api.fetchProfiles([pk]);
    if (batch[pk]) profile = batch[pk];
  } catch {
    return _profiles[pk] ?? profile;
  }

  await putStoredProfile(pk, profile);
  _profiles[pk] = (await getStoredProfile(pk)) ?? profile;
  return _profiles[pk] ?? profile;
}

export function useProfileCache() {
  /** Reactive display name with fallback to deterministic pubkeyName. */
  function displayName(pubkey) {
    if (!pubkey) return "";
    return _profiles[pubkey]?.name || pubkeyName(pubkey);
  }

  /** Reactive profile picture URL, empty string if not fetched yet. */
  function profilePicture(pubkey) {
    if (!pubkey) return "";
    return _profiles[pubkey]?.picture || "";
  }

    async function prefetch(pubkeys) {
    const candidates = [...new Set((pubkeys || []).filter(Boolean))];
    const toCheck = candidates.filter((pk) => !_fetching.has(pk) && !_profiles[pk]);
    if (!toCheck.length) return;

    for (const pk of toCheck) _fetching.add(pk);

    
    const needRelay = [];
    await Promise.all(
      toCheck.map(async (pk) => {
        const cached = (await getStoredProfile(pk)) || (await peekStoredProfile(pk));
        if (cached) {
          _profiles[pk] = cached;
          if (isProfileStale(cached)) void refreshProfileFromRelay(pk);
        } else {
          needRelay.push(pk);
        }
      }),
    );

    
    if (needRelay.length) {
      try {
        const batch = await api.fetchProfiles(needRelay);
        await Promise.all(
          Object.entries(batch).map(async ([pk, profile]) => {
            await putStoredProfile(pk, profile);
            _profiles[pk] = await getStoredProfile(pk);
          }),
        );
      } catch {
        
      }
    }

    for (const pk of toCheck) _fetching.delete(pk);
  }

  return { displayName, profilePicture, prefetch };
}

export function clearProfileCache() {
  for (const key of Object.keys(_profiles)) delete _profiles[key];
  _fetching.clear();
  _refreshing.clear();
}
