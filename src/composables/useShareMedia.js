import { onBeforeUnmount, reactive, unref } from "vue";

import { asyncPool } from "@/lib/asyncPool";
import { isAudio, isImage, isVideo } from "@/lib/chatUtils";
import {
  MEDIA_PHASE,
  decryptMediaAttachment,
  createMediaProgress,
  resolveMediaSources,
} from "@/lib/mediaDecrypt";
import { SHARE_DECRYPT_CONCURRENCY, shareFileCacheKey, shareFileToMediaMessage } from "@/lib/share";

export function useShareMedia(shareIdSource) {
  const blobUrls = reactive({});
  const progress = reactive({});
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

  function updateProgress(index, next) {
    progress[index] = next;
  }

  async function decryptFile(file, index) {
    if (blobUrls[index]) return blobUrls[index];
    if (
      progress[index]?.phase === MEDIA_PHASE.FETCH ||
      progress[index]?.phase === MEDIA_PHASE.DECRYPT
    ) {
      return null;
    }

    const mediaKeyB64 = file?.key;
    const mediaNonceB64 = file?.nonce;
    const mediaMime = file?.mime;

    const mediaOrMessage = shareFileToMediaMessage(file);
    const sources = resolveMediaSources(mediaOrMessage || {});

    if (!mediaKeyB64 || !mediaNonceB64 || !sources.length) {
      failed[index] = true;
      updateProgress(index, {
        ...createMediaProgress(sources),
        phase: MEDIA_PHASE.FAILED,
        error: "Missing encrypted file location or key.",
        errorKind: "fetch",
      });
      throw new Error("Missing encrypted file location or key.");
    }

    delete failed[index];
    updateProgress(index, createMediaProgress(sources));

    try {
      const cacheKey = shareFileCacheKey(getShareId(), index, file);
      const { plain, mime } = await decryptMediaAttachment({
        cacheKey,
        keyB64: mediaKeyB64,
        nonceB64: mediaNonceB64,
        mime: mediaMime || "application/octet-stream",
        mediaOrMessage,
        onProgress: (next) => updateProgress(index, next),
      });

      return rememberBlobUrl(index, plain, mime);
    } catch (err) {
      failed[index] = true;
      throw err;
    }
  }

  async function decryptAll(files, { concurrency = SHARE_DECRYPT_CONCURRENCY } = {}) {
    const list = Array.from(files || []);
    await asyncPool(concurrency, list, async (file, index) => {
      try {
        await decryptFile(file, index);
      } catch {}
    });
  }

  function autoPreviewMedia(files) {
    const list = Array.from(files || []);
    for (const [index, file] of list.entries()) {
      const mime = file?.mime;
      if (isImage(mime) || isVideo(mime) || isAudio(mime)) {
        decryptFile(file, index).catch(() => {});
      }
    }
  }

  async function downloadFile(file, index) {
    const url = await decryptFile(file, index);
    if (!url) return false;
    const link = document.createElement("a");
    link.href = url;
    link.download = file?.name || "download";
    link.click();
    return true;
  }

  function cleanup() {
    for (const url of Object.values(blobUrls)) URL.revokeObjectURL(url);
    for (const key of Object.keys(progress)) delete progress[key];
    for (const key of Object.keys(failed)) delete failed[key];
  }

  onBeforeUnmount(cleanup);

  return {
    blobUrls,
    progress,
    failed,
    decryptFile,
    decryptAll,
    autoPreviewMedia,
    downloadFile,
    cleanup,
  };
}
