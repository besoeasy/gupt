import { reactive, onBeforeUnmount, getCurrentInstance } from "vue";
import { asyncPool } from "@/lib/asyncPool";
import { getMediaFileName, isAudio, isImage, isVideo } from "@/lib/chatUtils";
import { RABTA_EVENT_ID_RE } from "@/lib/rabta";
import { getDecCached } from "@/lib/idb";
import {
  MEDIA_PHASE,
  decryptMediaAttachment,
  createMediaProgress,
  resolveMediaSources,
} from "@/lib/mediaDecrypt";
import {
  globalMediaDownloadQueue,
  MAX_CONCURRENT_DOWNLOADS,
} from "@/lib/mediaDownloadQueue";

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

    // If this task is already in the download queue or in-flight, return its promise
    if (message.id && globalMediaDownloadQueue.isPending(message.id)) {
      if (priority) {
        globalMediaDownloadQueue.promote(message.id);
      }
      return globalMediaDownloadQueue.getPromise(message.id);
    }

    // Fast check: is this message already decrypted and cached in IndexedDB?
    // If so, retrieve it immediately without entering the network download queue!
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

    const sources = resolveMediaSources(message);
    const mediaKeyB64 = message?.media?.key || message?.mediaKey || message?.key;
    const mediaNonceB64 = message?.media?.nonce || message?.mediaNonce || message?.nonce || "";
    const mediaMime = message?.media?.mime || message?.mediaMime || message?.mime;

    const parts = (Array.isArray(message?.media?.parts) ? message.media.parts : [])
      .map((part) => String(part || "").trim().toLowerCase())
      .filter(Boolean);
    const blobHash = String(
      parts[0] ||
        message?.media?.hash ||
        message?.media?.sha256 ||
        message?.media?.cid ||
        message?.hash ||
        message?.sha256 ||
        message?.cid ||
        "",
    ).trim();
    const eventId = String(
      message?.eventId ||
        (RABTA_EVENT_ID_RE.test(message?.wrapId) ? message.wrapId : "") ||
        (RABTA_EVENT_ID_RE.test(message?.id) ? message.id : "") ||
        message?.wrapId ||
        message?.id ||
        "",
    ).trim();

    if (!mediaKeyB64 || !sources.length) {
      if (message.id) decryptFailed[message.id] = true;
      if (message.id) {
        updateProgress(message.id, {
          ...createMediaProgress(sources, blobHash, { eventId, parts }),
          phase: MEDIA_PHASE.FAILED,
          error: "Missing encrypted media location or key.",
          errorKind: "fetch",
        });
      }
      throw new Error("Missing encrypted media location or key.");
    }

    const queueId = message.id || blobHash;

    // Enqueue in global download queue (maximum 3 concurrent downloads at a time)
    return globalMediaDownloadQueue.enqueue(
      queueId,
      async () => {
        if (message.id) {
          inFlight.add(message.id);
          delete decryptFailed[message.id];
        }

        try {
          const { plain, chunks, mime } = await decryptMediaAttachment({
            cacheKey: message.id || blobHash,
            keyB64: mediaKeyB64,
            nonceB64: mediaNonceB64,
            mime: mediaMime || "application/octet-stream",
            mediaOrMessage: message,
            onProgress: (progress) => {
              if (message.id) updateProgress(message.id, progress);
            },
          });

          return rememberBlobUrl(message.id, chunks || plain, mime);
        } catch (e) {
          if (message.id) decryptFailed[message.id] = true;
          throw e;
        } finally {
          if (message.id) inFlight.delete(message.id);
        }
      },
      {
        priority,
        onQueued: () => {
          if (message.id) {
            const prog = createMediaProgress(sources, blobHash, { eventId, parts });
            prog.phase = MEDIA_PHASE.QUEUED;
            updateProgress(message.id, prog);
          }
        },
        onStart: () => {
          if (message.id) {
            const prog = createMediaProgress(sources, blobHash, { eventId, parts });
            prog.phase = MEDIA_PHASE.FETCH;
            updateProgress(message.id, prog);
          }
        },
      },
    );
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
   * Fetch a whole attachment list with a bounded number in flight. Used by
   * feed views, which show many files at once; chat normally decrypts
   * one message at a time and never needs this.
   */
  async function decryptAll(messages, { concurrency = MEDIA_DECRYPT_CONCURRENCY } = {}) {
    const list = Array.from(messages || []);
    await asyncPool(concurrency, list, async (message) => {
      try {
        await decryptToBlobUrl(message);
      } catch {}
    });
  }

  function iosLikeDevice() {
    const ua = navigator.userAgent || "";
    return (
      /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    );
  }

  /**
   * Get the decrypted attachment onto the device. A plain `a[download]` click
   * is silently ignored on iOS — most of all in installed-PWA mode — so there
   * the share sheet ("Save to Files" / "Save Image") is the dependable path;
   * every other platform keeps the anchor download.
   */
  async function saveBlobToDevice(url, file) {
    if (iosLikeDevice() && typeof navigator.share === "function") {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] });
          return true;
        }
      } catch (e) {
        if (e?.name === "AbortError") return true; // sheet dismissed on purpose
        // Transient activation may have expired during decryption; try the anchor.
      }
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = file?.name || "attachment";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      link.remove();
    }, 100);
    return true;
  }

  async function downloadMedia(message) {
    if (!message) return false;
    const url = await decryptToBlobUrl(message, { priority: true });
    if (!url) return false;

    // Retrieve or construct the Blob directly from memory or IDB cache
    // without triggering CSP or network failures.
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
    let file;
    try {
      file = new File([blob], fileName, {
        type: blob.type || mime,
      });
    } catch {
      file = { name: fileName, type: blob.type || mime };
    }

    await saveBlobToDevice(url, file);
    return true;
  }

  async function retryMedia(message) {
    if (!message?.id) return;
    // Manual restart after every automatic attempt was exhausted.
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
    for (const id of inFlight) {
      globalMediaDownloadQueue.cancel(id);
    }
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
