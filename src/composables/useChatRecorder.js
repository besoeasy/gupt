import { ref, onBeforeUnmount, getCurrentInstance } from "vue";

export function useChatRecorder({ onVoiceReady }) {
  const isRecording = ref(false);
  const recordingSeconds = ref(0);
  const audioLevels = ref(new Array(24).fill(0.12));

  let mediaRecorder = null;
  let recordingStream = null;
  let recordingTimer = null;
  let audioChunks = [];
  let currentMimeType = "";

  let audioContext = null;
  let analyserNode = null;
  let animFrameId = null;

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

  function startAudioAnalysis(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 64;
      analyserNode.smoothingTimeConstant = 0.65;
      source.connect(analyserNode);

      const bufferLength = analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function renderFrame() {
        if (!isRecording.value) return;
        analyserNode.getByteFrequencyData(dataArray);

        const count = 24;
        const step = Math.max(1, Math.floor(bufferLength / count));
        const next = [];
        for (let i = 0; i < count; i++) {
          const val = dataArray[i * step] || 0;
          next.push(Math.max(0.12, Math.min(1.0, val / 255)));
        }
        audioLevels.value = next;
        animFrameId = requestAnimationFrame(renderFrame);
      }
      renderFrame();
    } catch (e) {
      console.warn("Audio analyser initialization failed:", e);
    }
  }

  function stopAudioAnalysis() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    analyserNode = null;
    audioLevels.value = new Array(24).fill(0.12);
  }

  function stopRecordingStream() {
    stopAudioAnalysis();
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
    startAudioAnalysis(recordingStream);

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

  if (getCurrentInstance()) {
    onBeforeUnmount(cancelVoiceRecording);
  }

  return {
    isRecording,
    recordingSeconds,
    audioLevels,
    toggleVoiceRecording,
    cancelVoiceRecording,
  };
}
