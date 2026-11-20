import {
  openBlob,
  openParts,
  openSinglePart,
  createDecryptedPartsStream,
  RABTA_EVENT_ID_RE,
} from "./rabta/index.js";

import { base64ToBytes } from "./chatUtils.js";
import { readConfiguredRelays, DEFAULT_RELAYS } from "../config/servers.js";
import { fetchBlobBytes, sleepWithAbort } from "./blobFetch.js";
import { engineGetBlob, putVerifiedBlob } from "./engine/index.js";
import {
  clearEncCached,
  getDecCached,
  putDecCached,
  getEncCached,
  putEncCached,
  touchEncCached,
} from "./idb.js";

const SOURCE_PREF_KEY = "gupt_media_source_prefs";
const FETCH_TIMEOUT_MS = 10_000;
const PARALLEL_FETCH_LIMIT = 4;

export const MEDIA_RETRY_MAX_ATTEMPTS = 16;
export const MEDIA_RETRY_INITIAL_DELAY_MS = 2_000;
export const MEDIA_RETRY_BACKOFF_FACTOR = 2;
export const MEDIA_RETRY_MAX_DELAY_MS = 60_000;

export function mediaRetryDelayMs(
  attempt,
  {
    baseMs = MEDIA_RETRY_INITIAL_DELAY_MS,
    factor = MEDIA_RETRY_BACKOFF_FACTOR,
    maxMs = MEDIA_RETRY_MAX_DELAY_MS,
  } = {},
) {
  const exp = Math.max(0, Math.floor(attempt) - 1);
  return Math.min(maxMs, baseMs * factor ** Math.min(exp, 10));
}

export const MEDIA_PHASE = Object.freeze({
  IDLE: "idle",
  QUEUED: "queued",
  CACHED: "cached",
  FETCH: "fetch",
  DECRYPT: "decrypt",
  DONE: "done",
  FAILED: "failed",
});

export const SOURCE_STATUS = Object.freeze({
  PENDING: "pending",
  TRYING: "trying",
  OK: "ok",
  FAILED: "failed",
  SKIPPED: "skipped",
});

export class MediaDecryptError extends Error {
  constructor(message, kind = "unknown") {
    super(message);
    this.name = "MediaDecryptError";
    this.kind = kind;
  }
}

function readSourcePrefs() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SOURCE_PREF_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const SOURCE_PREF_MAX = 200;
const SOURCE_PREF_EVICT = 50;

function rememberSourcePreference(cacheKey, sourceId) {
  if (!cacheKey || !sourceId || typeof localStorage === "undefined") return;
  try {
    const prefs = readSourcePrefs();
    prefs[cacheKey] = sourceId;

    const keys = Object.keys(prefs);
    if (keys.length > SOURCE_PREF_MAX) {
      keys.slice(0, SOURCE_PREF_EVICT).forEach((k) => delete prefs[k]);
    }
    localStorage.setItem(SOURCE_PREF_KEY, JSON.stringify(prefs));
  } catch {}
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return String(url || "").slice(0, 48);
  }
}

function labelFromLocation(loc) {
  const server = String(loc?.server || "").trim();
  if (server) return server.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (loc?.url) return hostnameFromUrl(loc.url);
  const hash = loc?.hash;
  if (hash) return `Rabta · ${String(hash).slice(0, 10)}…`;
  return "Unknown";
}

function inferSourceType(loc, url = "") {
  const explicit = String(loc?.type || "")
    .trim()
    .toLowerCase();
  if (explicit) return explicit;
  return "rabta";
}

function buildSourceEntry(loc, url, overrides = {}) {
  const trimmedUrl = String(url || "").trim();
  const hash = String(loc?.hash || "").trim();
  const { cid, locations, ...cleanOverrides } = overrides;
  return {
    id: "",
    label: cleanOverrides.label || labelFromLocation({ ...loc, url: trimmedUrl }),
    type: cleanOverrides.type || inferSourceType(loc, trimmedUrl),
    url: trimmedUrl,
    hash,
    server: String(loc?.server || "").trim(),
    status: SOURCE_STATUS.PENDING,
    error: null,
    errorKind: null,
    ...cleanOverrides,
  };
}

export function resolveMediaSources(mediaOrMessage) {
  const type = String(mediaOrMessage?.type || "").trim();
  const media = mediaOrMessage?.media || {};

  const isKnownMedia =
    type === "media" ||
    type === "voice" ||
    type === "image" ||
    type === "video" ||
    type === "audio" ||
    type === "file" ||
    Boolean(mediaOrMessage?.media);
  if (!isKnownMedia) return [];

  const parts = (Array.isArray(media.parts) ? media.parts : [])
    .map((part) =>
      String(part || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  const hash = String(
    parts[0] || media.hash || media.sha256 || mediaOrMessage?.hash || mediaOrMessage?.sha256 || "",
  ).trim();
  if (!hash) return [];

  const fallbackUrl = String(media.url || "").trim();

  // The engine owns blob lookup: verified local cache first, then relays.
  return [
    buildSourceEntry({ hash }, fallbackUrl, {
      id: `engine:${hash}`,
      type: "engine",
      label: "Gupt engine",
      hash,
      server: "",
      parts,
      url: fallbackUrl,
    }),
  ];
}

export function createMediaProgress(sources = [], hash = "", { eventId = "", parts = [] } = {}) {
  const allParts =
    Array.isArray(parts) && parts.length
      ? parts
      : Array.isArray(sources[0]?.parts)
        ? sources[0].parts
        : [];
  return {
    phase: MEDIA_PHASE.IDLE,
    hash,
    eventId: String(eventId || "").trim(),
    parts: allParts.map((p) => String(p || "").trim()).filter(Boolean),
    loadedBytes: 0,
    totalBytes: 0,
    partsLoaded: 0,
    totalParts: allParts.length,
    percent: 0,
    sources: sources.map((source) => ({
      ...source,
      status: SOURCE_STATUS.PENDING,
      error: null,
      errorKind: null,
      attempt: 0,
      retries: null,
      nextRetryMs: null,
      loadedBytes: 0,
      totalBytes: 0,
    })),
    error: null,
    errorKind: null,
    winnerId: null,
    retry: null,
  };
}

function sortSourcesByPreference(sources, cacheKey) {
  const preferredId = readSourcePrefs()[cacheKey];
  if (!preferredId) return sources;
  const preferred = sources.find((source) => source.id === preferredId);
  if (!preferred) return sources;
  return [preferred, ...sources.filter((source) => source.id !== preferredId)];
}

function cloneProgress(progress) {
  return {
    ...progress,
    eventId: progress.eventId || "",
    parts: Array.isArray(progress.parts) ? [...progress.parts] : [],
    retry: progress.retry ? { ...progress.retry } : null,
    sources: progress.sources.map((source) => ({ ...source })),
    loadedBytes: progress.loadedBytes || 0,
    totalBytes: progress.totalBytes || 0,
    partsLoaded: progress.partsLoaded || 0,
    totalParts: progress.totalParts || 0,
    percent: progress.percent || 0,
  };
}

function emitProgress(onProgress, progress) {
  onProgress?.(cloneProgress(progress));
}

function markSource(progress, sourceId, patch) {
  const source = progress.sources.find((entry) => entry.id === sourceId);
  if (!source) return;
  Object.assign(source, patch);
}

function markRetry(progress, source, retry) {
  const nextRetryMs = Math.round(retry?.delayMs ?? 0);
  markSource(progress, source.id, {
    attempt: retry?.attempt ?? 0,
    retries: retry?.retries ?? null,
    nextRetryMs,
  });
  progress.retry = {
    sourceId: source.id,
    label: source.label,
    attempt: retry?.attempt ?? 0,
    retries: retry?.retries ?? null,
    nextRetryMs,
    at: Date.now(),
  };
}

function clearRetry(progress, sourceId) {
  const source = progress.sources.find((entry) => entry.id === sourceId);
  if (source) source.nextRetryMs = null;
  if (!progress.retry || (sourceId && progress.retry.sourceId !== sourceId)) return;
  progress.retry = null;
}

function finalizeFailure(progress, error, kind) {
  progress.phase = MEDIA_PHASE.FAILED;
  progress.error = error?.message || String(error || "Unable to decrypt media.");
  progress.errorKind = kind;
  // No automatic retry follows: let the UI show the failure and a restart button.
  progress.retry = null;
  for (const source of progress.sources || []) source.nextRetryMs = null;
}

async function fetchAndDecryptFromSources({
  sources,
  mediaKey,
  mediaNonce,
  mediaOrMessage,
  onProgress,
  progress,
  retry,
  onRetry,
}) {
  if (!sources.length) {
    throw new MediaDecryptError("No download sources available.", "fetch");
  }

  const maxAttempts = Math.max(
    1,
    Number(retry?.maxAttempts ?? retry?.retries ?? MEDIA_RETRY_MAX_ATTEMPTS),
  );
  const initialDelayMs = Number(
    retry?.initialDelayMs ?? retry?.minDelayMs ?? MEDIA_RETRY_INITIAL_DELAY_MS,
  );
  const backoffFactor = Number(retry?.factor ?? retry?.backoffFactor ?? MEDIA_RETRY_BACKOFF_FACTOR);
  const maxDelayMs = Number(retry?.maxDelayMs ?? MEDIA_RETRY_MAX_DELAY_MS);

  progress.phase = MEDIA_PHASE.FETCH;
  emitProgress(onProgress, progress);

  return new Promise((resolve, reject) => {
    let remaining = sources.length;
    let settled = false;
    const controllers = new Map();

    const settleFailure = () => {
      if (settled || remaining > 0) return;
      settled = true;
      finalizeFailure(
        progress,
        new MediaDecryptError("All download sources failed.", "fetch"),
        "fetch",
      );
      emitProgress(onProgress, progress);
      reject(new MediaDecryptError(progress.error, "fetch"));
    };

    const tryDecrypt = async (source, encrypted) => {
      if (settled) return;
      progress.phase = MEDIA_PHASE.DECRYPT;
      clearRetry(progress, source.id);
      markSource(progress, source.id, { status: SOURCE_STATUS.OK, error: null, errorKind: null });
      emitProgress(onProgress, progress);

      try {
        const encBytes = new Uint8Array(encrypted);
        let plain = openBlob(encBytes, mediaKey);
        const expectedSize = Number(mediaOrMessage?.media?.size || mediaOrMessage?.size || 0);
        if (expectedSize > 0 && expectedSize < plain.length) {
          plain = plain.subarray(0, expectedSize);
        }
        settled = true;
        progress.phase = MEDIA_PHASE.DONE;
        progress.percent = 100;
        progress.winnerId = source.id;
        for (const entry of progress.sources) {
          if (entry.id !== source.id && entry.status === SOURCE_STATUS.TRYING) {
            controllers.get(entry.id)?.abort();
            entry.status = SOURCE_STATUS.SKIPPED;
            entry.error = "Another source succeeded";
          }
        }
        emitProgress(onProgress, progress);
        resolve({ plain, source });
      } catch (decryptErr) {
        const encId = source.hash;
        await clearEncCached(encId ? `blob:${encId}` : source.url).catch(() => {});
        markSource(progress, source.id, {
          status: SOURCE_STATUS.FAILED,
          error: decryptErr instanceof MediaDecryptError ? decryptErr.message : "Decrypt failed",
          errorKind: decryptErr instanceof MediaDecryptError ? decryptErr.kind : "decrypt",
        });
        emitProgress(onProgress, progress);
        remaining -= 1;
        settleFailure();
      }
    };

    const tryDecryptParts = async (source, partsResult) => {
      if (settled) return;
      progress.phase = MEDIA_PHASE.DECRYPT;
      clearRetry(progress, source.id);
      markSource(progress, source.id, { status: SOURCE_STATUS.OK, error: null, errorKind: null });
      emitProgress(onProgress, progress);

      try {
        const expectedSize = Number(mediaOrMessage?.media?.size || mediaOrMessage?.size || 0);
        const { rawParts, decryptedChunks } = partsResult || {};
        let chunks = decryptedChunks;
        if (!chunks || chunks.some((c) => !c)) {
          const list = rawParts || (Array.isArray(partsResult) ? partsResult : []);
          chunks = list.map((part) => openSinglePart(part, mediaKey, mediaNonce));
        }

        let total = 0;
        for (const chunk of chunks) total += chunk.length;

        if (expectedSize > 0 && expectedSize < total) {
          let accumulated = 0;
          const trimmedChunks = [];
          for (const chunk of chunks) {
            if (accumulated >= expectedSize) break;
            const remaining = expectedSize - accumulated;
            if (chunk.length <= remaining) {
              trimmedChunks.push(chunk);
              accumulated += chunk.length;
            } else {
              trimmedChunks.push(chunk.subarray(0, remaining));
              accumulated += remaining;
              break;
            }
          }
          chunks = trimmedChunks;
          total = expectedSize;
        }

        const plain = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          plain.set(chunk, offset);
          offset += chunk.length;
        }

        settled = true;
        progress.phase = MEDIA_PHASE.DONE;
        progress.percent = 100;
        progress.winnerId = source.id;
        emitProgress(onProgress, progress);
        resolve({ plain, chunks, source });
      } catch (decryptErr) {
        for (const partHash of source.parts) {
          await clearEncCached(`blob:${partHash}`).catch(() => {});
        }
        markSource(progress, source.id, {
          status: SOURCE_STATUS.FAILED,
          error: decryptErr instanceof MediaDecryptError ? decryptErr.message : "Decrypt failed",
          errorKind: decryptErr instanceof MediaDecryptError ? decryptErr.kind : "decrypt",
        });
        emitProgress(onProgress, progress);
        remaining -= 1;
        settleFailure();
      }
    };

    /** Fetch every part of a split attachment: cache first, then the engine. Streams decryption per part. */
    const fetchSourceParts = async (source, controller) => {
      const rawParts = new Array(source.parts.length);
      const decryptedChunks = new Array(source.parts.length);
      let cursor = 0;
      let partsLoaded = 0;
      let totalDecryptedBytes = 0;
      const expectedSize = Number(mediaOrMessage?.media?.size || mediaOrMessage?.size || 0);

      const worker = async () => {
        while (cursor < source.parts.length && !controller.signal.aborted && !settled) {
          const index = cursor++;
          const partHash = source.parts[index];
          const encKey = `blob:${partHash}`;
          const cachedRow = await getEncCached(encKey).catch(() => null);
          let bytes = cachedRow?.buf ?? cachedRow ?? null;
          if (bytes) {
            void touchEncCached(encKey).catch(() => {});
          } else {
            const configured = readConfiguredRelays();
            bytes = await engineGetBlob(partHash, {
              relays: configured.length ? configured : DEFAULT_RELAYS,
              signal: controller.signal,
              onProgress: ({ receivedBytes }) => {
                const approxTotal = totalDecryptedBytes + receivedBytes;
                progress.loadedBytes = approxTotal;
                if (expectedSize > 0) {
                  progress.totalBytes = expectedSize;
                  progress.percent = Math.min(99, Math.round((approxTotal / expectedSize) * 100));
                }
                emitProgress(onProgress, progress);
              },
            }).catch(() => null);
            if (!bytes) {
              throw new MediaDecryptError(
                `Attachment part ${index + 1}/${source.parts.length} is not available yet.`,
                "fetch",
              );
            }
            await putEncCached(encKey, bytes).catch(() => {});
          }

          // Progressively decrypt single part container immediately
          const decrypted = openSinglePart(bytes, mediaKey, mediaNonce);
          decryptedChunks[index] = decrypted;
          rawParts[index] = bytes;

          partsLoaded += 1;
          totalDecryptedBytes += decrypted.byteLength;
          progress.partsLoaded = partsLoaded;
          progress.totalParts = source.parts.length;
          progress.loadedBytes = totalDecryptedBytes;
          if (expectedSize > 0) {
            progress.totalBytes = expectedSize;
            progress.percent = Math.min(
              100,
              Math.round((totalDecryptedBytes / expectedSize) * 100),
            );
          } else {
            progress.percent = Math.min(100, Math.round((partsLoaded / source.parts.length) * 100));
          }
          emitProgress(onProgress, progress);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(PARALLEL_FETCH_LIMIT, source.parts.length) }, worker),
      );
      return { rawParts, decryptedChunks };
    };

    const launch = async (source) => {
      const controller = new AbortController();
      controllers.set(source.id, controller);

      const encId = source.hash;
      const encKey = encId ? `blob:${encId}` : source.url;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (settled || controller.signal.aborted) return;

        markSource(progress, source.id, {
          status: SOURCE_STATUS.TRYING,
          attempt,
          retries: maxAttempts,
          error: null,
          errorKind: null,
        });
        progress.phase = MEDIA_PHASE.FETCH;
        emitProgress(onProgress, progress);

        try {
          if ((source.parts?.length || 0) > 1) {
            const partsResult = await fetchSourceParts(source, controller);
            await tryDecryptParts(source, partsResult);
            return;
          }

          const cachedRow = await getEncCached(encKey).catch(() => null);
          let encrypted = cachedRow?.buf ?? cachedRow ?? null;
          const expectedSize = Number(mediaOrMessage?.media?.size || mediaOrMessage?.size || 0);

          if (!encrypted && encId) {
            // Engine cache first; a relay miss is fetched and hash-verified here.
            const configured = readConfiguredRelays();
            encrypted = await engineGetBlob(encId, {
              relays: configured.length ? configured : DEFAULT_RELAYS,
              signal: controller.signal,
              onProgress: ({ receivedBytes }) => {
                progress.loadedBytes = receivedBytes;
                if (expectedSize > 0) {
                  progress.totalBytes = expectedSize;
                  progress.percent = Math.min(99, Math.round((receivedBytes / expectedSize) * 100));
                }
                emitProgress(onProgress, progress);
              },
            }).catch(() => null);
          }
          if (!encrypted && source.url) {
            encrypted = await fetchBlobBytes(source.url, {
              signal: controller.signal,
              timeoutMs: FETCH_TIMEOUT_MS,
              retries: 0,
              onProgress: ({ receivedBytes }) => {
                progress.loadedBytes = receivedBytes;
                if (expectedSize > 0) {
                  progress.totalBytes = expectedSize;
                  progress.percent = Math.min(99, Math.round((receivedBytes / expectedSize) * 100));
                }
                emitProgress(onProgress, progress);
              },
            });
            if (encId) {
              await putVerifiedBlob(encId, encrypted, { expiresAt: null }).catch(() => {});
            }
            await putEncCached(encKey, encrypted).catch(() => {});
          } else if (encrypted) {
            void touchEncCached(encKey).catch(() => {});
          }
          if (!encrypted) {
            throw new MediaDecryptError("Encrypted media is not available yet.", "fetch");
          }

          await tryDecrypt(source, encrypted);
          return;
        } catch (fetchErr) {
          if (controller.signal.aborted && settled) return;
          if (settled) return;
          if (controller.signal.aborted) {
            markSource(progress, source.id, {
              status: SOURCE_STATUS.SKIPPED,
              error: "Skipped",
              errorKind: null,
            });
            emitProgress(onProgress, progress);
            remaining -= 1;
            settleFailure();
            return;
          }

          // If this was a decryption error (not a fetch failure), do not retry fetch.
          if (fetchErr?.kind === "decrypt") {
            remaining -= 1;
            settleFailure();
            return;
          }

          if (attempt < maxAttempts) {
            const delayMs = mediaRetryDelayMs(attempt, {
              baseMs: initialDelayMs,
              factor: backoffFactor,
              maxMs: maxDelayMs,
            });
            markRetry(progress, source, {
              attempt,
              retries: maxAttempts,
              delayMs,
              error: fetchErr,
            });
            progress.phase = MEDIA_PHASE.FAILED;
            emitProgress(onProgress, progress);
            onRetry?.({
              attempt,
              retries: maxAttempts,
              delayMs,
              error: fetchErr,
              sourceId: source.id,
            });

            try {
              await sleepWithAbort(delayMs, controller.signal);
            } catch {
              if (controller.signal.aborted || settled) return;
            }
            continue;
          }

          // All attempts exhausted.
          clearRetry(progress, source.id);
          markSource(progress, source.id, {
            status: SOURCE_STATUS.FAILED,
            error: fetchErr?.message || "Download failed",
            errorKind: "fetch",
            attempt: maxAttempts,
            retries: maxAttempts,
            nextRetryMs: null,
          });
          emitProgress(onProgress, progress);
          remaining -= 1;
          settleFailure();
        }
      }
    };

    const queue = [...sources];
    let active = 0;

    const pump = () => {
      while (active < PARALLEL_FETCH_LIMIT && queue.length && !settled) {
        const source = queue.shift();
        active += 1;
        launch(source).finally(() => {
          active -= 1;
          pump();
        });
      }
    };

    pump();
  });
}

export async function decryptMediaAttachment({
  cacheKey,
  keyB64,
  nonceB64,
  mime = "application/octet-stream",
  mediaOrMessage,
  onProgress,
  retry,
  onRetry,
}) {
  const mediaKeyB64 = String(keyB64 || "").trim();
  const mediaNonceB64 = String(nonceB64 || "").trim();
  if (!mediaKeyB64) {
    throw new MediaDecryptError("Missing encryption key.", "decrypt");
  }

  const partHashes = (Array.isArray(mediaOrMessage?.media?.parts) ? mediaOrMessage.media.parts : [])
    .map((part) =>
      String(part || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  const blobHash = String(
    partHashes[0] || mediaOrMessage?.media?.hash || mediaOrMessage?.hash || "",
  ).trim();
  const eventId = String(
    mediaOrMessage?.eventId ||
      (RABTA_EVENT_ID_RE.test(mediaOrMessage?.wrapId) ? mediaOrMessage.wrapId : "") ||
      (RABTA_EVENT_ID_RE.test(mediaOrMessage?.id) ? mediaOrMessage.id : "") ||
      mediaOrMessage?.wrapId ||
      mediaOrMessage?.id ||
      "",
  ).trim();
  const sources = sortSourcesByPreference(resolveMediaSources(mediaOrMessage), cacheKey);
  const progress = createMediaProgress(sources, blobHash, { eventId, parts: partHashes });

  if (!blobHash || !sources.length) {
    finalizeFailure(
      progress,
      new MediaDecryptError("Missing encrypted media blob hash.", "fetch"),
      "fetch",
    );
    emitProgress(onProgress, progress);
    throw new MediaDecryptError(progress.error, "fetch");
  }

  const cached = await getDecCached(cacheKey).catch(() => null);
  if (cached?.buf) {
    progress.phase = MEDIA_PHASE.CACHED;
    progress.winnerId = "cache";
    emitProgress(onProgress, progress);
    return { plain: cached.buf, mime: cached.mime || mime, progress, fromCache: true };
  }

  const mediaKey = base64ToBytes(mediaKeyB64);
  const mediaNonce = mediaNonceB64 ? base64ToBytes(mediaNonceB64) : null;

  const encCacheKey = `blob:${blobHash}`;
  const encCached =
    partHashes.length > 1 ? null : await getEncCached(encCacheKey).catch(() => null);
  if (encCached?.buf) {
    const encrypted = new Uint8Array(encCached.buf);
    void touchEncCached(encCacheKey).catch(() => {});
    progress.phase = MEDIA_PHASE.DECRYPT;
    emitProgress(onProgress, progress);

    try {
      let plain = openBlob(encrypted, mediaKey);
      const expectedSize = Number(mediaOrMessage?.media?.size || mediaOrMessage?.size || 0);
      if (expectedSize > 0 && expectedSize < plain.length) {
        plain = plain.subarray(0, expectedSize);
      }
      await putDecCached(cacheKey, plain, mime).catch(() => {});
      const winningSource = sources[0];
      rememberSourcePreference(cacheKey, winningSource.id);
      progress.phase = MEDIA_PHASE.DONE;
      progress.percent = 100;
      progress.winnerId = winningSource.id;
      emitProgress(onProgress, progress);
      return { plain, mime, progress, fromCache: false, source: winningSource };
    } catch (err) {
      await clearEncCached(encCacheKey).catch(() => {});
      finalizeFailure(
        progress,
        new MediaDecryptError(err?.message || "Unable to decrypt media.", "decrypt"),
        "decrypt",
      );
      emitProgress(onProgress, progress);
      throw new MediaDecryptError(progress.error, "decrypt");
    }
  }

  const { plain, chunks, source } = await fetchAndDecryptFromSources({
    sources,
    mediaKey,
    mediaNonce,
    mediaOrMessage,
    onProgress,
    progress,
    retry,
    onRetry,
  });
  await putDecCached(cacheKey, plain, mime).catch(() => {});
  rememberSourcePreference(cacheKey, source.id);
  return { plain, chunks, mime, progress, fromCache: false, source };
}

/**
 * Create a ReadableStream of decrypted bytes for an attachment.
 * Streams chunks progressively without requiring the entire payload in contiguous memory.
 */
export function createDecryptedMediaStream(
  partBytesIterable,
  secretBytes,
  originalLength,
  nonceBytes,
) {
  return createDecryptedPartsStream(partBytesIterable, secretBytes, originalLength, nonceBytes);
}
