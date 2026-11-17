import { reactive, onBeforeUnmount, getCurrentInstance } from "vue";
import { asyncPool } from "@/lib/asyncPool";
import { getMediaFileName, isAudio, isImage, isVideo } from "@/lib/chatUtils";
import { RABTA_EVENT_ID_RE } from "@/lib/rabta";
import { getDecCached } from "@/lib/idb";
import { runDownloader, saveToDevice, DOWNLOAD_PHASE } from "@/lib/downloader";
import { MAX_CONCURRENT_DOWNLOADS } from "@/lib/mediaDownloadQueue";

export const MEDIA_DECRYPT_CONCURRENCY = MAX_CONCURRENT_DOWNLOADS;

export function useChatMedia() {
  const mediaBlobUrls = reactive({});
  const mediaProgress = reactive({});
  const decryptFailed = reactive({});
  const mediaBlobs = new Map();

  const inFlight = new Set();

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
      if (message.id) decryptFailed[message.id] = true;
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

  function cleanup() {
    inFlight.clear();
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
    decryptAll,
    downloadMedia,
    retryMedia,
    cleanup,
  };
}
