import { gcm } from "@noble/ciphers/aes.js";

import { base64ToBytes } from "@/lib/chatUtils";
import { readConfiguredIpfsGateways } from "@/config/servers";
import { fetchGatewayBytes, gatewayUrlFor } from "@/lib/gatewayFetch";
import {
  clearEncCached,
  getDecCached,
  putDecCached,
  getEncCached,
  putEncCached,
  touchEncCached,
} from "@/lib/idb";

const SOURCE_PREF_KEY = "gupt_media_source_prefs";
const FETCH_TIMEOUT_MS = 10_000;
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
  const cid = loc?.cid;
  if (cid) return `CID · ${String(cid).slice(0, 10)}…`;
  return "Unknown";
}

function inferSourceType(loc, url = "") {
  const explicit = String(loc?.type || "")
    .trim()
    .toLowerCase();
  if (explicit) return explicit;
  return "originless";
}

function buildSourceEntry(loc, url, overrides = {}) {
  const trimmedUrl = String(url || "").trim();
  const cid = String(loc?.cid || "").trim();
  return {
    id: "",
    label: overrides.label || labelFromLocation({ ...loc, url: trimmedUrl }),
    type: overrides.type || inferSourceType(loc, trimmedUrl),
    url: trimmedUrl,
    cid,
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

  const cid = String(media.cid || mediaOrMessage?.cid || "").trim();
  if (!cid) return [];

  return readConfiguredIpfsGateways()
    .map((gateway) => {
      const url = gatewayUrlFor(gateway, cid);
      if (!url) return null;
      return buildSourceEntry({ cid, server: gateway }, url, {
        id: `gateway:${gateway}#${cid}`,
        type: "gateway",
        cid,
        server: gateway,
      });
    })
    .filter(Boolean);
}

export function resolveMediaUrls(mediaOrMessage) {
  return resolveMediaSources(mediaOrMessage).map((source) => source.url);
}

export function createMediaProgress(sources = [], cid = "") {
  return {
    phase: MEDIA_PHASE.IDLE,
    cid,
    sources: sources.map((source) => ({
      ...source,
      status: SOURCE_STATUS.PENDING,
      error: null,
      errorKind: null,
      attempt: 0,
      retries: null,
      nextRetryMs: null,
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
    retry: progress.retry ? { ...progress.retry } : null,
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
}

async function fetchAndDecryptFromSources({
  sources,
  mediaKey,
  mediaNonce,
  onProgress,
  progress,
  retry,
  onRetry,
}) {
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
      clearRetry(progress, source.id);
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
        await clearEncCached(source.cid ? `cid:${source.cid}` : source.url).catch(() => {});
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

    const launch = async (source) => {
      const controller = new AbortController();
      controllers.set(source.id, controller);
      markSource(progress, source.id, {
        status: SOURCE_STATUS.TRYING,
        error: null,
        errorKind: null,
      });
      emitProgress(onProgress, progress);

      const encKey = source.cid ? `cid:${source.cid}` : source.url;

      try {
        const cachedRow = await getEncCached(encKey);
        let encrypted = cachedRow?.buf ?? cachedRow ?? null;
        if (!encrypted) {
          encrypted = await fetchGatewayBytes(source.url, {
            signal: controller.signal,
            timeoutMs: FETCH_TIMEOUT_MS,
            ...(retry || {}),
            onRetry: (retryInfo) => {
              if (settled || controller.signal.aborted) return;
              markRetry(progress, source, retryInfo);
              emitProgress(onProgress, progress);
              onRetry?.({ ...retryInfo, sourceId: source.id });
            },
          });
          await putEncCached(encKey, encrypted);
        } else {
          void touchEncCached(encKey);
        }

        await tryDecrypt(source, encrypted);
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

        markSource(progress, source.id, {
          status: SOURCE_STATUS.FAILED,
          error: fetchErr?.message || "Download failed",
          errorKind: "fetch",
          nextRetryMs: null,
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
  if (!mediaKeyB64 || !mediaNonceB64) {
    throw new MediaDecryptError("Missing encryption key or nonce.", "decrypt");
  }

  const cid = String(mediaOrMessage?.media?.cid || mediaOrMessage?.cid || "").trim();
  const sources = sortSourcesByPreference(resolveMediaSources(mediaOrMessage), cacheKey);
  const progress = createMediaProgress(sources, cid);

  if (!cid || !sources.length) {
    finalizeFailure(
      progress,
      new MediaDecryptError("Missing encrypted media CID.", "fetch"),
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

  const encCacheKey = `cid:${cid}`;
  const encCached = await getEncCached(encCacheKey);
  if (encCached?.buf) {
    const encrypted = new Uint8Array(encCached.buf);
    void touchEncCached(encCacheKey);
    progress.phase = MEDIA_PHASE.DECRYPT;
    emitProgress(onProgress, progress);

    try {
      const plain = gcm(mediaKey, mediaNonce).decrypt(encrypted);
      await putDecCached(cacheKey, plain, mime);
      const winningSource = sources[0];
      rememberSourcePreference(cacheKey, winningSource.id);
      progress.phase = MEDIA_PHASE.DONE;
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

  const { plain, source } = await fetchAndDecryptFromSources({
    sources,
    mediaKey,
    mediaNonce,
    onProgress,
    progress,
    retry,
    onRetry,
  });
  await putDecCached(cacheKey, plain, mime);
  rememberSourcePreference(cacheKey, source.id);
  return { plain, mime, progress, fromCache: false, source };
}

export function retrySummary(progress) {
  const retry = progress?.retry;
  if (!retry || progress?.phase !== MEDIA_PHASE.FETCH) return "";
  const total = retry.retries ?? "?";
  const secs = Math.max(1, Math.ceil((retry.nextRetryMs ?? 0) / 1000));
  const where = retry.label ? ` via ${retry.label}` : "";
  return `Retry ${retry.attempt}/${total} · next in ${secs}s${where}`;
}

export function progressSummary(progress) {
  if (!progress) return "";
  if (progress.phase === MEDIA_PHASE.CACHED) return "Loaded from cache";
  if (progress.phase === MEDIA_PHASE.DECRYPT) {
    const winner = progress.sources.find((source) => source.status === SOURCE_STATUS.OK);
    return winner ? `Decrypting from ${winner.label}…` : "Decrypting…";
  }
  if (progress.phase === MEDIA_PHASE.FETCH) {
    const retry = retrySummary(progress);
    if (retry) return retry;
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
