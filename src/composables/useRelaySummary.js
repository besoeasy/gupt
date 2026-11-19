import { computed, onMounted, onUnmounted, ref } from "vue";

import { getUnhealthyConfiguredRelays } from "@/lib/relay";
import { readCachedRelaySuggestions } from "@/lib/relayHints";
import { useKnownRelays } from "@/composables/useKnownRelays";

/**
 * One place for the numbers Settings shows about relays: how many are
 * configured, how many failed their last probe, and how many verified
 * suggestions sit in the hints cache. Both the status strip and the relays
 * summary read from here, so they can never disagree.
 */
export function useRelaySummary() {
  const { count: relayCount } = useKnownRelays();
  const unhealthyCount = ref(0);
  const suggestionCount = ref(0);
  const loaded = ref(false);

  async function refresh() {
    try {
      unhealthyCount.value = (await getUnhealthyConfiguredRelays()).length;
    } catch {
      unhealthyCount.value = 0;
    }
    try {
      suggestionCount.value = (await readCachedRelaySuggestions()).length;
    } catch {
      suggestionCount.value = 0;
    }
    loaded.value = true;
  }

  function onRelaysChanged() {
    void refresh();
  }

  onMounted(() => {
    void refresh();
    if (typeof window === "undefined") return;
    window.addEventListener("gupt:relays-changed", onRelaysChanged);
    window.addEventListener("gupt:relay-hints-changed", onRelaysChanged);
  });

  onUnmounted(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("gupt:relays-changed", onRelaysChanged);
    window.removeEventListener("gupt:relay-hints-changed", onRelaysChanged);
  });

  return {
    relayCount,
    unhealthyCount,
    suggestionCount,
    loaded,
    healthyCount: computed(() => Math.max(0, relayCount.value - unhealthyCount.value)),
    refresh,
  };
}
