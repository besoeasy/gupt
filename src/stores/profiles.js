import { reactive } from "vue";
import { defineStore } from "pinia";
import { pubkeyName } from "@/lib/crypto";
import { api } from "@/lib/api";
import { getStoredProfile, peekStoredProfile, putStoredProfile } from "@/lib/idb";

const EMPTY_PROFILE = Object.freeze({ name: "", about: "", picture: "", status: "" });

export const useProfileStore = defineStore("profiles", () => {
  const profiles = reactive({});
  const inFlight = new Map();

  async function resolveProfile(pubkey, { forceRefresh = false } = {}) {
    const pk = String(pubkey || "").trim();
    if (!pk) return { ...EMPTY_PROFILE };

    // 1. In-memory cache hit (unless forcing refresh)
    if (!forceRefresh && profiles[pk]?.name) {
      return profiles[pk];
    }

    // 2. Check locally authored profile in rawEvents
    const engineProfile = await api.getEngineProfile(pk).catch(() => null);
    if (engineProfile?.name) {
      profiles[pk] = engineProfile;
      return engineProfile;
    }

    // 3. Check fresh IndexedDB cache (12-hour TTL)
    if (!forceRefresh) {
      const cached = await getStoredProfile(pk).catch(() => null);
      if (cached?.name) {
        profiles[pk] = cached;
        return cached;
      }
    }

    // 4. Stale-while-revalidate: show stale cached profile immediately if available
    const stale = await peekStoredProfile(pk).catch(() => null);
    if (stale?.name && !profiles[pk]?.name) {
      profiles[pk] = stale;
    }

    // 5. In-flight request deduplication
    if (inFlight.has(pk)) {
      return inFlight.get(pk);
    }

    const fetchPromise = (async () => {
      try {
        const remote = await api.fetchPeerProfile(pk).catch(() => null);
        if (remote && (remote.name || remote.about || remote.status)) {
          // Cached in IndexedDB for 12 hours (PROFILE_TTL_MS)
          await putStoredProfile(pk, remote).catch(() => {});
          profiles[pk] = remote;
          return remote;
        }
      } catch (err) {
        // Relay fetch failed; keep stale/fallback
      } finally {
        inFlight.delete(pk);
      }
      return profiles[pk] ?? { ...EMPTY_PROFILE };
    })();

    inFlight.set(pk, fetchPromise);
    return fetchPromise;
  }

  async function fetchProfileDetails(pubkey, options) {
    return resolveProfile(pubkey, options);
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
    const toCheck = candidates.filter((pk) => !inFlight.has(pk) && !profiles[pk]?.name);
    if (!toCheck.length) return;

    await Promise.allSettled(toCheck.map((pk) => resolveProfile(pk)));
  }

  function clear() {
    for (const key of Object.keys(profiles)) delete profiles[key];
    inFlight.clear();
  }

  return { profiles, displayName, profilePicture, prefetch, fetchProfileDetails, clear };
});
