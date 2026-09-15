import { reactive } from "vue";
import { defineStore } from "pinia";
import { pubkeyName } from "@/lib/crypto";
import { api } from "@/lib/api";
import { getStoredProfile, isProfileStale, peekStoredProfile, putStoredProfile } from "@/lib/idb";

export const useProfileStore = defineStore("profiles", () => {
  const profiles = reactive({});
  const fetching = new Set();
  const refreshing = new Set();

  async function refreshProfileFromRelay(pubkey) {
    const pk = String(pubkey || "").trim();
    if (!pk || refreshing.has(pk)) return profiles[pk] ?? null;
    refreshing.add(pk);
    try {
      const batch = await api.fetchProfiles([pk]);
      if (batch[pk]) {
        await putStoredProfile(pk, batch[pk]);
        profiles[pk] = (await getStoredProfile(pk)) ?? profiles[pk];
      }
    } catch {
      // Keep showing the stale cached profile.
    } finally {
      refreshing.delete(pk);
    }
    return profiles[pk] ?? null;
  }

  async function fetchProfileDetails(pubkey) {
    const pk = String(pubkey || "").trim();
    if (!pk) return { name: "", about: "", picture: "", status: "" };

    const cached = await getStoredProfile(pk);
    if (cached) {
      profiles[pk] = cached;
      if (isProfileStale(cached)) void refreshProfileFromRelay(pk);
      return cached;
    }

    const stale = await peekStoredProfile(pk);
    if (stale) {
      profiles[pk] = stale;
      void refreshProfileFromRelay(pk);
      return stale;
    }

    let profile = { name: "", about: "", picture: "", status: "" };
    try {
      const batch = await api.fetchProfiles([pk]);
      if (batch[pk]) profile = batch[pk];
    } catch {
      return profiles[pk] ?? profile;
    }

    await putStoredProfile(pk, profile);
    profiles[pk] = (await getStoredProfile(pk)) ?? profile;
    return profiles[pk] ?? profile;
  }

  function displayName(pubkey) {
    if (!pubkey) return "";
    return profiles[pubkey]?.name || pubkeyName(pubkey);
  }

  function profilePicture(pubkey) {
    if (!pubkey) return "";
    return profiles[pubkey]?.picture || "";
  }

  async function prefetch(pubkeys) {
    const candidates = [...new Set((pubkeys || []).filter(Boolean))];
    const toCheck = candidates.filter((pk) => !fetching.has(pk) && !profiles[pk]);
    if (!toCheck.length) return;

    for (const pk of toCheck) fetching.add(pk);

    const needRelay = [];
    await Promise.all(
      toCheck.map(async (pk) => {
        const cached = (await getStoredProfile(pk)) || (await peekStoredProfile(pk));
        if (cached) {
          profiles[pk] = cached;
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
            profiles[pk] = await getStoredProfile(pk);
          }),
        );
      } catch {}
    }

    for (const pk of toCheck) fetching.delete(pk);
  }

  function clear() {
    for (const key of Object.keys(profiles)) delete profiles[key];
    fetching.clear();
    refreshing.clear();
  }

  return { profiles, displayName, profilePicture, prefetch, fetchProfileDetails, clear };
});
