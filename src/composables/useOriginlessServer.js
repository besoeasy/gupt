import { ref } from "vue";
import {
  DEFAULT_ORIGINLESS_SERVER,
  normalizeOriginlessServerUrl,
  readConfiguredOriginlessServer,
  saveConfiguredOriginlessServer,
} from "@/config/servers";

const server = ref("");
let loaded = false;

export function useOriginlessServer() {
  if (!loaded) {
    server.value = readConfiguredOriginlessServer();
    loaded = true;
  }

  function save(rawUrl) {
    const normalized = normalizeOriginlessServerUrl(rawUrl);
    if (!normalized) return { ok: false, reason: "invalid" };
    server.value = saveConfiguredOriginlessServer(normalized);
    return { ok: true, server: server.value };
  }

  function resetToDefaults() {
    server.value = saveConfiguredOriginlessServer(DEFAULT_ORIGINLESS_SERVER);
  }

  return { server, save, resetToDefaults };
}
