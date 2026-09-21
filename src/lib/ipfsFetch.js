/**
 * ipfsFetch.js
 *
 * Thin fetch wrapper that transparently routes requests:
 *   - ipfs://<CID>  → public IPFS gateways (Originless no longer serves
 *     GET /ipfs/{cid}; it remains upload-only via POST /upload)
 *   - https://...   → native fetch
 */

const PUBLIC_IPFS_GATEWAYS = Object.freeze([
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://trustless-gateway.link/ipfs/",
  "https://inbrowser.link/ipfs/",
]);

function parseIpfsUrl(urlStr) {
  return urlStr.replace(/^ipfs:\/\//i, "").trim();
}

function gatewayBases() {
  return [...PUBLIC_IPFS_GATEWAYS];
}

function abortOthers(controllers, keep) {
  for (const controller of controllers) {
    if (controller !== keep) controller.abort();
  }
}

/**
 * Drop-in replacement for fetch() that handles ipfs:// URLs.
 *
 * @param {string} url  - https:// or ipfs:// URL
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
export async function ipfsFetch(url, options = {}) {
  const str = String(url || "").trim();

  if (!str.startsWith("ipfs://")) {
    return fetch(str, options);
  }

  const cidAndPath = parseIpfsUrl(str);
  if (!cidAndPath) throw new Error("Missing IPFS CID");

  const bases = gatewayBases();
  const controllers = [];
  let winner = null;

  const onExternalAbort = () => abortOthers(controllers, null);
  if (options.signal) {
    if (options.signal.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    options.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    return await Promise.any(
      bases.map(async (base) => {
        const controller = new AbortController();
        controllers.push(controller);
        if (options.signal?.aborted) controller.abort();

        const res = await fetch(`${base}${cidAndPath}`, {
          ...options,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Media fetch failed (${res.status})`);
        if (!winner) winner = controller;
        abortOthers(controllers, winner);
        return res;
      }),
    );
  } catch (err) {
    if (options.signal?.aborted) throw err;
    const inner = err instanceof AggregateError ? err.errors?.[0] : err;
    throw inner instanceof Error ? inner : new Error("IPFS fetch failed");
  } finally {
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}
