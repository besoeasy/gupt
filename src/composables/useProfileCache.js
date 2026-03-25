import { reactive } from "vue";
import { pubkeyName } from "@/lib/crypto";
import { api } from "@/lib/api";
import { getStoredProfile, putStoredProfile } from "@/lib/idb";

// Module-level singleton — shared across all component instances.
// Keyed by pubkey. Each value is { name, about, picture } once resolved.
const _profiles = reactive({});
const _fetching = new Set();

/**
 * Fetches a single pubkey's kind-0 profile from Dexie (if fresh) or the
 * relay (if stale/missing), stores the result, and returns it.
 *
 * Sanitization happens inside putStoredProfile (idb.js) so data is always
 * clean before it reaches memory or templates.
 *
 * The Dexie TTL is randomised ±4 h around 24 h so profiles don't all
 * expire at the same wall-clock time.
 *
 * @param {string} pubkey — hex pubkey
 * @returns {Promise<{ name: string, about: string, picture: string }>}
 */
export async function fetchProfileDetails(pubkey) {
  const pk = String(pubkey || "").trim();
  if (!pk) return { name: "", about: "", picture: "", status: "" };

  // 1) Dexie hit — still within randomised 24 h window.
  const cached = await getStoredProfile(pk);
  if (cached) {
    _profiles[pk] = cached;
    return cached;
  }

  // 2) Relay fetch.
  let profile = { name: "", about: "", picture: "", status: "" };
  try {
    const batch = await api.fetchProfiles([pk]);
    if (batch[pk]) {
      profile = batch[pk];
    }
  } catch {
    // Relay unavailable — return whatever we have in reactive memory.
    return _profiles[pk] ?? profile;
  }

  await putStoredProfile(pk, profile);
  _profiles[pk] = await getStoredProfile(pk); // read back the sanitized version
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

  /**
   * Fire-and-forget batch prefetch. Checks Dexie first, then issues one
   * batched relay query for everything still missing.
   */
  async function prefetch(pubkeys) {
    const candidates = [...new Set((pubkeys || []).filter(Boolean))];
    const toCheck = candidates.filter((pk) => !_fetching.has(pk) && !_profiles[pk]);
    if (!toCheck.length) return;

    for (const pk of toCheck) _fetching.add(pk);

    // 1) Dexie pass — populate reactive map from local cache (no relay).
    const needRelay = [];
    await Promise.all(
      toCheck.map(async (pk) => {
        const cached = await getStoredProfile(pk);
        if (cached) {
          _profiles[pk] = cached;
        } else {
          needRelay.push(pk);
        }
      }),
    );

    // 2) One batched relay query for all remaining pubkeys.
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
        // Relay unavailable — templates keep showing the fallback pubkeyName.
      }
    }

    for (const pk of toCheck) _fetching.delete(pk);
  }

  return { displayName, profilePicture, prefetch };
}
