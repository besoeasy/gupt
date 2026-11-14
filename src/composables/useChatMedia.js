import { reactive, onBeforeUnmount, getCurrentInstance } from "vue";
import { asyncPool } from "@/lib/asyncPool";
import { getMediaFileName, isAudio, isImage, isVideo } from "@/lib/chatUtils";
import {
  MEDIA_PHASE,
  decryptMediaAttachment,
  createMediaProgress,
  resolveMediaSources,
} from "@/lib/mediaDecrypt";

export const MEDIA_DECRYPT_CONCURRENCY = 3;

export function useChatMedia() {
  const mediaBlobUrls = reactive({});
  const mediaProgress = reactive({});
  const decryptFailed = reactive({});

  const inFlight = new Set();

  function rememberBlobUrl(id, buf, mime) {
    const url = URL.createObjectURL(new Blob([buf], { type: mime || "application/octet-stream" }));
    if (mediaBlobUrls[id]) URL.revokeObjectURL(mediaBlobUrls[id]);
    mediaBlobUrls[id] = url;
    return url;
  }

  function updateProgress(messageId, progress) {
    mediaProgress[messageId] = progress;
  }

  async function decryptToBlobUrl(message) {
    if (mediaBlobUrls[message.id]) return mediaBlobUrls[message.id];
    if (inFlight.has(message.id)) return null;
    if (mediaProgress[message.id]?.phase === MEDIA_PHASE.FETCH) return null;
    if (mediaProgress[message.id]?.phase === MEDIA_PHASE.DECRYPT) return null;

    const sources = resolveMediaSources(message);
    const mediaKeyB64 = message?.media?.key;
    const mediaNonceB64 = message?.media?.nonce;
    const mediaMime = message?.media?.mime;

    if (!mediaKeyB64 || !mediaNonceB64 || !sources.length) {
      decryptFailed[message.id] = true;
      updateProgress(message.id, {
        ...createMediaProgress(sources),
        phase: MEDIA_PHASE.FAILED,
        error: "Missing encrypted media location or key.",
        errorKind: "fetch",
      });
      throw new Error("Missing encrypted media location or key.");
    }

    inFlight.add(message.id);
    delete decryptFailed[message.id];
    updateProgress(message.id, createMediaProgress(sources));

    try {
      const { plain, mime } = await decryptMediaAttachment({
        cacheKey: message.id,
        keyB64: mediaKeyB64,
        nonceB64: mediaNonceB64,
        mime: mediaMime || "application/octet-stream",
        mediaOrMessage: message,
        onProgress: (progress) => updateProgress(message.id, progress),
      });

      return rememberBlobUrl(message.id, plain, mime);
    } catch (e) {
      decryptFailed[message.id] = true;
      throw e;
    } finally {
      inFlight.delete(message.id);
    }
  }

  function preloadMedia(message) {
    const mediaKeyExists = Boolean(message?.media?.key);
    if (!mediaKeyExists) return;
    const mime = message?.media?.mime || message?.mediaMime;
    if (message.type === "voice" || isImage(mime) || isAudio(mime) || isVideo(mime)) {
      decryptToBlobUrl(message).catch(() => {});
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
    if (iosLikeDevice() && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch (e) {
        if (e?.name === "AbortError") return true; // sheet dismissed on purpose
        // Transient activation may have expired during decryption; try the anchor.
      }
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    return true;
  }

  async function downloadMedia(message) {
    const url = await decryptToBlobUrl(message);
    if (!url) return false;
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], getMediaFileName(message), {
      type: blob.type || message?.media?.mime || "application/octet-stream",
    });
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
    await decryptToBlobUrl(message).catch(() => {});
  }

  function cleanup() {
    inFlight.clear();
    for (const url of Object.values(mediaBlobUrls)) URL.revokeObjectURL(url);
    for (const key of Object.keys(mediaProgress)) delete mediaProgress[key];
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
