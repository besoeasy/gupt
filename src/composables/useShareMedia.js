import { onBeforeUnmount, reactive, unref } from "vue";
import { gcm } from "@noble/ciphers/aes.js";

import { asyncPool } from "@/lib/asyncPool";
import { base64ToBytes, isAudio, isImage, isVideo } from "@/lib/chatUtils";
import { clearEncCached, fetchEncCached, getDecCached, putDecCached } from "@/lib/idb";
import {
  SHARE_DECRYPT_CONCURRENCY,
  resolveShareFileUrls,
  shareFileCacheKey,
} from "@/lib/share";

/**
 * Decrypt and preview share attachments with Dexie caching and concurrency limits.
 */
export function useShareMedia(shareIdSource) {
  const blobUrls = reactive({});
  const loading = reactive({});
  const failed = reactive({});

  function getShareId() {
    return String(unref(shareIdSource) || "");
  }

  function rememberBlobUrl(index, buf, mime) {
    const url = URL.createObjectURL(new Blob([buf], { type: mime || "application/octet-stream" }));
    if (blobUrls[index]) URL.revokeObjectURL(blobUrls[index]);
    blobUrls[index] = url;
    return url;
  }

  async function decryptFile(file, index) {
    if (blobUrls[index]) return blobUrls[index];
    if (loading[index]) return null;

    const mediaKeyB64 = file?.key;
    const mediaNonceB64 = file?.nonce;
    const mediaMime = file?.mime;
    const urls = resolveShareFileUrls(file);

    if (!mediaKeyB64 || !mediaNonceB64 || !urls.length) {
      failed[index] = true;
      throw new Error("Missing encrypted file location or key.");
    }

    loading[index] = true;
    delete failed[index];

    try {
      const cacheKey = shareFileCacheKey(getShareId(), index, file);
      const cached = await getDecCached(cacheKey);
      if (cached?.buf) {
        return rememberBlobUrl(index, cached.buf, cached.mime || mediaMime);
      }

      const mediaKey = base64ToBytes(mediaKeyB64);
      const mediaNonce = base64ToBytes(mediaNonceB64);

      let lastError = null;
      for (const url of urls) {
        try {
          const encrypted = await fetchEncCached(url);
          const plain = gcm(mediaKey, mediaNonce).decrypt(new Uint8Array(encrypted));
          await putDecCached(cacheKey, plain, mediaMime || "application/octet-stream");
          return rememberBlobUrl(index, plain, mediaMime);
        } catch (err) {
          lastError = err;
          await clearEncCached(url).catch(() => {});
        }
      }

      throw lastError || new Error("Unable to decrypt file.");
    } catch (err) {
      failed[index] = true;
      throw err;
    } finally {
      delete loading[index];
    }
  }

  async function decryptAll(files, { concurrency = SHARE_DECRYPT_CONCURRENCY } = {}) {
    const list = Array.from(files || []);
    await asyncPool(concurrency, list, async (file, index) => {
      try {
        await decryptFile(file, index);
      } catch {
        // failed[index] already set
      }
    });
  }

  function autoPreviewMedia(files) {
    const list = Array.from(files || []);
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      const mime = file?.mime || "";
      if (isImage(mime) || isAudio(mime) || isVideo(mime)) {
        decryptFile(file, index).catch(() => {});
      }
    }
  }

  async function downloadFile(file, index) {
    const url = await decryptFile(file, index);
    if (!url) return false;

    const link = document.createElement("a");
    link.href = url;
    link.download = file.name || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }

  function cleanup() {
    for (const url of Object.values(blobUrls)) URL.revokeObjectURL(url);
    for (const key of Object.keys(blobUrls)) delete blobUrls[key];
    for (const key of Object.keys(loading)) delete loading[key];
    for (const key of Object.keys(failed)) delete failed[key];
  }

  onBeforeUnmount(cleanup);

  return {
    blobUrls,
    loading,
    failed,
    decryptFile,
    decryptAll,
    autoPreviewMedia,
    downloadFile,
    cleanup,
  };
}