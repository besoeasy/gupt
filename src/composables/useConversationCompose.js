import { ref, onBeforeUnmount, getCurrentInstance } from "vue";
import { gcm } from "@noble/ciphers/aes.js";

import { useChatMedia } from "@/composables/useChatMedia";
import { useChatRecorder } from "@/composables/useChatRecorder";
import { api } from "@/lib/api";
import { bytesToBase64 } from "@/lib/chatUtils";
import { triggerHaptic, HAPTIC } from "@/lib/haptics";
import { clearStagedUpload, getStagedUpload, stageUpload } from "@/lib/idb";

export const MAX_CHAT_ATTACH_FILES = 10;

function asFileList(input) {
  if (!input) return [];
  if (input instanceof File) return [input];
  return Array.from(input).filter((item) => item instanceof File);
}

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
    retryMedia: retryMediaCore,
    cleanup: cleanupMedia,
  } = useChatMedia();

  function setUploadStatus(status) {
    if (uploadStatusTimer) {
      clearTimeout(uploadStatusTimer);
      uploadStatusTimer = null;
    }
    uploadStatus.value = status;
  }

  function completeUploadStatus(server = "", batch = {}) {
    setUploadStatus({ phase: "done", server, ...batch });
    uploadStatusTimer = setTimeout(() => {
      uploadStatus.value = null;
      uploadStatusTimer = null;
    }, 1400);
  }

  async function postEncryptedMedia(
    rawBuf,
    { mimeType, fileName, msgType, extra = {}, batchIndex = 0, batchTotal = 0 },
  ) {
    await initPromise;
    const tempKey = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setUploadStatus({ phase: "encrypting", server: "", batchIndex, batchTotal });
    const mediaKey = crypto.getRandomValues(new Uint8Array(32));
    const mediaNonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = gcm(mediaKey, mediaNonce).encrypt(new Uint8Array(rawBuf));

    await stageUpload(tempKey, encrypted);

    try {
      const staged = (await getStagedUpload(tempKey)) || encrypted;
      const encryptedFile = new File([staged], `${fileName}.enc`, {
        type: "application/octet-stream",
      });

      const uploadSlots = {};
      const uploaded = await api.uploadFile(encryptedFile, {
        onProgress(update) {
          if (update.uploadId) {
            uploadSlots[update.uploadId] = update.status;
          }
          const doneCount = Object.values(uploadSlots).filter((s) => s === "done").length;
          const totalCount = update.totalUploads || 1;
          setUploadStatus({
            phase: "uploading",
            server: update.server || "",
            uploadId: update.uploadId || "",
            status: update.status || "",
            doneCount,
            totalCount,
            batchIndex,
            batchTotal,
          });
        },
      });
      if (!uploaded || !uploaded.cid) {
        throw new Error("Upload failed: no successful upload locations.");
      }

      const payload = {
        type: msgType,
        text: fileName,
        media: {
          key: bytesToBase64(mediaKey),
          nonce: bytesToBase64(mediaNonce),
          mime: mimeType || "application/octet-stream",
          name: fileName,
          size: rawBuf.byteLength,
          cid: uploaded.cid || "",
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
      if (batchTotal < 2 || batchIndex === batchTotal) {
        completeUploadStatus(uploaded.server || "", { batchIndex, batchTotal });
      }
    } finally {
      await clearStagedUpload(tempKey).catch(() => {});
    }
  }

  const { isRecording, recordingSeconds, audioLevels, toggleVoiceRecording, cancelVoiceRecording } =
    useChatRecorder({
      onVoiceReady: async (rawBuf, mimeType, durationMs) => {
        uploadLoading.value = true;
        triggerHaptic(HAPTIC.send);
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

  async function retryMedia(msg) {
    await initPromise;
    try {
      await retryMediaCore(msg);
    } catch (e) {
      onError(e.message || "Unable to retry decryption.");
    }
  }

  function messageMemoDeps(item) {
    if (!item?.id || item.__dateSeparator || item.type === "call-event") return [];
    return [mediaBlobUrls[item.id], mediaProgress[item.id], decryptFailed[item.id]];
  }

  async function handleFileSelected(input) {
    await initPromise;
    const picked = asFileList(input);
    const files = picked.slice(0, MAX_CHAT_ATTACH_FILES);
    if (!files.length) return;

    uploadLoading.value = true;
    const failed = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const rawBuf = await file.arrayBuffer();
          await postEncryptedMedia(rawBuf, {
            mimeType: file.type || "application/octet-stream",
            fileName: file.name,
            msgType: "media",
            batchIndex: i + 1,
            batchTotal: files.length,
          });
        } catch {
          failed.push(file.name || "attachment");
        }
      }
      if (failed.length === files.length) {
        onError(
          files.length === 1
            ? "Unable to upload attachment."
            : `Unable to upload ${failed.length} attachments.`,
        );
      } else if (failed.length) {
        onError(
          `Sent ${files.length - failed.length} of ${files.length}. Failed: ${failed.join(", ")}`,
        );
      } else if (picked.length > MAX_CHAT_ATTACH_FILES) {
        onError(`Only the first ${MAX_CHAT_ATTACH_FILES} files were sent.`);
      }
    } finally {
      uploadLoading.value = false;
    }
  }

  function cleanupCompose() {
    if (uploadStatusTimer) clearTimeout(uploadStatusTimer);
    cancelVoiceRecording();
    cleanupMedia();
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(cleanupCompose);
  }

  return {
    uploadLoading,
    uploadStatus,
    isRecording,
    recordingSeconds,
    audioLevels,
    cancelVoiceRecording,
    handleToggleRecording,
    handleFileSelected,
    postEncryptedMedia,
    downloadMedia,
    retryMedia,
    mediaBlobUrls,
    mediaProgress,
    decryptFailed,
    rememberBlobUrl,
    preloadMedia,
    messageMemoDeps,
    cleanupCompose,
  };
}
