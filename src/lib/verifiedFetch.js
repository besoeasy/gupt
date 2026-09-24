import { createVerifiedFetch } from "@helia/verified-fetch";

const VERIFIED_FETCH_MAX_ATTEMPTS = 8;
const VERIFIED_FETCH_INITIAL_RETRY_DELAY_MS = 500;
const VERIFIED_FETCH_MAX_RETRY_DELAY_MS = 30_000;

let verifiedFetchPromise = null;

function abortError() {
  return new DOMException("Fetch aborted", "AbortError");
}

function waitForRetry(delayMs, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || abortError());

  return new Promise((resolve, reject) => {
    let timer = null;
    const abort = () => {
      if (timer) clearTimeout(timer);
      reject(signal?.reason || abortError());
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function getVerifiedFetch() {
  if (!verifiedFetchPromise) {
    verifiedFetchPromise = createVerifiedFetch({
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
  let lastError = null;

  for (let attempt = 0; attempt < VERIFIED_FETCH_MAX_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw signal.reason || abortError();

    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            controller.abort(new Error(`Verified fetch timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;

    try {
      const vf = await getVerifiedFetch();
      const res = await vf(`ipfs://${cid}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Verified fetch failed with status ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt === VERIFIED_FETCH_MAX_ATTEMPTS - 1) break;
      await waitForRetry(
        Math.min(
          VERIFIED_FETCH_INITIAL_RETRY_DELAY_MS * 2 ** attempt,
          VERIFIED_FETCH_MAX_RETRY_DELAY_MS,
        ),
        signal,
      );
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  throw lastError || new Error("Verified fetch failed");
}

export async function fetchEncryptedCid(cid, options = {}) {
  return fetchVerified(cid, options);
}
