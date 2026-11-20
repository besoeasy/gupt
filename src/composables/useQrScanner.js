import { onBeforeUnmount, ref } from "vue";
import { decodeImageData } from "@/lib/qr/scan";

/**
 * Camera QR scanning. The decoder works on a still frame, so the browser only
 * has to hand us pixels — no BarcodeDetector, which Safari and Firefox do not
 * ship. Frames are sampled a few times a second; a phone screen is steady and
 * a faster loop only burns battery.
 */

const MAX_DECODE_EDGE = 1024;
const FRAME_INTERVAL_MS = 110;
const MAX_IMAGE_EDGE = 1600;

function cameraError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access is blocked. Allow it in your browser settings, or scan a photo instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device. Scan a photo instead.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is busy in another app. Close it and try again.";
    case "NotSupportedError":
      return "This browser cannot open the camera here. Use a photo of the code instead.";
    default:
      return "The camera could not start. Use a photo of the code instead.";
  }
}

function frameCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext("2d", { willReadFrequently: true }) };
}

/**
 * @param {{ video: import("vue").Ref<HTMLVideoElement | null>, onDetected: (text: string) => void }} options
 */
export function useQrScanner({ video, onDetected }) {
  const active = ref(false);
  const starting = ref(false);
  const error = ref("");
  const torchOn = ref(false);
  const torchAvailable = ref(false);
  const cameraCount = ref(0);
  const facing = ref("environment");

  let stream = null;
  let track = null;
  let decoder = null;
  let frameHandle = 0;
  let lastFrameAt = 0;
  let stopped = true;

  function readFrame() {
    const element = video.value;
    if (!element || element.readyState < 2 || !element.videoWidth) return null;
    const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(element.videoWidth, element.videoHeight));
    const width = Math.max(1, Math.round(element.videoWidth * scale));
    const height = Math.max(1, Math.round(element.videoHeight * scale));
    if (!decoder || decoder.canvas.width !== width || decoder.canvas.height !== height) {
      decoder = frameCanvas(width, height);
    }
    decoder.context.drawImage(element, 0, 0, width, height);
    const image = decoder.context.getImageData(0, 0, width, height);
    return decodeImageData(image.data, width, height)?.text || null;
  }

  function tick(now) {
    if (stopped) return;
    if (now - lastFrameAt < FRAME_INTERVAL_MS) {
      frameHandle = requestAnimationFrame(tick);
      return;
    }
    lastFrameAt = now;
    const text = readFrame();
    if (text) {
      stop();
      onDetected(text);
      return;
    }
    frameHandle = requestAnimationFrame(tick);
  }

  async function refreshCameraCount() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameraCount.value = devices.filter((device) => device.kind === "videoinput").length;
    } catch {
      cameraCount.value = 0;
    }
  }

  async function start() {
    if (starting.value) return;
    stop();
    error.value = "";
    starting.value = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing.value },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      const element = video.value;
      if (!element) {
        stop();
        return;
      }
      element.srcObject = stream;
      try {
        await element.play();
      } catch {
        // Autoplay refusal still leaves the stream usable; the next frame retries.
      }
      track = stream.getVideoTracks()[0] || null;
      torchAvailable.value = Boolean(track?.getCapabilities?.().torch);
      torchOn.value = false;
      void refreshCameraCount();
      stopped = false;
      active.value = true;
      lastFrameAt = 0;
      frameHandle = requestAnimationFrame(tick);
    } catch (cause) {
      stop();
      error.value = cameraError(cause);
    } finally {
      starting.value = false;
    }
  }

  function stop() {
    stopped = true;
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    decoder = null;
    for (const mediaTrack of stream?.getTracks?.() || []) mediaTrack.stop();
    stream = null;
    track = null;
    torchOn.value = false;
    torchAvailable.value = false;
    active.value = false;
    const element = video.value;
    if (element) element.srcObject = null;
  }

  async function toggleTorch() {
    if (!track || !torchAvailable.value) return;
    const next = !torchOn.value;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      torchOn.value = next;
    } catch {
      torchAvailable.value = false;
      torchOn.value = false;
    }
  }

  async function switchCamera() {
    facing.value = facing.value === "environment" ? "user" : "environment";
    await start();
  }

  onBeforeUnmount(stop);

  return {
    active,
    starting,
    error,
    torchOn,
    torchAvailable,
    cameraCount,
    start,
    stop,
    toggleTorch,
    switchCamera,
  };
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be opened."));
    };
    image.src = url;
  });
}

/** Decode a QR code from a still image the user picked, without a camera. */
export async function decodeQrImage(file) {
  if (!file) return null;
  let source;
  if (typeof createImageBitmap === "function") {
    try {
      source = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      source = await loadImageFile(file);
    }
  } else {
    source = await loadImageFile(file);
  }
  const width0 = source.width || source.naturalWidth;
  const height0 = source.height || source.naturalHeight;
  if (!width0 || !height0) return null;
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width0, height0));
  const width = Math.max(1, Math.round(width0 * scale));
  const height = Math.max(1, Math.round(height0 * scale));
  const { canvas, context } = frameCanvas(width, height);
  context.drawImage(source, 0, 0, width, height);
  source.close?.();
  const image = context.getImageData(0, 0, width, height);
  return decodeImageData(image.data, width, height)?.text || null;
}
