import { ref } from "vue";

/**
 * Manages voice recording for a chat view.
 *
 * @param {object} options
 * @param {(rawBuf: ArrayBuffer, mimeType: string, durationMs: number) => Promise<void>} options.onVoiceReady
 *   Called when recording stops normally. The caller handles upload + send + error display.
 */
export function useChatRecorder({ onVoiceReady }) {
  const isRecording = ref(false);
  const recordingSeconds = ref(0);

  let mediaRecorder = null;
  let recordingStream = null;
  let recordingTimer = null;
  let audioChunks = [];
  let currentMimeType = "";

  function getSupportedAudioMime() {
    for (const mime of [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ]) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return "audio/webm";
  }

  function stopRecordingStream() {
    if (!recordingStream) return;
    for (const track of recordingStream.getTracks()) track.stop();
    recordingStream = null;
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone capture.");
    }

    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    currentMimeType = getSupportedAudioMime();
    mediaRecorder = new MediaRecorder(recordingStream, { mimeType: currentMimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      stopRecordingStream();
      if (recordingTimer) clearInterval(recordingTimer);
      recordingTimer = null;

      const chunks = audioChunks;
      const durationMs = recordingSeconds.value * 1000;
      audioChunks = [];
      recordingSeconds.value = 0;

      if (!chunks.length) return;

      const blob = new Blob(chunks, { type: currentMimeType });
      const rawBuf = await blob.arrayBuffer();
      onVoiceReady(rawBuf, currentMimeType, durationMs);
    };

    mediaRecorder.start();
    isRecording.value = true;
    recordingSeconds.value = 0;
    recordingTimer = setInterval(() => {
      recordingSeconds.value += 1;
    }, 1000);
  }

  function stopVoiceRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    isRecording.value = false;
    mediaRecorder.stop();
  }

  function cancelVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
    if (recordingTimer) clearInterval(recordingTimer);
    recordingTimer = null;
    isRecording.value = false;
    recordingSeconds.value = 0;
    audioChunks = [];
    stopRecordingStream();
  }

  async function toggleVoiceRecording() {
    if (isRecording.value) {
      stopVoiceRecording();
      return;
    }
    await startVoiceRecording();
  }

  return { isRecording, recordingSeconds, toggleVoiceRecording, cancelVoiceRecording };
}
