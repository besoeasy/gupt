/**
 * ipfsFetch.js
 *
 * Thin fetch wrapper that transparently routes requests:
 *   - ipfs://<CID>  → @helia/verified-fetch  (CID-verified, trustless)
 *   - https://...   → native fetch
 *
 * verifiedFetch is loaded lazily on first IPFS request so Helia stays off
 * the critical path until media is actually needed.
 */

let _verifiedFetchPromise = null;

async function getVerifiedFetch() {
  if (_verifiedFetchPromise) return _verifiedFetchPromise;

  _verifiedFetchPromise = (async () => {
    try {
      const { verifiedFetch } = await import("@helia/verified-fetch");
      return verifiedFetch;
    } catch (err) {
      _verifiedFetchPromise = null;
      throw err;
    }
  })();

  return _verifiedFetchPromise;
}

/**
 * Drop-in replacement for fetch() that handles ipfs:// URLs via Helia.
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

  const verifiedFetch = await getVerifiedFetch();
  return verifiedFetch(str, options);
}
