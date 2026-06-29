import { reactive } from "vue";
import { getFileLabel, isAudio, isImage, isVideo } from "@/lib/chatUtils";
import {
  MEDIA_PHASE,
  decryptMediaAttachment,
  createMediaProgress,
  resolveMediaSources,
} from "@/lib/mediaDecrypt";

/**
 * Manages encrypted media blobs for a single chat view.
 * Returns reactive maps and helpers for decrypting/downloading attachments.
 */
export function useChatMedia() {
  const mediaBlobUrls = reactive({});
  const mediaProgress = reactive({});
  const decryptFailed = reactive({});

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

    delete decryptFailed[message.id];
    updateProgress(message.id, createMediaProgress(sources));

    try {
      const { plain, mime } = await decryptMediaAttachment({
        cacheKey: message.id,
        keyB64: mediaKeyB64,
        nonceB64: mediaNonceB64,
        mime: mediaMime || "application/octet-stream",
        locations: message?.media?.locations || [],
        onProgress: (progress) => updateProgress(message.id, progress),
      });

      return rememberBlobUrl(message.id, plain, mime);
    } catch (e) {
      decryptFailed[message.id] = true;
      throw e;
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

  async function downloadMedia(message) {
    const url = await decryptToBlobUrl(message);
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = getFileLabel(message);
    link.click();
  }

  function cleanup() {
    for (const url of Object.values(mediaBlobUrls)) URL.revokeObjectURL(url);
    for (const key of Object.keys(mediaProgress)) delete mediaProgress[key];
  }

  return {
    mediaBlobUrls,
    mediaProgress,
    decryptFailed,
    rememberBlobUrl,
    decryptToBlobUrl,
    preloadMedia,
    downloadMedia,
    cleanup,
  };
}