import { readConfiguredIpfsGateways } from "@/config/servers";
import { gatewayUrlFor } from "@/lib/gatewayFetch";

/**
 * Profile pictures are stored as `ipfs://<cid>` only. An arbitrary https URL
 * from a contact's profile must never be requested directly by the browser:
 * the browser would connect to the peer's chosen host and expose our IP.
 * Anything that is not a well-formed ipfs:// CID expands to "" so callers
 * fall back to the generated avatar.
 */
export function resolveProfilePictureSrc(raw) {
  const value = String(raw || "").trim();
  if (!/^ipfs:\/\//i.test(value)) return "";
  const cid = value.slice(7).replace(/\/+$/, "").trim();
  if (!/^[a-zA-Z0-9]{8,}$/.test(cid)) return "";

  // Viewer's IP reaches the configured gateway, the host WE chose — never a
  // peer's. First configured gateway keeps it deterministic and cacheable.
  const gateway = readConfiguredIpfsGateways()[0];
  return gatewayUrlFor(gateway, cid) || "";
}
