import { ref } from "vue";
import {
  DEFAULT_IPFS_GATEWAYS,
  normalizeIpfsGatewayUrl,
  readConfiguredIpfsGateways,
  saveConfiguredIpfsGateways,
} from "@/config/servers";
import { resetVerifiedFetch } from "@/lib/verifiedFetch";

const ipfsGateways = ref([]);
const isLoaded = ref(false);

export function useIpfsGateways() {
  if (!isLoaded.value) {
    ipfsGateways.value = readConfiguredIpfsGateways();
    isLoaded.value = true;
  }

  function persist(next) {
    ipfsGateways.value = saveConfiguredIpfsGateways(next);
    resetVerifiedFetch();
  }

  function addGateway(rawUrl) {
    const normalized = normalizeIpfsGatewayUrl(rawUrl);
    if (!normalized) return { ok: false, reason: "invalid" };
    if (ipfsGateways.value.includes(normalized)) return { ok: false, reason: "duplicate" };
    persist([...ipfsGateways.value, normalized]);
    return { ok: true, gateway: normalized };
  }

  function removeGateway(gateway) {
    persist(ipfsGateways.value.filter((entry) => entry !== gateway));
  }

  function resetToDefaults() {
    persist([...DEFAULT_IPFS_GATEWAYS]);
  }

  return { ipfsGateways, addGateway, removeGateway, resetToDefaults };
}
