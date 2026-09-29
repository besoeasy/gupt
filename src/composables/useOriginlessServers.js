import { computed, ref } from "vue";
import {
  DEFAULT_ORIGINLESS_SERVERS,
  normalizeOriginlessServerUrl,
  readConfiguredOriginlessServers,
  saveConfiguredOriginlessServers,
} from "@/config/servers";

/** Minimum configured servers before uploads have any redundancy. */
export const ORIGINLESS_REDUNDANCY_TARGET = 2;

const originlessServers = ref([]);
const isLoaded = ref(false);

/**
 * Shared reactive view of the configured Originless upload servers, so the
 * settings header notice and the server list panel stay in sync. All writes go
 * through `persist`, which is the only thing that touches localStorage.
 */
export function useOriginlessServers() {
  if (!isLoaded.value) {
    originlessServers.value = readConfiguredOriginlessServers();
    isLoaded.value = true;
  }

  const count = computed(() => originlessServers.value.length);
  const needsRedundancy = computed(() => count.value < ORIGINLESS_REDUNDANCY_TARGET);

  function persist(next) {
    originlessServers.value = saveConfiguredOriginlessServers(next);
  }

  function addServer(rawUrl) {
    const normalized = normalizeOriginlessServerUrl(rawUrl);
    if (!normalized) return { ok: false, reason: "invalid" };
    if (originlessServers.value.includes(normalized)) return { ok: false, reason: "duplicate" };
    persist([...originlessServers.value, normalized]);
    return { ok: true, server: normalized };
  }

  function removeServer(server) {
    persist(originlessServers.value.filter((entry) => entry !== server));
  }

  function resetToDefaults() {
    persist([...DEFAULT_ORIGINLESS_SERVERS]);
  }

  return { originlessServers, count, needsRedundancy, addServer, removeServer, resetToDefaults };
}
