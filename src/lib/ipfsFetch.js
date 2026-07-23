/**
 * ipfsFetch.js
 *
 * Thin fetch wrapper that transparently routes requests:
 *   - ipfs://<CID>  → @helia/verified-fetch  (CID-verified, trustless)
 *   - https://...   → native fetch            (existing gateway / originless URLs)
 *
 * verifiedFetch is initialised lazily on first IPFS request so the Helia
 * node doesn't spin up until it's actually needed.
 */

let _verifiedFetchPromise = null;

async function getVerifiedFetch() {
  if (_verifiedFetchPromise) return _verifiedFetchPromise;

  _verifiedFetchPromise = (async () => {
    try {
      const { createVerifiedFetch } = await import("@helia/verified-fetch");
      return await createVerifiedFetch({
        gateways: [
          "https://trustless-gateway.link",
          "https://dweb.link",
          "https://ipfs.io",
          "https://gateway.pinata.cloud",
          "https://cloudflare-ipfs.com",
          "https://w3s.link",
        ],
      });
    } catch (err) {
      _verifiedFetchPromise = null;
      throw err;
    }
  })();

  return _verifiedFetchPromise;
}

const PUBLIC_IPFS_GATEWAYS = [
  "https://trustless-gateway.link/ipfs/",
  "https://dweb.link/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

function parseIpfsUrl(urlStr) {
  return urlStr.replace(/^ipfs:\/\//i, "").trim();
}

/**
 * Drop-in replacement for fetch() that handles ipfs:// URLs via Helia
 * with fast HTTP gateway fallbacks if verifiedFetch is slow or unresponsive.
 *
 * @param {string} url  - https:// or ipfs:// URL
 * @param {RequestInit & { signal?: AbortSignal, verifiedTimeoutMs?: number }} options
 * @returns {Promise<Response>}
 */
export async function ipfsFetch(url, options = {}) {
  const str = String(url || "").trim();

  if (!str.startsWith("ipfs://")) {
    return fetch(str, options);
  }

  const cidAndPath = parseIpfsUrl(str);
  const externalSignal = options?.signal;

  // 1. Try @helia/verified-fetch first with a quick timeout (8s default) before falling back
  const verifiedTimeoutMs = options?.verifiedTimeoutMs || 8_000;
  const verifiedController = new AbortController();

  let onExternalAbort = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      verifiedController.abort();
    } else {
      onExternalAbort = () => verifiedController.abort();
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const verifiedTimer = setTimeout(() => {
    verifiedController.abort();
  }, verifiedTimeoutMs);

  try {
    const verifiedFetch = await getVerifiedFetch();
    const res = await verifiedFetch(str, {
      ...options,
      signal: verifiedController.signal,
    });
    if (res && res.ok) {
      clearTimeout(verifiedTimer);
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
      return res;
    }
  } catch (err) {
    if (externalSignal?.aborted) {
      clearTimeout(verifiedTimer);
      throw err;
    }
  } finally {
    clearTimeout(verifiedTimer);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }

  // 2. Fallback: try direct HTTP fetch across public IPFS gateways
  for (const gatewayBase of PUBLIC_IPFS_GATEWAYS) {
    if (externalSignal?.aborted) break;

    const gatewayUrl = `${gatewayBase}${cidAndPath}`;
    try {
      const res = await fetch(gatewayUrl, options);
      if (res.ok) {
        return res;
      }
    } catch {
      // Continue to next gateway on failure
    }
  }

  // 3. Final attempt with verifiedFetch (without inner timeout) if fallbacks failed
  const verifiedFetch = await getVerifiedFetch();
  return verifiedFetch(str, options);
}
