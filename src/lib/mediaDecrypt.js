import { gcm } from "@noble/ciphers/aes.js";

import { base64ToBytes } from "@/lib/chatUtils";
import { clearEncCached, fetchEncCached, getDecCached, putDecCached } from "@/lib/idb";
const SOURCE_PREF_KEY = "gupt_media_source_prefs";
const FETCH_TIMEOUT_MS = 15_000;
const PARALLEL_FETCH_LIMIT = 4;

export const MEDIA_PHASE = Object.freeze({
  IDLE: "idle",
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

function rememberSourcePreference(cacheKey, sourceId) {
  if (!cacheKey || !sourceId || typeof localStorage === "undefined") return;
  try {
    const prefs = readSourcePrefs();
    prefs[cacheKey] = sourceId;
    localStorage.setItem(SOURCE_PREF_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota errors.
  }
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
  if (loc?.cid) return `IPFS · ${String(loc.cid).slice(0, 10)}…`;
  return "Unknown";
}

function inferSourceType(loc, url = "") {
  const explicit = String(loc?.type || "")
    .trim()
    .toLowerCase();
  if (explicit) return explicit;
  if (String(url).includes("/ipfs/")) return "ipfs";
  return "originless";
}

function buildSourceEntry(loc, url, overrides = {}) {
  const trimmedUrl = String(url || "").trim();
  return {
    id: "",
    label: overrides.label || labelFromLocation({ ...loc, url: trimmedUrl }),
    type: overrides.type || inferSourceType(loc, trimmedUrl),
    url: trimmedUrl,
    cid: String(loc?.cid || "").trim(),
    server: String(loc?.server || "").trim(),
    status: SOURCE_STATUS.PENDING,
    error: null,
    errorKind: null,
    ...overrides,
  };
}

export function resolveMediaSources(mediaOrMessage) {
  const type = String(mediaOrMessage?.type || "").trim();
  const media = mediaOrMessage?.media || {};
  
  if (type === "media" && media.cid) {
    return [
      buildSourceEntry(
        { cid: media.cid, server: media.server },
        `ipfs://${media.cid}`,
        {
          id: "0",
          label: `IPFS · ${String(media.cid).slice(0, 10)}…`,
          type: "ipfs",
          server: "helia",
        }
      )
    ];
  }

  if (type === "media-legacy" && media.url) {
    return [
      buildSourceEntry(
        { url: media.url, server: media.server },
        media.url,
        {
          id: "0",
          label: hostnameFromUrl(media.url),
          type: "blossom",
          server: hostnameFromUrl(media.url),
        }
      )
    ];
  }
  
  // Fallback for unexpected shapes (shouldn't happen with new architecture)
  return [];
}

export function resolveMediaUrls(mediaOrMessage) {
  return resolveMediaSources(mediaOrMessage).map((source) => source.url);
}

export function createMediaProgress(sources = []) {
  return {
    phase: MEDIA_PHASE.IDLE,
    sources: sources.map((source) => ({
      ...source,
      status: SOURCE_STATUS.PENDING,
      error: null,
      errorKind: null,
    })),
    error: null,
    errorKind: null,
    winnerId: null,
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
    sources: progress.sources.map((source) => ({ ...source })),
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

function finalizeFailure(progress, error, kind) {
  progress.phase = MEDIA_PHASE.FAILED;
  progress.error = error?.message || String(error || "Unable to decrypt media.");
  progress.errorKind = kind;
}

async function fetchAndDecryptFromSources({ sources, mediaKey, mediaNonce, onProgress, progress }) {
  if (!sources.length) {
    throw new MediaDecryptError("No download sources available.", "fetch");
  }

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
      markSource(progress, source.id, { status: SOURCE_STATUS.OK, error: null, errorKind: null });
      emitProgress(onProgress, progress);

      try {
        const plain = gcm(mediaKey, mediaNonce).decrypt(new Uint8Array(encrypted));
        settled = true;
        progress.phase = MEDIA_PHASE.DONE;
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
        markSource(progress, source.id, {
          status: SOURCE_STATUS.FAILED,
          error: "Decrypt failed",
          errorKind: "decrypt",
        });
        emitProgress(onProgress, progress);
        remaining -= 1;
        settleFailure();
      }
    };

    const launch = async (source) => {
      const controller = new AbortController();
      controllers.set(source.id, controller);
      markSource(progress, source.id, {
        status: SOURCE_STATUS.TRYING,
        error: null,
        errorKind: null,
      });
      emitProgress(onProgress, progress);

      try {
        const encrypted = await fetchEncCached(source.url, {
          signal: controller.signal,
          timeoutMs: FETCH_TIMEOUT_MS,
        });
        await tryDecrypt(source, encrypted);
      } catch (fetchErr) {
        if (controller.signal.aborted && settled) return;
        const aborted = controller.signal.aborted;
        if (!aborted) await clearEncCached(source.url).catch(() => {});
        markSource(progress, source.id, {
          status: aborted ? SOURCE_STATUS.SKIPPED : SOURCE_STATUS.FAILED,
          error: aborted ? "Skipped" : fetchErr?.message || "Download failed",
          errorKind: aborted ? null : "fetch",
        });
        emitProgress(onProgress, progress);
        remaining -= 1;
        settleFailure();
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

/**
 * Download encrypted bytes from redundant sources (parallel, first decrypt wins),
 * then cache and return plaintext.
 */
export async function decryptMediaAttachment({
  cacheKey,
  keyB64,
  nonceB64,
  mime = "application/octet-stream",
  mediaOrMessage,
  locations, // legacy – ignored when mediaOrMessage is provided
  onProgress,
}) {
  const mediaKeyB64 = String(keyB64 || "").trim();
  const mediaNonceB64 = String(nonceB64 || "").trim();
  if (!mediaKeyB64 || !mediaNonceB64) {
    throw new MediaDecryptError("Missing encryption key or nonce.", "decrypt");
  }

  // Resolve download sources from the full message (preferred) or fall back to
  // the legacy `locations` array for older callers.
  const sources = sortSourcesByPreference(
    resolveMediaSources(mediaOrMessage || { locations }),
    cacheKey,
  );
  const progress = createMediaProgress(sources);

  if (!sources.length) {
    finalizeFailure(
      progress,
      new MediaDecryptError("Missing encrypted media location.", "fetch"),
      "fetch",
    );
    emitProgress(onProgress, progress);
    throw new MediaDecryptError(progress.error, "fetch");
  }

  const cached = await getDecCached(cacheKey);
  if (cached?.buf) {
    progress.phase = MEDIA_PHASE.CACHED;
    progress.winnerId = "cache";
    emitProgress(onProgress, progress);
    return { plain: cached.buf, mime: cached.mime || mime, progress, fromCache: true };
  }

  const mediaKey = base64ToBytes(mediaKeyB64);
  const mediaNonce = base64ToBytes(mediaNonceB64);

  try {
    const { plain, source } = await fetchAndDecryptFromSources({
      sources: progress.sources,
      mediaKey,
      mediaNonce,
      onProgress,
      progress,
    });

    await putDecCached(cacheKey, plain, mime);
    rememberSourcePreference(cacheKey, source.id);
    progress.phase = MEDIA_PHASE.DONE;
    emitProgress(onProgress, progress);
    return { plain, mime, progress, fromCache: false, source };
  } catch (err) {
    if (progress.phase !== MEDIA_PHASE.FAILED) {
      finalizeFailure(progress, err, err instanceof MediaDecryptError ? err.kind : "unknown");
      emitProgress(onProgress, progress);
    }
    throw err instanceof MediaDecryptError
      ? err
      : new MediaDecryptError(err?.message || "Unable to decrypt media.", "unknown");
  }
}

export function progressSummary(progress) {
  if (!progress) return "";
  if (progress.phase === MEDIA_PHASE.CACHED) return "Loaded from cache";
  if (progress.phase === MEDIA_PHASE.DECRYPT) {
    const winner = progress.sources.find((source) => source.status === SOURCE_STATUS.OK);
    return winner ? `Decrypting from ${winner.label}…` : "Decrypting…";
  }
  if (progress.phase === MEDIA_PHASE.FETCH) {
    const trying = progress.sources.filter((source) => source.status === SOURCE_STATUS.TRYING);
    if (!trying.length) return "Downloading…";
    if (trying.length === 1) return `Downloading from ${trying[0].label}…`;
    return `Downloading from ${trying.length} servers…`;
  }
  if (progress.phase === MEDIA_PHASE.FAILED) {
    return progress.errorKind === "decrypt"
      ? "Decrypt failed on all sources"
      : "All download sources failed";
  }
  if (progress.phase === MEDIA_PHASE.DONE) {
    const winner = progress.sources.find((source) => source.id === progress.winnerId);
    return winner ? `Ready via ${winner.label}` : "Ready";
  }
  return "";
}
