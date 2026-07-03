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

let _verifiedFetch = null;

async function getVerifiedFetch() {
  if (_verifiedFetch) return _verifiedFetch;
  const { createVerifiedFetch } = await import("@helia/verified-fetch");
  _verifiedFetch = await createVerifiedFetch({
    // Use DNS-over-HTTPS JSON resolvers — recommended for browsers to keep
    // bundle size smaller and avoid raw DNS which browsers block.
    gateways: ["https://trustless-gateway.link", "https://dweb.link"],
  });
  return _verifiedFetch;
}

/**
 * Drop-in replacement for fetch() that handles ipfs:// URLs via Helia.
 *
 * @param {string} url  - https:// or ipfs:// URL
 * @param {RequestInit & { signal?: AbortSignal }} options
 * @returns {Promise<Response>}
 */
export async function ipfsFetch(url, options = {}) {
  const str = String(url || "").trim();

  if (str.startsWith("ipfs://")) {
    const verifiedFetch = await getVerifiedFetch();
    return verifiedFetch(str, options);
  }

  return fetch(str, options);
}
