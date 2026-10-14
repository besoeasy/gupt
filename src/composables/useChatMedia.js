import { reactive, onBeforeUnmount, getCurrentInstance } from "vue";
import { asyncPool } from "@/lib/asyncPool";
import { getFileLabel, isAudio, isImage, isVideo } from "@/lib/chatUtils";
import {
  MEDIA_PHASE,
  decryptMediaAttachment,
  createMediaProgress,
  resolveMediaSources,
} from "@/lib/mediaDecrypt";
import { IPFS_RETRY_MAX_RETRIES, backoffDelayForAttempt } from "@/lib/gatewayFetch";

export const MEDIA_DECRYPT_CONCURRENCY = 3;

// A preview that exhausts the gateway-level retries (see lib/gatewayFetch.js)
// used to dead-end until the user tapped Retry. Keep trying in the background
// by continuing the *same* IPFS backoff sequence past its retry budget, so a
// preview that is merely slow to pin still resolves on its own. Continuing
// (rather than restarting) the sequence means the automatic attempts sit at the
// shared 60s cap instead of hammering a gateway from the 4s base again. Timers
// live only while the owning view is mounted; `cleanup` stops them.
export function autoRetryDelayMs(attempt, jitter = true) {
  return backoffDelayForAttempt(IPFS_RETRY_MAX_RETRIES + Math.max(0, attempt), { jitter });
}

function hasDecryptableMedia(message) {
  const media = message?.media || {};
  const cid = String(media.cid || message?.cid || "").trim();
  return Boolean(message?.id && media.key && media.nonce && cid);
}

export function useChatMedia() {
  const mediaBlobUrls = reactive({});
  const mediaProgress = reactive({});
  const decryptFailed = reactive({});

  const autoRetryTimers = new Map();
  const autoRetryAttempts = new Map();
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

  function clearAutoRetry(messageId) {
    const timer = autoRetryTimers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      autoRetryTimers.delete(messageId);
    }
  }

  function clearAllAutoRetries() {
    for (const timer of autoRetryTimers.values()) clearTimeout(timer);
    autoRetryTimers.clear();
    autoRetryAttempts.clear();
  }

  function scheduleAutoRetry(message) {
    const id = message?.id;
    if (!id || autoRetryTimers.has(id) || !hasDecryptableMedia(message)) return;

    const attempt = autoRetryAttempts.get(id) || 0;
    autoRetryAttempts.set(id, attempt + 1);
    const delayMs = autoRetryDelayMs(attempt);

    // Surface the pending attempt so MediaDecryptStatus counts down to it,
    // the same shape the gateway-level retries use.
    const prev = mediaProgress[id];
    if (prev) {
      updateProgress(id, {
        ...prev,
        retry: {
          sourceId: "auto",
          label: "",
          attempt: attempt + 1,
          retries: null,
          nextRetryMs: delayMs,
          at: Date.now(),
          auto: true,
        },
      });
    }

    const timer = setTimeout(() => {
      autoRetryTimers.delete(id);
      void decryptToBlobUrl(message).catch(() => {});
    }, delayMs);
    autoRetryTimers.set(id, timer);
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

    clearAutoRetry(message.id);
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

      autoRetryAttempts.delete(message.id);
      return rememberBlobUrl(message.id, plain, mime);
    } catch (e) {
      decryptFailed[message.id] = true;
      scheduleAutoRetry(message);
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
   * Fetch a whole attachment list with a bounded number in flight. Used by the
   * share and feed views, which show many files at once; chat normally decrypts
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

  async function downloadMedia(message) {
    const url = await decryptToBlobUrl(message);
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = getFileLabel(message);
    link.click();
  }

  async function retryMedia(message) {
    if (!message?.id) return;
    // A manual retry supersedes any scheduled auto-retry and restarts its
    // backoff, so the next automatic attempt waits the base delay again.
    clearAutoRetry(message.id);
    autoRetryAttempts.delete(message.id);
    delete decryptFailed[message.id];
    delete mediaProgress[message.id];
    if (mediaBlobUrls[message.id]) {
      URL.revokeObjectURL(mediaBlobUrls[message.id]);
      delete mediaBlobUrls[message.id];
    }
    await decryptToBlobUrl(message).catch(() => {});
  }

  function cleanup() {
    clearAllAutoRetries();
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
