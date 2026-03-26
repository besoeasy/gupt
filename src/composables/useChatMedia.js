import { reactive } from "vue";
import { api } from "@/lib/api";
import { clearEncCached, fetchEncCached, getDecCached, putDecCached } from "@/lib/idb";
import { base64ToBytes, getFileLabel, isAudio, isImage, isVideo } from "@/lib/chatUtils";

/**
 * Manages encrypted media blobs for a single chat view.
 * Returns reactive maps and helpers for decrypting/downloading attachments.
 */
export function useChatMedia() {
  const mediaBlobUrls = reactive({});
  const mediaLoading = reactive({});
  const decryptFailed = reactive({});

  function rememberBlobUrl(id, buf, mime) {
    const url = URL.createObjectURL(new Blob([buf], { type: mime || "application/octet-stream" }));
    if (mediaBlobUrls[id]) URL.revokeObjectURL(mediaBlobUrls[id]);
    mediaBlobUrls[id] = url;
    return url;
  }

  async function decryptToBlobUrl(message) {
    if (mediaBlobUrls[message.id]) return mediaBlobUrls[message.id];
    if (mediaLoading[message.id]) return null;

    const urls = api.resolveMediaUrls(message);
    const mediaKeyB64 = message?.media?.key;
    const mediaNonceB64 = message?.media?.nonce;
    const mediaMime = message?.media?.mime;
    if (!mediaKeyB64 || !mediaNonceB64 || !urls.length) {
      decryptFailed[message.id] = true;
      throw new Error("Missing encrypted media location or key.");
    }

    mediaLoading[message.id] = true;
    delete decryptFailed[message.id];

    try {
      const cached = await getDecCached(message.id);
      if (cached?.buf) {
        return rememberBlobUrl(message.id, cached.buf, cached.mime || mediaMime);
      }

      const mediaKey = base64ToBytes(mediaKeyB64);
      const mediaNonce = base64ToBytes(mediaNonceB64);
      const cryptoKey = await crypto.subtle.importKey("raw", mediaKey, "AES-GCM", false, [
        "decrypt",
      ]);

      let lastError = null;
      for (const url of urls) {
        try {
          const encrypted = await fetchEncCached(url);
          const plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: mediaNonce },
            cryptoKey,
            encrypted,
          );
          await putDecCached(message.id, plain, mediaMime || "application/octet-stream");
          return rememberBlobUrl(message.id, plain, mediaMime);
        } catch (e) {
          lastError = e;
          await clearEncCached(url).catch(() => {});
        }
      }

      throw lastError || new Error("Unable to decrypt media.");
    } catch (e) {
      decryptFailed[message.id] = true;
      throw e;
    } finally {
      delete mediaLoading[message.id];
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
  }

  return {
    mediaBlobUrls,
    mediaLoading,
    decryptFailed,
    rememberBlobUrl,
    decryptToBlobUrl,
    preloadMedia,
    downloadMedia,
    cleanup,
  };
}
