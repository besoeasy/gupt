import { readConfiguredRelays, DEFAULT_RELAYS } from "../config/servers.js";

export function blobUrlFor(relay, blobHash) {
  const base = String(relay || "")
    .trim()
    .replace(/\/+$/, "");
  const id = String(blobHash || "").trim();
  if (!base || !id) return null;
  return `${base}/api/v1/blobs/${encodeURIComponent(id)}`;
}

export const BLOB_RETRY_MAX_RETRIES = 20;
export const BLOB_RETRY_MIN_DELAY_MS = 1_000;
export const BLOB_RETRY_MAX_DELAY_MS = 15_000;

/** Uniform random wait between retries, 1-15s by default. */
export function randomRetryDelayMs({
  minDelayMs = BLOB_RETRY_MIN_DELAY_MS,
  maxDelayMs = BLOB_RETRY_MAX_DELAY_MS,
  random = Math.random,
} = {}) {
  const min = Number.isFinite(minDelayMs) && minDelayMs >= 0 ? minDelayMs : BLOB_RETRY_MIN_DELAY_MS;
  const max =
    Number.isFinite(maxDelayMs) && maxDelayMs >= min ? maxDelayMs : BLOB_RETRY_MAX_DELAY_MS;
  return min + random() * (max - min);
}

function abortError() {
  return new DOMException("Fetch aborted", "AbortError");
}

export function sleepWithAbort(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason || abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === 20;
}

function concatChunks(chunks, totalLength) {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function fetchBlobBytesOnce(url, options = {}) {
  return fetchBlobBytes(url, { ...options, retries: 0 });
}

/**
 * Fetch blob bytes with automatic resume using HTTP Range requests.
 * If the connection drops or times out mid-stream, subsequent retry
 * attempts send `Range: bytes=<receivedBytes>-` so only the missing
 * slice is transferred.
 */
export async function fetchBlobBytes(
  url,
  {
    signal,
    timeoutMs = 10_000,
    retries = BLOB_RETRY_MAX_RETRIES,
    minDelayMs = BLOB_RETRY_MIN_DELAY_MS,
    maxDelayMs = BLOB_RETRY_MAX_DELAY_MS,
    onRetry,
    onProgress,
  } = {},
) {
  const maxRetries =
    Number.isFinite(retries) && retries >= 0 ? Math.floor(retries) : BLOB_RETRY_MAX_RETRIES;
  let lastError = null;
  let receivedChunks = [];
  let receivedBytes = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (signal?.aborted) throw signal.reason || abortError();

    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            controller.abort(new Error(`Blob fetch timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;

    try {
      const headers = {};
      if (receivedBytes > 0) {
        headers["Range"] = `bytes=${receivedBytes}-`;
      }

      const res = await fetch(url, { headers, signal: controller.signal });

      if (res.status === 404) {
        throw new Error(`Blob fetch failed: HTTP 404`);
      }

      if (res.status === 416) {
        // Range Not Satisfiable: offset might exceed length, reset to 0
        receivedChunks = [];
        receivedBytes = 0;
        throw new Error(`Range Not Satisfiable: HTTP 416`);
      }

      // If server returned 200 OK instead of 206 Partial Content,
      // it sent the full body from byte 0 (ignored Range). Reset accumulator.
      if (res.status === 200 && receivedBytes > 0) {
        receivedChunks = [];
        receivedBytes = 0;
      }

      if (!res.ok && res.status !== 206) {
        throw new Error(`Blob fetch failed with status ${res.status}`);
      }

      if (res.body && typeof res.body.getReader === "function") {
        const reader = res.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              receivedChunks.push(value);
              receivedBytes += value.byteLength;
              onProgress?.({ receivedBytes });
            }
          }
        } finally {
          reader.releaseLock?.();
        }
      } else {
        const buf = await res.arrayBuffer();
        const arr = new Uint8Array(buf);
        if (res.status === 206) {
          receivedChunks.push(arr);
          receivedBytes += arr.byteLength;
        } else {
          receivedChunks = [arr];
          receivedBytes = arr.byteLength;
        }
        onProgress?.({ receivedBytes });
      }

      return concatChunks(receivedChunks, receivedBytes);
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error;
      if (error?.message?.includes("HTTP 404")) throw error;
      lastError = error;
      if (attempt >= maxRetries) break;
      const delayMs = randomRetryDelayMs({ minDelayMs, maxDelayMs });
      onRetry?.({ url, attempt: attempt + 1, retries: maxRetries, delayMs, error, receivedBytes });
      await sleepWithAbort(delayMs, signal);
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  throw lastError || new Error("Blob fetch failed");
}

export async function fetchBlobFromRelays(
  blobHash,
  {
    relays,
    signal,
    timeoutMs = 10_000,
    retries = BLOB_RETRY_MAX_RETRIES,
    minDelayMs = BLOB_RETRY_MIN_DELAY_MS,
    maxDelayMs = BLOB_RETRY_MAX_DELAY_MS,
    onAttempt,
    onRetry,
  } = {},
) {
  const list = Array.isArray(relays) && relays.length ? relays : readConfiguredRelays();
  const effectiveList = list.length ? list : [...DEFAULT_RELAYS];
  let lastError = null;

  for (const relay of effectiveList) {
    if (signal?.aborted) throw signal.reason || abortError();
    const url = blobUrlFor(relay, blobHash);
    if (!url) continue;
    try {
      onAttempt?.({ relay, url });
      const bytes = await fetchBlobBytes(url, {
        signal,
        timeoutMs,
        retries,
        minDelayMs,
        maxDelayMs,
        onRetry: (retry) => onRetry?.({ ...retry, relay, url }),
      });
      return { bytes, relay, url };
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }

  throw lastError || new Error("All Rabta relays failed to return blob");
}
