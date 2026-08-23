/**
 * ipfsFetch.js
 *
 * Thin fetch wrapper that transparently routes requests:
 *   - ipfs://<CID>  → Originless GET /ipfs/{cid}, then hardcoded public gateways
 *   - https://...   → native fetch
 *
 * The gateway list is built per request from the current Originless server
 * settings plus PUBLIC_IPFS_GATEWAYS. originless.gupt.app is not a special
 * fetch host — it only appears if it is in the configured Originless list
 * (it is the default upload server).
 */

import { readConfiguredOriginlessServers } from "@/config/servers";

const PUBLIC_IPFS_GATEWAYS = Object.freeze([
  "https://ipfs.io/ipfs/",
  "https://inbrowser.link/ipfs/",
]);

function parseIpfsUrl(urlStr) {
  return urlStr.replace(/^ipfs:\/\//i, "").trim();
}

function originlessGatewayBase(server) {
  return `${String(server).replace(/\/+$/, "")}/ipfs/`;
}

function gatewayBases() {
  const originless = readConfiguredOriginlessServers().map(originlessGatewayBase);
  return [...new Set([...originless, ...PUBLIC_IPFS_GATEWAYS])];
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
