import { onBeforeUnmount, ref } from "vue";
import { decodeImageData } from "@/lib/qr/scan";
import {
  centerCrop,
  confirmScan,
  SCAN_CONFIRM_FRAMES,
  SCAN_FULL_FRAME_EVERY,
} from "@/lib/qr/frame";

/**
 * Camera QR scanning. The decoder works on a still frame, so the browser only
 * has to hand us pixels — no BarcodeDetector, which Safari and Firefox do not
 * ship. Frames are sampled a few times a second; a phone screen is steady and
 * a faster loop only burns battery. The center square is decoded first because
 * that is where the guide frame is; a full-frame pass runs every few frames
 * for a code held outside it.
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
  const confirming = ref(false);
  const confirmProgress = ref(0);

  let stream = null;
  let track = null;
  let cropDecoder = null;
  let fullDecoder = null;
  let candidate = null;
  let frameIndex = 0;
  let frameHandle = 0;
  let lastFrameAt = 0;
  let stopped = true;

  function decodeRegion(element, sx, sy, sourceWidth, sourceHeight, cache) {
    const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    let decoder = cache === "full" ? fullDecoder : cropDecoder;
    if (!decoder || decoder.canvas.width !== width || decoder.canvas.height !== height) {
      decoder = frameCanvas(width, height);
      if (cache === "full") fullDecoder = decoder;
      else cropDecoder = decoder;
    }
    decoder.context.drawImage(element, sx, sy, sourceWidth, sourceHeight, 0, 0, width, height);
    const image = decoder.context.getImageData(0, 0, width, height);
    return decodeImageData(image.data, width, height)?.text || null;
  }

  function readFrame(full) {
    const element = video.value;
    if (!element || element.readyState < 2 || !element.videoWidth) return null;
    if (full) {
      return decodeRegion(element, 0, 0, element.videoWidth, element.videoHeight, "full");
    }
    const crop = centerCrop(element.videoWidth, element.videoHeight);
    if (!crop.size) return null;
    return decodeRegion(element, crop.sx, crop.sy, crop.size, crop.size, "crop");
  }

  function tick(now) {
    if (stopped) return;
    if (now - lastFrameAt < FRAME_INTERVAL_MS) {
      frameHandle = requestAnimationFrame(tick);
      return;
    }
    lastFrameAt = now;
    frameIndex += 1;
    let text = readFrame(false);
    if (!text && frameIndex % SCAN_FULL_FRAME_EVERY === 0) text = readFrame(true);

    // Two matching frames keep a single shaky read from opening a conversation;
    // the ring fills while the first sighting waits for its confirmation.
    const result = confirmScan(candidate, text, now);
    candidate = result.candidate;
    confirming.value = Boolean(candidate);
    confirmProgress.value = candidate ? Math.min(0.9, candidate.count / SCAN_CONFIRM_FRAMES) : 0;
    if (result.confirmed) {
      confirming.value = false;
      confirmProgress.value = 0;
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
    cropDecoder = null;
    fullDecoder = null;
    candidate = null;
    frameIndex = 0;
    confirming.value = false;
    confirmProgress.value = 0;
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
    confirming,
    confirmProgress,
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
