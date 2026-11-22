import { computed, onMounted, onUnmounted, ref } from "vue";

import { getUnhealthyConfiguredRelays } from "@/lib/relay";
import { useKnownRelays } from "@/composables/useKnownRelays";

/**
 * One place for the numbers Settings shows about relays: how many are
 * configured and how many failed their last probe. The relays summary reads
 * from here, so the card and the failing banner can never disagree.
 */
export function useRelaySummary() {
  const { count: relayCount } = useKnownRelays();
  const unhealthyCount = ref(0);
  const loaded = ref(false);

  async function refresh() {
    try {
      unhealthyCount.value = (await getUnhealthyConfiguredRelays()).length;
    } catch {
      unhealthyCount.value = 0;
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
  });

  onUnmounted(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("gupt:relays-changed", onRelaysChanged);
  });

  return {
    relayCount,
    unhealthyCount,
    loaded,
    healthyCount: computed(() => Math.max(0, relayCount.value - unhealthyCount.value)),
    refresh,
  };
}
