import { gcm } from "@noble/ciphers/aes.js";

import { base64ToBytes } from "@/lib/chatUtils";
import { clearEncCached, fetchEncCached, getDecCached, putDecCached } from "@/lib/idb";

/**
 * @typedef {{ key: string, nonce: string, mime: string, name: string, size: number, cid: string, fallback: string }} MediaAttachment
 *
 * @typedef {{ type: "media", text: string, media: MediaAttachment }} MediaMessage
 * @typedef {{ type: "voice", text: string, media: MediaAttachment }} VoiceMessage
 */
const SOURCE_PREF_KEY = "gupt_media_source_prefs";
const FETCH_TIMEOUT_MS = 15_000;
const PARALLEL_FETCH_LIMIT = 4;

/** Exponential-backoff retry config for transient fetch failures. */
const RETRY_MAX_ATTEMPTS = 16; // total tries per source
const RETRY_INITIAL_DELAY_MS = 3_000; // 3 s
const RETRY_BACKOFF_MULTIPLIER = 2;
const RETRY_MAX_DELAY_MS = 60_000; // cap at 60 s

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

/** Maximum number of source-preference entries kept in localStorage. */
const SOURCE_PREF_MAX = 200;
/** Number of oldest entries to evict when the cap is exceeded. */
const SOURCE_PREF_EVICT = 50;

function rememberSourcePreference(cacheKey, sourceId) {
  if (!cacheKey || !sourceId || typeof localStorage === "undefined") return;
  try {
    const prefs = readSourcePrefs();
    prefs[cacheKey] = sourceId;
    // Evict oldest entries if the map is getting too large.
    const keys = Object.keys(prefs);
    if (keys.length > SOURCE_PREF_MAX) {
      keys.slice(0, SOURCE_PREF_EVICT).forEach((k) => delete prefs[k]);
    }
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

  if (type !== "media" && type !== "voice") return [];

  const sources = [];

  // WebRTC direct push source
  if (media.webrtc && media.webrtc.msgId && media.webrtc.sha256) {
    sources.push(
      buildSourceEntry({}, `webrtc://${media.webrtc.msgId}`, {
        id: "0",
        label: `Direct Transfer`,
        type: "webrtc",
        server: "peer",
        webrtc: media.webrtc,
      }),
    );
  }

  // IPFS / originless source
  if (media.cid) {
    sources.push(
      buildSourceEntry({ cid: media.cid }, `ipfs://${media.cid}`, {
        id: "1",
        label: `IPFS · ${String(media.cid).slice(0, 10)}…`,
        type: "ipfs",
        server: "helia",
      }),
    );
  }

  return sources;
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
          error: decryptErr instanceof MediaDecryptError ? decryptErr.message : "Decrypt failed",
          errorKind: decryptErr instanceof MediaDecryptError ? decryptErr.kind : "decrypt",
        });
        emitProgress(onProgress, progress);
        remaining -= 1;
        settleFailure();
      }
    };

    /**
     * Sleep for `ms` milliseconds, but resolve early if the source's
     * AbortController is triggered (i.e. another source already won).
     */
    const retrySleep = (sourceId, ms) =>
      new Promise((resolve) => {
        const ctrl = controllers.get(sourceId);
        if (ctrl?.signal.aborted) {
          resolve();
          return;
        }
        const id = setTimeout(resolve, ms);
        ctrl?.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(id);
            resolve();
          },
          { once: true },
        );
      });

    const launch = async (source) => {
      const controller = new AbortController();
      controllers.set(source.id, controller);
      markSource(progress, source.id, {
        status: SOURCE_STATUS.TRYING,
        error: null,
        errorKind: null,
      });
      emitProgress(onProgress, progress);

      let attempt = 0;
      let delayMs = RETRY_INITIAL_DELAY_MS;

      while (attempt < RETRY_MAX_ATTEMPTS) {
        // Stop retrying if the overall race has already been won or aborted.
        if (settled || controller.signal.aborted) return;

        try {
          let encrypted;
          if (source.type === "webrtc") {
            const webrtcTransfer = await import("@/lib/relay/webrtcTransfer");
            const blob = await webrtcTransfer.waitForWebrtcBlob(
              source.webrtc.msgId,
              10000,
              controller.signal,
            );
            encrypted = await blob.arrayBuffer();
          } else {
            encrypted = await fetchEncCached(source.url, {
              signal: controller.signal,
              timeoutMs: FETCH_TIMEOUT_MS,
            });
          }
          // Fetch succeeded — hand off to decrypt (no retry needed).
          await tryDecrypt(source, encrypted);
          return;
        } catch (fetchErr) {
          // If another source won (settled) or we were explicitly aborted, exit silently.
          if (controller.signal.aborted && settled) return;
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

          attempt += 1;
          // Clear any stale cached response so the next attempt fetches fresh.
          await clearEncCached(source.url).catch(() => {});

          if (attempt >= RETRY_MAX_ATTEMPTS) {
            // All retries exhausted — mark as permanently failed.
            markSource(progress, source.id, {
              status: SOURCE_STATUS.FAILED,
              error: fetchErr?.message || "Download failed",
              errorKind: "fetch",
            });
            emitProgress(onProgress, progress);
            remaining -= 1;
            settleFailure();
            return;
          }

          // Transient failure — update status with retry info and wait.
          markSource(progress, source.id, {
            status: SOURCE_STATUS.TRYING,
            error: `Retrying (${attempt}/${RETRY_MAX_ATTEMPTS - 1})… ${fetchErr?.message || ""}`,
            errorKind: null,
          });
          emitProgress(onProgress, progress);

          await retrySleep(source.id, delayMs);
          delayMs = Math.min(delayMs * RETRY_BACKOFF_MULTIPLIER, RETRY_MAX_DELAY_MS);
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
  onProgress,
}) {
  const mediaKeyB64 = String(keyB64 || "").trim();
  const mediaNonceB64 = String(nonceB64 || "").trim();
  if (!mediaKeyB64 || !mediaNonceB64) {
    throw new MediaDecryptError("Missing encryption key or nonce.", "decrypt");
  }

  const sources = sortSourcesByPreference(resolveMediaSources(mediaOrMessage), cacheKey);

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
