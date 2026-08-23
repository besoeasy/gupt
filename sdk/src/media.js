import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

import { gcm } from "@noble/ciphers/aes.js";

export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MEDIA_FETCH_TIMEOUT_MS = 10_000;
export const MEDIA_UPLOAD_BASE_TIMEOUT_MS = 30_000;
export const MEDIA_UPLOAD_MIN_BYTES_PER_SEC = 50_000;
export const MEDIA_UPLOAD_REDUNDANCY = 2;
export const PUBLIC_IPFS_GATEWAYS = Object.freeze([
  "https://ipfs.io/ipfs/",
  "https://inbrowser.link/ipfs/",
]);

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CID_RE = /^[A-Za-z0-9]{10,200}$/;

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
  if (!CID_RE.test(cid)) throw new MediaError("Invalid or missing media CID.", "payload");
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

function normalizeSize(value, maxBytes) {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new MediaError("Invalid media size.", "payload");
  }
  if (size > maxBytes) throw new MediaError(`Media exceeds the ${maxBytes}-byte limit.`, "size");
  return size;
}

function normalizeServer(value, allowPrivate = false) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) return null;
    url.pathname = url.pathname.replace(/\/upload\/?$/i, "").replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizeGateway(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return url.toString().replace(/\/+$/, "") + "/";
  } catch {
    return null;
  }
}

function pickUploadCid(payload) {
  if (!payload || typeof payload !== "object") return null;
  const direct = payload.cid || payload.CID || payload.hash || payload.Hash || payload.ipfs;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return pickUploadCid(payload.value);
}

async function attachmentInput(input, options, maxBytes) {
  let bytes;
  let inferredName = "";
  let inferredMime = "";

  if (typeof input === "string") {
    const details = await stat(input);
    if (!details.isFile()) throw new MediaError("Attachment path must be a regular file.", "input");
    if (details.size > maxBytes) {
      throw new MediaError(`Media exceeds the ${maxBytes}-byte limit.`, "size");
    }
    bytes = new Uint8Array(await readFile(input));
    inferredName = basename(input);
  } else if (typeof Blob !== "undefined" && input instanceof Blob) {
    if (input.size > maxBytes) {
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
  if (bytes.byteLength > maxBytes) {
    throw new MediaError(`Media exceeds the ${maxBytes}-byte limit.`, "size");
  }

  return {
    bytes,
    name: normalizeName(options.name || inferredName),
    mime: normalizeMime(options.mime || inferredMime),
  };
}

export function parseMediaPayload(payload, { maxBytes = MAX_MEDIA_BYTES } = {}) {
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
    const form = new FormData();
    form.append("file", new Blob([encrypted], { type: "application/octet-stream" }), `${name}.enc`);
    const response = await options.fetchImpl(`${server}/upload`, {
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
    const cid = normalizeCid(pickUploadCid(await response.json()));
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

  const target = Math.min(MEDIA_UPLOAD_REDUNDANCY, servers.length);
  const successes = [];
  const failures = [];
  let cursor = 0;

  async function worker() {
    while (cursor < servers.length && successes.length < target) {
      const server = servers[cursor++];
      onProgress?.({ phase: "uploading", status: "started", server });
      try {
        const result = await uploadOne(server, bytes, normalizeName(name), {
          fetchImpl,
          timeoutMs: uploadTimeoutMs(bytes.byteLength, timeoutMs),
          signal,
        });
        successes.push(result);
        onProgress?.({ phase: "uploading", status: "done", server });
      } catch (error) {
        failures.push(error);
        onProgress?.({ phase: "uploading", status: "failed", server, error: error.message });
      }
    }
  }

  await Promise.all(Array.from({ length: target }, () => worker()));
  if (!successes.length) {
    throw new MediaError(
      failures
        .map((error) => error.message)
        .filter(Boolean)
        .join(" | ") || "Upload failed on all Originless servers.",
      "upload",
    );
  }
  return {
    cid: successes[0].cid,
    server: successes[0].server,
    servers: successes.map((result) => result.server),
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
    maxBytes = MAX_MEDIA_BYTES,
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

async function readBoundedResponse(response, maxBytes) {
  if (!response.ok) throw new MediaError(`Media fetch failed (${response.status}).`, "fetch");
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new MediaError("Encrypted media response is too large.", "size");
  }
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
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
    if (total > maxBytes) {
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

async function fetchEncrypted(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    const response = await options.fetchImpl(url, { signal: controller.signal });
    return await readBoundedResponse(response, options.maxBytes);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export async function downloadMediaPayload(
  payload,
  {
    originlessServers = [],
    gateways = PUBLIC_IPFS_GATEWAYS,
    fetchImpl = globalThis.fetch,
    timeoutMs = MEDIA_FETCH_TIMEOUT_MS,
    maxBytes = MAX_MEDIA_BYTES,
    signal,
    allowPrivateServers = false,
  } = {},
) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  const attachment = parseMediaPayload(payload, { maxBytes });
  if (!attachment) throw new MediaError("Message does not contain a file.", "payload");

  const originless = (Array.isArray(originlessServers) ? originlessServers : [])
    .map((server) => normalizeServer(server, allowPrivateServers))
    .filter(Boolean)
    .map((server) => `${server}/ipfs/`);
  const gatewayBases = (Array.isArray(gateways) ? gateways : [])
    .map(normalizeGateway)
    .filter(Boolean);
  const urls = [...new Set([...originless, ...gatewayBases])].map(
    (base) => `${base}${attachment.cid}`,
  );
  if (!urls.length) throw new MediaError("No media download gateway configured.", "fetch");

  const controllers = urls.map(() => new AbortController());
  const abortAll = () => controllers.forEach((controller) => controller.abort(signal?.reason));
  signal?.addEventListener("abort", abortAll, { once: true });
  if (signal?.aborted) abortAll();
  try {
    const result = await Promise.any(
      urls.map(async (url, index) => {
        const encrypted = await fetchEncrypted(url, {
          fetchImpl,
          timeoutMs,
          maxBytes: attachment.size + 16,
          signal: controllers[index].signal,
        });
        const data = decryptAttachmentBytes(encrypted, attachment.key, attachment.nonce);
        if (data.byteLength !== attachment.size) {
          throw new MediaError("Decrypted media size does not match its payload.", "decrypt");
        }
        controllers.forEach((controller, controllerIndex) => {
          if (controllerIndex !== index) controller.abort();
        });
        return {
          data,
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.size,
          cid: attachment.cid,
          type: attachment.type,
          durationMs: attachment.durationMs,
          sourceUrl: url,
        };
      }),
    );
    return result;
  } catch (error) {
    const reason = error instanceof AggregateError ? error.errors?.find(Boolean) : error;
    if (reason instanceof MediaError) throw reason;
    throw new MediaError(reason?.message || "Unable to download media.", "fetch", {
      cause: reason,
    });
  } finally {
    abortAll();
    signal?.removeEventListener("abort", abortAll);
  }
}
