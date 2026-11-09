import { readConfiguredRelays, DEFAULT_RELAYS } from "@/config/servers";

export function blobUrlFor(relay, blobHash) {
  const base = String(relay || "")
    .trim()
    .replace(/\/+$/, "");
  const id = String(blobHash || "").trim();
  if (!base || !id) return null;
  return `${base}/api/v1/blobs/${encodeURIComponent(id)}`;
}

export const BLOB_RETRY_MAX_RETRIES = 8;
export const BLOB_RETRY_BASE_DELAY_MS = 4_000;
export const BLOB_RETRY_MULTIPLIER = 2;
export const BLOB_RETRY_MAX_DELAY_MS = 60_000;

export function backoffDelayForAttempt(
  retryIndex,
  {
    baseDelayMs = BLOB_RETRY_BASE_DELAY_MS,
    backoffMultiplier = BLOB_RETRY_MULTIPLIER,
    maxDelayMs = BLOB_RETRY_MAX_DELAY_MS,
    jitter = true,
  } = {},
) {
  const base =
    Number.isFinite(baseDelayMs) && baseDelayMs >= 0 ? baseDelayMs : BLOB_RETRY_BASE_DELAY_MS;
  const multiplier =
    Number.isFinite(backoffMultiplier) && backoffMultiplier >= 1
      ? backoffMultiplier
      : BLOB_RETRY_MULTIPLIER;
  const cap = Number.isFinite(maxDelayMs) && maxDelayMs >= 0 ? maxDelayMs : BLOB_RETRY_MAX_DELAY_MS;
  let delay = base * Math.pow(multiplier, Math.max(0, retryIndex));
  if (jitter) {
    delay *= 0.8 + Math.random() * 0.4;
  }
  return Math.min(delay, cap);
}

function abortError() {
  return new DOMException("Fetch aborted", "AbortError");
}

function sleepWithAbort(delayMs, signal) {
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

async function fetchBlobBytesOnce(url, { signal, timeoutMs = 10_000 } = {}) {
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
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Blob fetch failed with status ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function fetchBlobBytes(
  url,
  {
    signal,
    timeoutMs = 10_000,
    retries = BLOB_RETRY_MAX_RETRIES,
    baseDelayMs = BLOB_RETRY_BASE_DELAY_MS,
    backoffMultiplier = BLOB_RETRY_MULTIPLIER,
    maxDelayMs = BLOB_RETRY_MAX_DELAY_MS,
    jitter = true,
    onRetry,
  } = {},
) {
  const maxRetries =
    Number.isFinite(retries) && retries >= 0 ? Math.floor(retries) : BLOB_RETRY_MAX_RETRIES;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (signal?.aborted) throw signal.reason || abortError();
    try {
      return await fetchBlobBytesOnce(url, { signal, timeoutMs });
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error;
      lastError = error;
      if (attempt >= maxRetries) break;
      const delayMs = backoffDelayForAttempt(attempt, {
        baseDelayMs,
        backoffMultiplier,
        maxDelayMs,
        jitter,
      });
      onRetry?.({ url, attempt: attempt + 1, retries: maxRetries, delayMs, error });
      await sleepWithAbort(delayMs, signal);
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
    baseDelayMs = BLOB_RETRY_BASE_DELAY_MS,
    backoffMultiplier = BLOB_RETRY_MULTIPLIER,
    maxDelayMs = BLOB_RETRY_MAX_DELAY_MS,
    jitter = true,
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
        baseDelayMs,
        backoffMultiplier,
        maxDelayMs,
        jitter,
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

// Aliases for backwards compatibility
export const gatewayUrlFor = blobUrlFor;
export const fetchGatewayBytes = fetchBlobBytes;
export const fetchCidFromGateways = fetchBlobFromRelays;
export const IPFS_RETRY_MAX_RETRIES = BLOB_RETRY_MAX_RETRIES;
export const IPFS_RETRY_BASE_DELAY_MS = BLOB_RETRY_BASE_DELAY_MS;
export const IPFS_RETRY_MULTIPLIER = BLOB_RETRY_MULTIPLIER;
export const IPFS_RETRY_MAX_DELAY_MS = BLOB_RETRY_MAX_DELAY_MS;
