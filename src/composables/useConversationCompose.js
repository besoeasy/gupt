import { ref } from "vue";
import { gcm } from "@noble/ciphers/aes.js";

import { useChatMedia } from "@/composables/useChatMedia";
import { useChatRecorder } from "@/composables/useChatRecorder";
import { api } from "@/lib/api";
import { bytesToBase64 } from "@/lib/chatUtils";
import { clearStagedUpload, getStagedUpload, stageUpload } from "@/lib/idb";

/**
 * Shared encrypted media upload, voice recording, and attachment flow for DM/group rooms.
 *
 * @param {object} options
 * @param {() => Promise<unknown>} options.initPromise
 * @param {(message: string) => void} options.onError
 * @param {() => object} [options.getReplyMeta]
 * @param {() => void} [options.clearReply]
 * @param {(payload: object, ctx: { rawBuf: ArrayBuffer, mimeType: string }) => Promise<void>} options.deliverEncryptedPayload
 */
export function useConversationCompose({
  initPromise,
  onError,
  getReplyMeta = () => ({}),
  clearReply = () => {},
  deliverEncryptedPayload,
}) {
  const uploadLoading = ref(false);
  const uploadStatus = ref(null);
  let uploadStatusTimer = null;

  const {
    mediaBlobUrls,
    mediaProgress,
    decryptFailed,
    rememberBlobUrl,
    preloadMedia,
    downloadMedia: downloadMediaCore,
    cleanup: cleanupMedia,
  } = useChatMedia();

  function setUploadStatus(status) {
    if (uploadStatusTimer) {
      clearTimeout(uploadStatusTimer);
      uploadStatusTimer = null;
    }
    uploadStatus.value = status;
  }

  function completeUploadStatus(server = "") {
    setUploadStatus({ phase: "done", server });
    uploadStatusTimer = setTimeout(() => {
      uploadStatus.value = null;
      uploadStatusTimer = null;
    }, 1400);
  }

  async function postEncryptedMedia(rawBuf, { mimeType, fileName, msgType, extra = {} }) {
    await initPromise;
    const tempKey = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setUploadStatus({ phase: "encrypting", server: "" });
    const mediaKey = crypto.getRandomValues(new Uint8Array(32));
    const mediaNonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = gcm(mediaKey, mediaNonce).encrypt(new Uint8Array(rawBuf));

    await stageUpload(tempKey, encrypted);

    try {
      const staged = (await getStagedUpload(tempKey)) || encrypted;
      const encryptedFile = new File([staged], `${fileName}.enc`, {
        type: "application/octet-stream",
      });
      const uploaded = await api.uploadFile(encryptedFile, {
        onProgress(update) {
          setUploadStatus({ phase: "uploading", server: update.server || "" });
        },
      });
      if (!uploaded || (!uploaded.cid && !uploaded.url)) {
        throw new Error("Upload failed: no successful upload locations.");
      }

      const payload = {
        type: uploaded.type || msgType,
        text: fileName,
        media: {
          key: bytesToBase64(mediaKey),
          nonce: bytesToBase64(mediaNonce),
          mime: mimeType || "application/octet-stream",
          name: fileName,
          size: rawBuf.byteLength,
          cid: uploaded.cid || "",
          url: uploaded.url || "",
          sha256: uploaded.sha256 || "",
          server: uploaded.server || "",
        },
        durationMs: Number(extra.durationMs || 0),
        ...getReplyMeta(),
        ...extra,
      };

      clearReply();
      await deliverEncryptedPayload(payload, {
        rawBuf,
        mimeType: mimeType || "application/octet-stream",
      });
      completeUploadStatus(uploaded.server || "");
    } finally {
      await clearStagedUpload(tempKey).catch(() => {});
    }
  }

  const { isRecording, recordingSeconds, toggleVoiceRecording, cancelVoiceRecording } =
    useChatRecorder({
      onVoiceReady: async (rawBuf, mimeType, durationMs) => {
        uploadLoading.value = true;
        try {
          await postEncryptedMedia(rawBuf, {
            mimeType,
            fileName: `voice-note-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
            msgType: "voice",
            extra: { durationMs },
          });
        } catch (e) {
          onError(e.message || "Unable to send voice note.");
        } finally {
          uploadLoading.value = false;
        }
      },
    });

  async function handleToggleRecording() {
    try {
      await toggleVoiceRecording();
    } catch (e) {
      onError(e.message || "Microphone access failed.");
    }
  }

  async function downloadMedia(msg) {
    await initPromise;
    try {
      await downloadMediaCore(msg);
    } catch (e) {
      onError(e.message || "Unable to decrypt attachment.");
    }
  }

  function messageMemoDeps(item) {
    if (!item?.id || item.__dateSeparator || item.type === "call-event") return [];
    return [mediaBlobUrls[item.id], mediaProgress[item.id], decryptFailed[item.id]];
  }

  async function handleFileSelected(file) {
    await initPromise;
    if (!file) return;
    uploadLoading.value = true;
    try {
      const rawBuf = await file.arrayBuffer();
      await postEncryptedMedia(rawBuf, {
        mimeType: file.type || "application/octet-stream",
        fileName: file.name,
        msgType: "media",
      });
    } catch (err) {
      onError(err.message || "Unable to upload attachment.");
    } finally {
      uploadLoading.value = false;
    }
  }

  function cleanupCompose() {
    if (uploadStatusTimer) clearTimeout(uploadStatusTimer);
    cancelVoiceRecording();
    cleanupMedia();
  }

  return {
    uploadLoading,
    uploadStatus,
    isRecording,
    recordingSeconds,
    cancelVoiceRecording,
    handleToggleRecording,
    handleFileSelected,
    postEncryptedMedia,
    downloadMedia,
    mediaBlobUrls,
    mediaProgress,
    decryptFailed,
    rememberBlobUrl,
    preloadMedia,
    messageMemoDeps,
    cleanupCompose,
  };
}
