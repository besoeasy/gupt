import { reactive } from "vue";
import { defineStore } from "pinia";
import { pubkeyName } from "@/lib/crypto";
import { api } from "@/lib/api";
import { getStoredProfile, peekStoredProfile } from "@/lib/idb";

const EMPTY_PROFILE = { name: "", about: "", picture: "", status: "" };

export const useProfileStore = defineStore("profiles", () => {
  const profiles = reactive({});
  const fetching = new Set();

  async function fetchProfileDetails(pubkey) {
    const pk = String(pubkey || "").trim();
    if (!pk) return { ...EMPTY_PROFILE };

    const engineProfile = await api.getEngineProfile(pk).catch(() => null);
    if (engineProfile) {
      profiles[pk] = engineProfile;
      return engineProfile;
    }

    const cached = (await getStoredProfile(pk)) || (await peekStoredProfile(pk));
    if (cached) {
      profiles[pk] = cached;
      return cached;
    }

    return profiles[pk] ?? { ...EMPTY_PROFILE };
  }

  function displayName(pubkey) {
    if (!pubkey) return "";
    return profiles[pubkey]?.name || pubkeyName(pubkey);
  }

  function profilePicture(_pubkey) {
    return "";
  }

  async function prefetch(pubkeys) {
    const candidates = [...new Set((pubkeys || []).filter(Boolean))];
    const toCheck = candidates.filter((pk) => !fetching.has(pk) && !profiles[pk]);
    if (!toCheck.length) return;

    for (const pk of toCheck) fetching.add(pk);

    await Promise.all(
      toCheck.map(async (pk) => {
        const engineProfile = await api.getEngineProfile(pk).catch(() => null);
        if (engineProfile) {
          profiles[pk] = engineProfile;
          return;
        }
        const cached = (await getStoredProfile(pk)) || (await peekStoredProfile(pk));
        if (cached) profiles[pk] = cached;
      }),
    );

    for (const pk of toCheck) fetching.delete(pk);
  }

  function clear() {
    for (const key of Object.keys(profiles)) delete profiles[key];
    fetching.clear();
  }

  return { profiles, displayName, profilePicture, prefetch, fetchProfileDetails, clear };
});
