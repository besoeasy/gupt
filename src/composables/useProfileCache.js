import { useProfileStore } from "@/stores/profiles";

// Deprecated — use useProfileStore() from "@/stores/profiles" directly.
export function useProfileCache() {
  const store = useProfileStore();
  return {
    displayName: store.displayName,
    profilePicture: store.profilePicture,
    prefetch: store.prefetch,
  };
}

export function fetchProfileDetails(pubkey) {
  return useProfileStore().fetchProfileDetails(pubkey);
}

export function clearProfileCache() {
  useProfileStore().clear();
}
