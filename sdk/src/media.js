import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

import { createVerifiedFetch } from "@helia/verified-fetch";
import { gcm } from "@noble/ciphers/aes.js";

export const MEDIA_FETCH_TIMEOUT_MS = 10_000;
export const MEDIA_FETCH_MAX_ATTEMPTS = 8;
export const MEDIA_FETCH_INITIAL_RETRY_DELAY_MS = 500;
export const MEDIA_FETCH_MAX_RETRY_DELAY_MS = 30_000;
export const MEDIA_UPLOAD_BASE_TIMEOUT_MS = 30_000;
export const MEDIA_UPLOAD_MIN_BYTES_PER_SEC = 50_000;

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class MediaError extends Error {
  constructor(message, kind = "unknown", options) {
    super(message, options);
    this.name = "MediaError";
    this.kind = kind;
  }
}

function asBytes(value) {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function encodeBase64(value) {
  return Buffer.from(value).toString("base64");
}

function decodeBase64(value, expectedLength, label) {
  const encoded = String(value || "").trim();
  if (!encoded || !BASE64_RE.test(encoded)) {
    throw new MediaError(`Invalid media ${label}.`, "payload");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== expectedLength) {
    throw new MediaError(`Invalid media ${label} length.`, "payload");
  }
  return new Uint8Array(bytes);
}

function normalizeCid(value) {
  const cid = String(value || "").trim();
  if (!cid || cid.length < 10) throw new MediaError("Invalid or missing media cid.", "payload");
  return cid;
}

function normalizeName(value) {
  const name = basename(String(value || "").trim()).slice(0, 255);
  return name || "attachment.bin";
}

function normalizeMime(value) {
  return (
    String(value || "application/octet-stream")
      .trim()
      .slice(0, 200) || "application/octet-stream"
  );
}

function normalizeSize(value, maxBytes = null) {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new MediaError("Invalid media size.", "payload");
  }
  if (maxBytes != null && size > maxBytes)
    throw new MediaError(`Media exceeds the ${maxBytes}-byte limit.`, "size");
  return size;
}

function normalizeServer(value, allowPrivate = false) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) return null;
    url.pathname = url.pathname
      .replace(/\/(events|blob|up|upf|ipfs|down)\/?$/i, "")
      .replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function pickUploadCid(payload) {
  if (!payload || typeof payload !== "object") return null;
  const direct =
    payload.cid || payload.CID || payload.hash || payload.Hash || payload.root || payload.Root;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return pickUploadCid(payload.value);
}

async function attachmentInput(input, options, maxBytes = null) {
  let bytes;
  let inferredName = "";
  let inferredMime = "";

  if (typeof input === "string") {
    const details = await stat(input);
    if (!details.isFile()) throw new MediaError("Attachment path must be a regular file.", "input");
    if (maxBytes != null && details.size > maxBytes) {
      throw new MediaError(`Media exceeds the ${maxBytes}-byte limit.`, "size");
    }
    bytes = new Uint8Array(await readFile(input));
    inferredName = basename(input);
  } else if (typeof Blob !== "undefined" && input instanceof Blob) {
    if (maxBytes != null && input.size > maxBytes) {
      throw new MediaError(`Media exceeds the ${maxBytes}-byte limit.`, "size");
    }
    bytes = new Uint8Array(await input.arrayBuffer());
    inferredName = typeof input.name === "string" ? input.name : "";
    inferredMime = input.type;
  } else {
    bytes = asBytes(input);
  }

  if (!bytes) {
    throw new TypeError("File input must be a path, Blob, Buffer, Uint8Array, or ArrayBuffer");
  }
  if (maxBytes != null && bytes.byteLength > maxBytes) {
    throw new MediaError(`Media exceeds the ${maxBytes}-byte limit.`, "size");
  }

  return {
    bytes,
    name: normalizeName(options.name || inferredName),
    mime: normalizeMime(options.mime || inferredMime),
  };
}

export function parseMediaPayload(payload, { maxBytes = null } = {}) {
  const type = String(payload?.type || "");
  if (type !== "media" && type !== "voice") return null;
  const media = payload?.media;
  if (!media || typeof media !== "object" || Array.isArray(media)) {
    throw new MediaError("Missing media payload.", "payload");
  }

  return {
    type,
    name: normalizeName(media.name || payload.text),
    mime: normalizeMime(media.mime),
    size: normalizeSize(media.size, maxBytes),
    cid: normalizeCid(media.cid),
    durationMs: Number.isFinite(Number(payload.durationMs))
      ? Math.max(0, Number(payload.durationMs))
      : 0,
    key: decodeBase64(media.key, 32, "key"),
    nonce: decodeBase64(media.nonce, 12, "nonce"),
  };
}

export function encryptAttachmentBytes(value, options = {}) {
  const bytes = asBytes(value);
  if (!bytes) throw new TypeError("Attachment data must be bytes");
  const key = options.key
    ? Uint8Array.from(options.key)
    : crypto.getRandomValues(new Uint8Array(32));
  const nonce = options.nonce
    ? Uint8Array.from(options.nonce)
    : crypto.getRandomValues(new Uint8Array(12));
  if (key.length !== 32) throw new TypeError("Media key must contain 32 bytes");
  if (nonce.length !== 12) throw new TypeError("Media nonce must contain 12 bytes");
  return {
    encrypted: gcm(key, nonce).encrypt(bytes),
    key,
    nonce,
  };
}

export function decryptAttachmentBytes(encrypted, key, nonce) {
  const ciphertext = asBytes(encrypted);
  if (!ciphertext) throw new TypeError("Encrypted attachment must be bytes");
  try {
    return gcm(Uint8Array.from(key), Uint8Array.from(nonce)).decrypt(ciphertext);
  } catch (error) {
    throw new MediaError("Unable to decrypt media attachment.", "decrypt", { cause: error });
  }
}

function uploadTimeoutMs(size, override) {
  if (override != null) return Math.max(1, Number(override) || 1);
  return Math.max(
    MEDIA_UPLOAD_BASE_TIMEOUT_MS,
    Math.ceil((size / MEDIA_UPLOAD_MIN_BYTES_PER_SEC) * 1000),
  );
}

async function uploadOne(server, encrypted, name, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();

  try {
    const rawBytes = encrypted instanceof Uint8Array ? encrypted : new Uint8Array(encrypted);
    const form = new FormData();
    form.append(
      "file",
      new Blob([rawBytes], { type: "application/octet-stream" }),
      name || "gupt.bin",
    );

    const response = await options.fetchImpl(`${server}/up`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).trim().slice(0, 200);
      throw new MediaError(
        `Upload failed (${response.status})${detail ? `: ${detail}` : ""}`,
        "upload",
      );
    }
    const payload = await response.json().catch(() => ({}));
    const cid = pickUploadCid(payload);
    if (!cid) throw new MediaError("Originless response did not contain a CID.", "upload");
    return { cid, server };
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(error?.message || "Media upload failed.", "upload", { cause: error });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export async function uploadEncryptedAttachment(
  encrypted,
  {
    name = "attachment.bin",
    originlessServers,
    fetchImpl = globalThis.fetch,
    timeoutMs,
    signal,
    allowPrivateServers = false,
    onProgress,
  } = {},
) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  const bytes = asBytes(encrypted);
  if (!bytes) throw new TypeError("Encrypted attachment must be bytes");
  const servers = [
    ...new Set(
      (Array.isArray(originlessServers) ? originlessServers : [])
        .map((server) => normalizeServer(server, allowPrivateServers))
        .filter(Boolean),
    ),
  ];
  if (!servers.length) throw new MediaError("No valid Originless server configured.", "upload");

  const successes = [];
  const failures = [];
  const timeout = uploadTimeoutMs(bytes.byteLength, timeoutMs);
  const safeName = normalizeName(name);

  await Promise.all(
    servers.map(async (server) => {
      onProgress?.({ phase: "uploading", status: "started", server });
      try {
        const result = await uploadOne(server, bytes, safeName, {
          fetchImpl,
          timeoutMs: timeout,
          signal,
        });
        successes.push(result);
        onProgress?.({ phase: "uploading", status: "done", server });
      } catch (error) {
        failures.push(error);
        onProgress?.({ phase: "uploading", status: "failed", server, error: error.message });
      }
    }),
  );
  if (!successes.length) {
    throw new MediaError(
      failures
        .map((error) => error.message)
        .filter(Boolean)
        .join(" | ") || "Upload failed on all Originless servers.",
      "upload",
    );
  }
  const orderedSuccesses = servers
    .map((server) => successes.find((result) => result.server === server))
    .filter(Boolean);
  const primary = orderedSuccesses[0] || successes[0];
  return {
    cid: primary.cid,
    server: primary.server,
    servers: (orderedSuccesses.length ? orderedSuccesses : successes).map(
      (result) => result.server,
    ),
    redundancyCount: successes.length,
  };
}

export async function createMediaPayload(
  input,
  {
    originlessServers,
    type = "media",
    name,
    mime,
    durationMs = 0,
    maxBytes = null,
    fetchImpl = globalThis.fetch,
    timeoutMs,
    signal,
    allowPrivateServers = false,
    onProgress,
  } = {},
) {
  if (type !== "media" && type !== "voice") {
    throw new TypeError("Attachment type must be media or voice");
  }
  const attachment = await attachmentInput(input, { name, mime }, maxBytes);
  onProgress?.({ phase: "encrypting", status: "started" });
  const { encrypted, key, nonce } = encryptAttachmentBytes(attachment.bytes);
  onProgress?.({ phase: "encrypting", status: "done" });
  const uploaded = await uploadEncryptedAttachment(encrypted, {
    name: attachment.name,
    originlessServers,
    fetchImpl,
    timeoutMs,
    signal,
    allowPrivateServers,
    onProgress,
  });
  return {
    type,
    text: attachment.name,
    media: {
      key: encodeBase64(key),
      nonce: encodeBase64(nonce),
      mime: attachment.mime,
      name: attachment.name,
      size: attachment.bytes.byteLength,
      cid: uploaded.cid,
    },
    durationMs: Number.isFinite(Number(durationMs)) ? Math.max(0, Number(durationMs)) : 0,
  };
}

async function readBoundedResponse(response, maxBytes = null) {
  if (!response.ok) throw new MediaError(`Media fetch failed (${response.status}).`, "fetch");
  const contentLength = Number(response.headers.get("content-length"));
  if (maxBytes != null && Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new MediaError("Encrypted media response is too large.", "size");
  }
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (maxBytes != null && bytes.byteLength > maxBytes) {
      throw new MediaError("Encrypted media response is too large.", "size");
    }
    return bytes;
  }

  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (maxBytes != null && total > maxBytes) {
      await reader.cancel();
      throw new MediaError("Encrypted media response is too large.", "size");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

let sdkVerifiedFetchPromise = null;

export async function getVerifiedFetch() {
  if (!sdkVerifiedFetchPromise) {
    sdkVerifiedFetchPromise = createVerifiedFetch({
      allowInsecure: true,
      allowLocal: true,
    }).catch((err) => {
      sdkVerifiedFetchPromise = null;
      throw err;
    });
  }
  return sdkVerifiedFetchPromise;
}

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

export async function fetchVerifiedResponse(
  url,
  {
    verifiedFetch,
    signal,
    timeoutMs = MEDIA_FETCH_TIMEOUT_MS,
    maxAttempts = MEDIA_FETCH_MAX_ATTEMPTS,
    initialDelayMs = MEDIA_FETCH_INITIAL_RETRY_DELAY_MS,
    maxDelayMs = MEDIA_FETCH_MAX_RETRY_DELAY_MS,
    wait = waitForRetry,
  },
) {
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) throw signal.reason || abortError();

    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            controller.abort(new Error(`Media fetch timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;

    try {
      const response = await verifiedFetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new MediaError(`Media fetch failed (${response.status}).`, "fetch");
      }
      return response;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt === maxAttempts - 1) break;
      await wait(Math.min(initialDelayMs * 2 ** attempt, maxDelayMs), signal);
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  throw lastError || new MediaError("Unable to download media.", "fetch");
}

export async function downloadMediaPayload(
  payload,
  { fetchImpl = globalThis.fetch, timeoutMs = MEDIA_FETCH_TIMEOUT_MS, maxBytes = null, signal } = {},
) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  const attachment = parseMediaPayload(payload, { maxBytes });
  if (!attachment) throw new MediaError("Message does not contain a file.", "payload");

  const cidUrl = `ipfs://${attachment.cid}`;
  let encrypted;

  if (fetchImpl !== globalThis.fetch) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const timeout =
      timeoutMs > 0
        ? setTimeout(() => {
            controller.abort(new Error(`Media fetch timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;

    try {
      const response = await fetchImpl(cidUrl, { signal: controller.signal });
      encrypted = await readBoundedResponse(response, attachment.size + 16);
    } finally {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  } else {
    let vf;
    try {
      vf = await getVerifiedFetch();
    } catch (error) {
      throw new MediaError(error?.message || "Failed to initialize verified fetch", "fetch", {
        cause: error,
      });
    }

    try {
      const response = await fetchVerifiedResponse(cidUrl, {
        verifiedFetch: vf,
        signal,
        timeoutMs,
      });
      encrypted = await readBoundedResponse(response, attachment.size + 16);
    } catch (error) {
      if (error instanceof MediaError) throw error;
      throw new MediaError(error?.message || "Unable to download media.", "fetch", {
        cause: error,
      });
    }
  }

  const data = decryptAttachmentBytes(encrypted, attachment.key, attachment.nonce);
  if (data.byteLength !== attachment.size) {
    throw new MediaError("Decrypted media size does not match its payload.", "decrypt");
  }

  return {
    data,
    name: attachment.name,
    mime: attachment.mime,
    size: attachment.size,
    cid: attachment.cid,
    type: attachment.type,
    durationMs: attachment.durationMs,
    sourceUrl: cidUrl,
  };
}
