import { createVerifiedFetch } from "@helia/verified-fetch";
import { DEFAULT_ORIGINLESS_SERVERS, readConfiguredOriginlessServers } from "@/config/servers";

export const DEFAULT_TRUSTLESS_GATEWAYS = Object.freeze([
  "https://trustless-gateway.link",
  "https://4everland.io",
]);

let verifiedFetchPromise = null;
let cachedGatewaysKey = "";

export function getAllOriginlessGateways() {
  const configured = readConfiguredOriginlessServers();
  return [...new Set([...DEFAULT_ORIGINLESS_SERVERS, ...configured].filter(Boolean))];
}

export function resolveVerifiedFetchGateways(extraGateways = []) {
  const originless = getAllOriginlessGateways();
  return [
    ...new Set([...DEFAULT_TRUSTLESS_GATEWAYS, ...originless, ...extraGateways].filter(Boolean)),
  ];
}

export async function getVerifiedFetch(extraGateways = []) {
  const gateways = resolveVerifiedFetchGateways(extraGateways);
  const gatewaysKey = gateways.join(",");

  if (!verifiedFetchPromise || cachedGatewaysKey !== gatewaysKey) {
    cachedGatewaysKey = gatewaysKey;
    verifiedFetchPromise = createVerifiedFetch({
      gateways,
      allowInsecure: true,
      allowLocal: true,
    }).catch((err) => {
      verifiedFetchPromise = null;
      throw err;
    });
  }

  return verifiedFetchPromise;
}

export async function fetchVerified(cid, { signal, timeoutMs = 20_000 } = {}) {
  const controller = new AbortController();
  let timer = null;

  if (signal) {
    if (signal.aborted) throw new DOMException("Fetch aborted", "AbortError");
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      controller.abort(new Error(`Verified fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  try {
    const vf = await getVerifiedFetch();
    const res = await vf(`ipfs://${cid}`, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Verified fetch failed with status ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchEncryptedCid(cid, { signal, timeoutMs = 20_000 } = {}) {
  try {
    return await fetchVerified(cid, { signal, timeoutMs });
  } catch (vfErr) {
    if (signal?.aborted) throw vfErr;

    const servers = getAllOriginlessGateways();
    for (const server of servers) {
      if (signal?.aborted) throw new DOMException("Fetch aborted", "AbortError");
      const url = `${server}/ipfs/${cid}`;
      try {
        const res = await fetch(url, { signal });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          return new Uint8Array(buf);
        }
      } catch {}
    }
    throw vfErr;
  }
}
