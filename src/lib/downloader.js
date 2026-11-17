// Completely redesigned Downloader module for Gupt
// Handles preflight chunk probing, concurrent fetch, progressive verification,
// AES-GCM container opening, IndexedDB caching, and safe device saving.

import { readConfiguredRelays, DEFAULT_RELAYS } from "../config/servers.js";
import { openSinglePart, openBlob, RABTA_EVENT_ID_RE } from "./rabta/index.js";
import { base64ToBytes } from "./chatUtils.js";
import { getDecCached, putDecCached, getEngineBlob, putEngineBlob } from "./idb.js";
import { sha256HexOfBytes } from "./engine/core.js";
import { globalMediaDownloadQueue } from "./mediaDownloadQueue.js";

export const DOWNLOAD_PHASE = Object.freeze({
  IDLE: "idle",
  QUEUED: "queued",
  CACHED: "cached",
  PROBING: "probing",
  DOWNLOADING: "downloading",
  DECRYPTING: "decrypting",
  READY: "ready",
  MISSING_PARTS: "missing_parts",
  FAILED: "failed",
});

export class DownloaderError extends Error {
  constructor(message, { code = "error", missingParts = [], availableParts = [] } = {}) {
    super(message);
    this.name = "DownloaderError";
    this.code = code;
    this.missingParts = missingParts;
    this.availableParts = availableParts;
  }
}

/**
 * Extracts target relays or falls back to configured defaults.
 */
export function getActiveRelays(customRelays = null) {
  if (Array.isArray(customRelays) && customRelays.length) {
    return customRelays.map((r) => String(r || "").replace(/\/+$/, "")).filter(Boolean);
  }
  const configured = readConfiguredRelays();
  const list = configured.length ? configured : DEFAULT_RELAYS;
  return list.map((r) => String(r || "").replace(/\/+$/, "")).filter(Boolean);
}

/**
 * Fast parallel HEAD probe across relays to verify chunk availability
 * before initiating expensive or doomed full downloads.
 */
export async function probePartsAvailability(parts, { relays = null, timeoutMs = 4000 } = {}) {
  const targetRelays = getActiveRelays(relays);
  const partList = (Array.isArray(parts) ? parts : [parts])
    .map((p) => String(p || "").trim().toLowerCase())
    .filter(Boolean);

  if (!partList.length) {
    return {
      allAvailable: false,
      total: 0,
      availableCount: 0,
      missingCount: 0,
      parts: [],
    };
  }

  const results = await Promise.all(
    partList.map(async (hash, index) => {
      // 1. Check local engine IndexedDB first
      const cached = await getEngineBlob(hash).catch(() => null);
      if (cached && cached.byteLength > 0) {
        return {
          index,
          hash,
          status: "cached",
          size: cached.byteLength,
          relay: "local",
        };
      }

      // 2. Probe remote relays in parallel
      const probePromises = targetRelays.map(async (relay) => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(`${relay}/api/v1/blobs/${hash}`, {
            method: "HEAD",
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.ok) {
            const size = Number(res.headers.get("Content-Length")) || 0;
            return { ok: true, relay, size };
          }
        } catch {}
        return { ok: false, relay, size: 0 };
      });

      const relayOutcomes = await Promise.all(probePromises);
      const match = relayOutcomes.find((o) => o.ok);

      if (match) {
        return {
          index,
          hash,
          status: "available",
          size: match.size,
          relay: match.relay,
        };
      }

      return {
        index,
        hash,
        status: "missing",
        size: 0,
        relay: null,
      };
    }),
  );

  const availableCount = results.filter((r) => r.status === "available" || r.status === "cached").length;
  const missingCount = results.filter((r) => r.status === "missing").length;

  return {
    allAvailable: missingCount === 0,
    total: partList.length,
    availableCount,
    missingCount,
    parts: results,
  };
}

/**
 * Fetch a single container chunk with relay failover and SHA-256 verification.
 */
export async function fetchBlobChunk(hash, { relays = null, signal = null, onProgress = null } = {}) {
  const key = String(hash || "").trim().toLowerCase();
  if (!key) throw new DownloaderError("Empty blob hash");

  // Check local engine cache
  const cached = await getEngineBlob(key).catch(() => null);
  if (cached && cached.byteLength > 0) {
    const actual = await sha256HexOfBytes(cached);
    if (actual === key) {
      onProgress?.({ receivedBytes: cached.byteLength, totalBytes: cached.byteLength });
      return cached;
    }
  }

  const targetRelays = getActiveRelays(relays);
  let lastError = null;

  for (const relay of targetRelays) {
    if (signal?.aborted) throw new DOMException("Download aborted", "AbortError");
    try {
      const res = await fetch(`${relay}/api/v1/blobs/${key}`, { signal });
      if (!res.ok) {
        if (res.status === 404) continue;
        throw new Error(`HTTP ${res.status}`);
      }

      const totalExpected = Number(res.headers.get("Content-Length")) || 0;
      let bodyBytes;

      if (res.body && typeof res.body.getReader === "function") {
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              chunks.push(value);
              received += value.byteLength;
              onProgress?.({ receivedBytes: received, totalBytes: totalExpected || received });
            }
          }
        } finally {
          reader.releaseLock?.();
        }
        bodyBytes = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) {
          bodyBytes.set(c, offset);
          offset += c.byteLength;
        }
      } else {
        const buf = await res.arrayBuffer();
        bodyBytes = new Uint8Array(buf);
        onProgress?.({ receivedBytes: bodyBytes.byteLength, totalBytes: bodyBytes.byteLength });
      }

      // Verify SHA-256 integrity
      const actualSha = await sha256HexOfBytes(bodyBytes);
      if (actualSha !== key) {
        throw new Error(`Integrity check failed: expected ${key}, got ${actualSha}`);
      }

      // Store in engine IndexedDB for subsequent reads
      await putEngineBlob(key, bodyBytes).catch(() => {});
      return bodyBytes;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }

  throw lastError || new DownloaderError(`Blob ${key.slice(0, 12)}… not found on relays`, { code: "not_found" });
}

/**
 * Decrypts individual container parts and stitches them into full plaintext.
 */
export function decryptContainerChunks(chunks, secretKey, originalSize = 0) {
  const decryptedChunks = chunks.map((chunk) => openSinglePart(chunk, secretKey));
  let totalLength = 0;
  for (const c of decryptedChunks) totalLength += c.length;

  const plain = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of decryptedChunks) {
    plain.set(c, offset);
    offset += c.length;
  }

  if (typeof originalSize === "number" && originalSize > 0 && originalSize < plain.length) {
    return plain.subarray(0, originalSize);
  }
  return plain;
}

/**
 * Normalizes message/media object to clean downloader parameters.
 */
export function parseMediaDescriptor(messageOrMedia) {
  if (!messageOrMedia) return null;
  const media = messageOrMedia.media || messageOrMedia;

  const parts = (Array.isArray(media.parts) ? media.parts : [])
    .map((p) => String(p || "").trim().toLowerCase())
    .filter(Boolean);

  const fallbackHash = String(
    media.hash || media.sha256 || messageOrMedia.hash || messageOrMedia.sha256 || "",
  ).trim().toLowerCase();

  const allParts = parts.length ? parts : (fallbackHash ? [fallbackHash] : []);

  const rawKey = media.key || messageOrMedia.key || media.mediaKey || messageOrMedia.mediaKey || "";
  let keyBytes = null;
  if (rawKey) {
    try {
      keyBytes = rawKey instanceof Uint8Array ? rawKey : base64ToBytes(rawKey);
    } catch {}
  }

  const rawNonce = media.nonce || messageOrMedia.nonce || "";
  let nonceBytes = null;
  if (rawNonce) {
    try {
      nonceBytes = rawNonce instanceof Uint8Array ? rawNonce : base64ToBytes(rawNonce);
    } catch {}
  }

  const id = String(messageOrMedia.id || messageOrMedia.eventId || allParts[0] || "").trim();
  const name = String(media.name || messageOrMedia.name || "attachment").trim();
  const mime = String(media.mime || messageOrMedia.mime || "application/octet-stream").trim();
  const size = Number(media.size || messageOrMedia.size || 0);

  return {
    id,
    parts: allParts,
    keyBytes,
    nonceBytes,
    name,
    mime,
    size,
    eventId: String(messageOrMedia.eventId || messageOrMedia.wrapId || "").trim(),
  };
}

/**
 * Triggers safe device saving:
 * Uses Web Share API on iOS, standard anchor click elsewhere.
 */
export async function saveToDevice(blob, fileName = "attachment", mimeType = "application/octet-stream") {
  const isIos = typeof navigator !== "undefined" && (
    /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent || ""))
  );

  let file;
  try {
    file = new File([blob], fileName, { type: blob.type || mimeType });
  } catch {
    file = { name: fileName, type: blob.type || mimeType };
  }

  if (isIos && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (err) {
      if (err?.name === "AbortError") return true;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 500);

  return true;
}

/**
 * Master Downloader runner:
 * Manages probing, queueing, downloading, decryption, and state dispatch.
 */
export async function runDownloader(messageOrMedia, { onProgress = null, priority = false } = {}) {
  const desc = parseMediaDescriptor(messageOrMedia);
  if (!desc || !desc.parts.length || !desc.keyBytes) {
    const err = new DownloaderError("Invalid media parameters or missing decryption key", { code: "invalid_params" });
    onProgress?.({
      phase: DOWNLOAD_PHASE.FAILED,
      percent: 0,
      error: err.message,
      partsTotal: 0,
      partsLoaded: 0,
      parts: [],
    });
    throw err;
  }

  // 1. Fast IDB Cache Check
  const cachedDec = await getDecCached(desc.id).catch(() => null);
  if (cachedDec?.buf) {
    const blob = new Blob([cachedDec.buf], { type: cachedDec.mime || desc.mime });
    const blobUrl = URL.createObjectURL(blob);
    const state = {
      phase: DOWNLOAD_PHASE.READY,
      percent: 100,
      loadedBytes: cachedDec.buf.byteLength,
      totalBytes: cachedDec.buf.byteLength,
      partsTotal: desc.parts.length,
      partsLoaded: desc.parts.length,
      parts: desc.parts.map((hash, index) => ({ index, hash, status: "done", percent: 100 })),
      blobUrl,
      blob,
      plain: cachedDec.buf,
      mime: cachedDec.mime || desc.mime,
      fileName: desc.name,
      error: null,
    };
    onProgress?.(state);
    return state;
  }

  // 2. Preflight Probe
  onProgress?.({
    phase: DOWNLOAD_PHASE.PROBING,
    percent: 5,
    loadedBytes: 0,
    totalBytes: desc.size,
    partsTotal: desc.parts.length,
    partsLoaded: 0,
    parts: desc.parts.map((hash, index) => ({ index, hash, status: "probing", percent: 0 })),
    error: null,
  });

  const probe = await probePartsAvailability(desc.parts);

  if (!probe.allAvailable) {
    const missingIndices = probe.parts.filter((p) => p.status === "missing").map((p) => p.index + 1);
    const availableIndices = probe.parts.filter((p) => p.status !== "missing").map((p) => p.index + 1);
    const err = new DownloaderError(
      `${probe.availableCount} of ${probe.total} parts reached relay (${probe.missingCount} missing - sender upload incomplete)`,
      {
        code: "incomplete_upload",
        missingParts: missingIndices,
        availableParts: availableIndices,
      },
    );

    const missingState = {
      phase: DOWNLOAD_PHASE.MISSING_PARTS,
      percent: Math.round((probe.availableCount / probe.total) * 100),
      loadedBytes: 0,
      totalBytes: desc.size,
      partsTotal: desc.total,
      partsLoaded: probe.availableCount,
      parts: probe.parts.map((p) => ({
        index: p.index,
        hash: p.hash,
        status: p.status === "missing" ? "missing" : "done",
        percent: p.status === "missing" ? 0 : 100,
        size: p.size,
      })),
      error: err.message,
      missingCount: probe.missingCount,
      availableCount: probe.availableCount,
    };
    onProgress?.(missingState);
    throw err;
  }

  // 3. Enqueue in Global Download Queue (Max 3 concurrent)
  return globalMediaDownloadQueue.enqueue(
    desc.id,
    async () => {
      const partStatus = desc.parts.map((hash, index) => ({
        index,
        hash,
        status: "pending",
        percent: 0,
        loadedBytes: 0,
      }));

      let totalDownloadedBytes = 0;

      const emitDownloadProgress = (phase = DOWNLOAD_PHASE.DOWNLOADING) => {
        const partsLoaded = partStatus.filter((p) => p.status === "done").length;
        const sumBytes = partStatus.reduce((acc, p) => acc + (p.loadedBytes || 0), 0);
        const percent = desc.size > 0
          ? Math.min(99, Math.round((sumBytes / desc.size) * 100))
          : Math.min(99, Math.round((partsLoaded / desc.parts.length) * 100));

        onProgress?.({
          phase,
          percent,
          loadedBytes: sumBytes,
          totalBytes: desc.size || sumBytes,
          partsTotal: desc.parts.length,
          partsLoaded,
          parts: [...partStatus],
          error: null,
        });
      };

      emitDownloadProgress(DOWNLOAD_PHASE.DOWNLOADING);

      // Fetch chunks concurrently (max 4 parallel chunk requests per item)
      const chunkBuffers = new Array(desc.parts.length);
      const concurrency = Math.min(4, desc.parts.length);
      let cursor = 0;

      const worker = async () => {
        while (cursor < desc.parts.length) {
          const idx = cursor++;
          const hash = desc.parts[idx];
          partStatus[idx].status = "downloading";
          emitDownloadProgress();

          const chunk = await fetchBlobChunk(hash, {
            onProgress: ({ receivedBytes, totalBytes }) => {
              partStatus[idx].loadedBytes = receivedBytes;
              partStatus[idx].percent = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 50;
              emitDownloadProgress();
            },
          });

          chunkBuffers[idx] = chunk;
          partStatus[idx].status = "done";
          partStatus[idx].percent = 100;
          emitDownloadProgress();
        }
      };

      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);

      // 4. Decrypting & Stitching
      onProgress?.({
        phase: DOWNLOAD_PHASE.DECRYPTING,
        percent: 99,
        loadedBytes: desc.size,
        totalBytes: desc.size,
        partsTotal: desc.parts.length,
        partsLoaded: desc.parts.length,
        parts: partStatus.map((p) => ({ ...p, status: "done", percent: 100 })),
        error: null,
      });

      let plain;
      if (desc.parts.length === 1) {
        plain = openBlob(chunkBuffers[0], desc.keyBytes, desc.size);
      } else {
        plain = decryptContainerChunks(chunkBuffers, desc.keyBytes, desc.size);
      }

      // 5. Cache Decrypted File
      await putDecCached(desc.id, { buf: plain, mime: desc.mime }).catch(() => {});

      const blob = new Blob([plain], { type: desc.mime });
      const blobUrl = URL.createObjectURL(blob);

      const finalState = {
        phase: DOWNLOAD_PHASE.READY,
        percent: 100,
        loadedBytes: plain.byteLength,
        totalBytes: plain.byteLength,
        partsTotal: desc.parts.length,
        partsLoaded: desc.parts.length,
        parts: partStatus.map((p) => ({ ...p, status: "done", percent: 100 })),
        blobUrl,
        blob,
        plain,
        mime: desc.mime,
        fileName: desc.name,
        error: null,
      };

      onProgress?.(finalState);
      return finalState;
    },
    {
      priority,
      onQueued: () => {
        onProgress?.({
          phase: DOWNLOAD_PHASE.QUEUED,
          percent: 5,
          loadedBytes: 0,
          totalBytes: desc.size,
          partsTotal: desc.parts.length,
          partsLoaded: 0,
          parts: desc.parts.map((hash, index) => ({ index, hash, status: "pending", percent: 0 })),
          error: null,
        });
      },
    },
  );
}
