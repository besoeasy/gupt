import { readConfiguredIpfsGateways } from "@/config/servers";

export function gatewayUrlFor(gateway, cid) {
  const base = String(gateway || "")
    .trim()
    .replace(/\/+$/, "");
  const id = String(cid || "").trim();
  if (!base || !id) return null;
  return `${base}/ipfs/${encodeURIComponent(id)}`;
}

function abortError() {
  return new DOMException("Fetch aborted", "AbortError");
}

export async function fetchGatewayBytes(url, { signal, timeoutMs = 10_000 } = {}) {
  if (signal?.aborted) throw signal.reason || abortError();

  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          controller.abort(new Error(`Gateway fetch timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      : null;

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Gateway fetch failed with status ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function fetchCidFromGateways(
  cid,
  { gateways, signal, timeoutMs = 10_000, onAttempt } = {},
) {
  const list = Array.isArray(gateways) && gateways.length ? gateways : readConfiguredIpfsGateways();
  let lastError = null;

  for (const gateway of list) {
    if (signal?.aborted) throw signal.reason || abortError();
    const url = gatewayUrlFor(gateway, cid);
    if (!url) continue;
    try {
      onAttempt?.({ gateway, url });
      const bytes = await fetchGatewayBytes(url, { signal, timeoutMs });
      return { bytes, gateway, url };
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }

  throw lastError || new Error("All gateways failed");
}
