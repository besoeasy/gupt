import { reactive, onBeforeUnmount, getCurrentInstance } from "vue";
import { asyncPool } from "@/lib/asyncPool";
import { getMediaFileName, isAudio, isImage, isVideo } from "@/lib/chatUtils";
import { RABTA_EVENT_ID_RE } from "@/lib/rabta";
import { getDecCached, clearDecCached } from "@/lib/idb";
import { runDownloader, saveToDevice, DOWNLOAD_PHASE } from "@/lib/downloader";
import { MAX_CONCURRENT_DOWNLOADS } from "@/lib/mediaDownloadQueue";
import {
  MEDIA_AUTO_RETRY_MAX,
  MEDIA_AUTO_RETRY_MS,
  shouldAutoRetry,
} from "@/lib/mediaAutoRetry";

export const MEDIA_DECRYPT_CONCURRENCY = MAX_CONCURRENT_DOWNLOADS;

export function useChatMedia() {
  const mediaBlobUrls = reactive({});
  const mediaProgress = reactive({});
  const decryptFailed = reactive({});
  const mediaBlobs = new Map();

  const inFlight = new Set();

  // Auto-retry bookkeeping: which attachments are on screen, and which of them
  // are currently broken and waiting for the next quiet attempt.
  const visibleMedia = new Map();
  const pendingRetry = new Map();
  let retryTimer = null;

  // Attachments whose blob the browser already refused once. One repair try
  // each, so a format the browser cannot decode does not loop downloads.
  const rejectedBlobs = new Set();

  function stopRetryTicker() {
    if (!retryTimer) return;
    clearInterval(retryTimer);
    retryTimer = null;
  }

  function runRetryTick() {
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    const active = typeof document === "undefined" || document.visibilityState !== "hidden";
    if (!active) return;
    for (const [id, entry] of [...pendingRetry]) {
      if (!visibleMedia.has(id) || !decryptFailed[id]) {
        pendingRetry.delete(id);
        continue;
      }
      const allowed = shouldAutoRetry({
        visible: true,
        failed: true,
        inFlight: inFlight.has(id),
        online,
        attempts: entry.attempts,
      });
      if (!allowed) {
        if (entry.attempts >= MEDIA_AUTO_RETRY_MAX) pendingRetry.delete(id);
        continue;
      }
      pendingRetry.set(id, { ...entry, attempts: entry.attempts + 1 });
      void retryMedia(entry.message).catch(() => {});
    }
    if (!pendingRetry.size) stopRetryTicker();
  }

  function startRetryTicker() {
    if (retryTimer || typeof setInterval === "undefined") return;
    retryTimer = setInterval(runRetryTick, MEDIA_AUTO_RETRY_MS);
  }

  /** A failure only earns automatic retries while the bubble is on screen. */
  function queueAutoRetry(message) {
    if (!message?.id || !visibleMedia.has(message.id)) return;
    const current = pendingRetry.get(message.id);
    pendingRetry.set(message.id, { message, attempts: current?.attempts || 0 });
    startRetryTicker();
  }

  /** Bubbles report when they enter or leave the viewport. */
  function setMediaVisible(message, visible) {
    if (!message?.id) return;
    if (visible) {
      visibleMedia.set(message.id, message);
      if (decryptFailed[message.id]) queueAutoRetry(message);
      return;
    }
    visibleMedia.delete(message.id);
    pendingRetry.delete(message.id);
    if (!pendingRetry.size) stopRetryTicker();
  }

  function rememberBlobUrl(id, buf, mime) {
    const type = mime || "application/octet-stream";
    const blob =
      buf instanceof Blob
        ? buf
        : Array.isArray(buf)
          ? new Blob(buf, { type })
          : new Blob([buf], { type });
    const url = URL.createObjectURL(blob);
    if (mediaBlobUrls[id]) URL.revokeObjectURL(mediaBlobUrls[id]);
    mediaBlobUrls[id] = url;
    if (id) mediaBlobs.set(id, blob);
    if (id) pendingRetry.delete(id);
    return url;
  }

  function updateProgress(messageId, progress) {
    mediaProgress[messageId] = progress;
  }

  async function decryptToBlobUrl(message, { priority = false } = {}) {
    if (!message) return null;
    if (mediaBlobUrls[message.id]) return mediaBlobUrls[message.id];

    // Fast check: is this message already decrypted and cached in IndexedDB?
    if (message.id) {
      const cached = await getDecCached(message.id).catch(() => null);
      if (cached?.buf) {
        return rememberBlobUrl(
          message.id,
          cached.buf,
          cached.mime || message?.media?.mime || message?.mediaMime,
        );
      }
    }

    if (message.id) {
      inFlight.add(message.id);
      delete decryptFailed[message.id];
    }

    try {
      const result = await runDownloader(message, {
        priority,
        onProgress: (progress) => {
          if (message.id) updateProgress(message.id, progress);
        },
      });

      return rememberBlobUrl(message.id, result.blob || result.plain, result.mime);
    } catch (e) {
      if (message.id) {
        decryptFailed[message.id] = true;
        queueAutoRetry(message);
      }
      throw e;
    } finally {
      if (message.id) inFlight.delete(message.id);
    }
  }

  function preloadMedia(message) {
    const mediaKeyExists = Boolean(message?.media?.key);
    if (!mediaKeyExists) return;
    const mime = message?.media?.mime || message?.mediaMime;
    if (message.type === "voice" || isImage(mime) || isAudio(mime) || isVideo(mime)) {
      decryptToBlobUrl(message, { priority: false }).catch(() => {});
    }
  }

  /**
   * Fetch a whole attachment list with a bounded number in flight.
   */
  async function decryptAll(messages, { concurrency = MEDIA_DECRYPT_CONCURRENCY } = {}) {
    const list = Array.from(messages || []);
    await asyncPool(concurrency, list, async (message) => {
      try {
        await decryptToBlobUrl(message);
      } catch {}
    });
  }

  async function downloadMedia(message) {
    if (!message) return false;
    const url = await decryptToBlobUrl(message, { priority: true });
    if (!url) return false;

    let blob = message.id ? mediaBlobs.get(message.id) : null;
    const mime = message?.media?.mime || "application/octet-stream";
    if (!blob && message.id) {
      const cached = await getDecCached(message.id).catch(() => null);
      if (cached?.buf) {
        blob = new Blob([cached.buf], { type: cached.mime || mime });
        mediaBlobs.set(message.id, blob);
      }
    }
    if (!blob) {
      try {
        const res = await fetch(url);
        blob = await res.blob();
      } catch {
        blob = new Blob([], { type: mime });
      }
    }

    const fileName = getMediaFileName(message);
    await saveToDevice(blob, fileName, mime);
    return true;
  }

  async function retryMedia(message) {
    if (!message?.id) return;
    delete decryptFailed[message.id];
    delete mediaProgress[message.id];
    if (mediaBlobUrls[message.id]) {
      URL.revokeObjectURL(mediaBlobUrls[message.id]);
      delete mediaBlobUrls[message.id];
    }
    mediaBlobs.delete(message.id);
    await decryptToBlobUrl(message, { priority: true }).catch(() => {});
  }

  /**
   * The browser refused the bytes behind a blob URL. That is either a bad
   * cached copy (an old zero-byte entry) or a file this browser cannot decode.
   * Drop the cached copy, fetch it once more, and after that hand the message
   * to the retry card, which still offers Download.
   */
  async function handleMediaDecodeError(message) {
    if (!message?.id) return;
    const url = mediaBlobUrls[message.id];
    if (!url) return;
    URL.revokeObjectURL(url);
    delete mediaBlobUrls[message.id];
    mediaBlobs.delete(message.id);

    if (rejectedBlobs.has(message.id)) {
      decryptFailed[message.id] = true;
      return;
    }
    rejectedBlobs.add(message.id);

    await clearDecCached(message.id).catch(() => {});
    try {
      await decryptToBlobUrl(message, { priority: true });
    } catch {
      decryptFailed[message.id] = true;
    }
  }

  function cleanup() {
    stopRetryTicker();
    visibleMedia.clear();
    pendingRetry.clear();
    inFlight.clear();
    rejectedBlobs.clear();
    for (const url of Object.values(mediaBlobUrls)) URL.revokeObjectURL(url);
    for (const key of Object.keys(mediaProgress)) delete mediaProgress[key];
    mediaBlobs.clear();
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(cleanup);
  }

  return {
    mediaBlobUrls,
    mediaProgress,
    decryptFailed,
    rememberBlobUrl,
    decryptToBlobUrl,
    preloadMedia,
    setMediaVisible,
    decryptAll,
    downloadMedia,
    retryMedia,
    handleMediaDecodeError,
    cleanup,
  };
}
