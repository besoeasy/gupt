import { computed, onMounted, onUnmounted, ref } from "vue";

import { getKnownRelays } from "@/lib/relay";

/**
 * Reactive view of the configured relay list. The relay store is plain
 * localStorage, so we re-read it whenever something writes (`saveConfiguredRelays`
 * fires `gupt:relays-changed`) or another tab changes it.
 */
export function useKnownRelays() {
  const relays = ref(getKnownRelays());

  function refresh() {
    relays.value = getKnownRelays();
  }

  function onStorage() {
    refresh();
  }

  onMounted(() => {
    refresh();
    if (typeof window === "undefined") return;
    window.addEventListener("gupt:relays-changed", onStorage);
    window.addEventListener("storage", onStorage);
  });

  onUnmounted(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("gupt:relays-changed", onStorage);
    window.removeEventListener("storage", onStorage);
  });

  return {
    relays,
    count: computed(() => relays.value.length),
    refresh,
  };
}
