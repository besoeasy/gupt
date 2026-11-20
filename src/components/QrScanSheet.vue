<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ImagePlus, LoaderCircle, RefreshCw, ScanLine, X, Zap } from "@/icons";
import { decodeQrImage, useQrScanner } from "@/composables/useQrScanner";

const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "detected"]);

const videoEl = ref(null);
const fileInput = ref(null);
const closeButton = ref(null);
const photoError = ref("");
const photoBusy = ref(false);

const { active, starting, error, torchOn, torchAvailable, cameraCount, start, stop, toggleTorch, switchCamera } =
  useQrScanner({
    video: videoEl,
    onDetected: (text) => {
      stop();
      emit("detected", text);
    },
  });

function close() {
  stop();
  emit("close");
}

async function pickPhoto() {
  photoError.value = "";
  fileInput.value?.click();
}

async function onFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  photoError.value = "";
  photoBusy.value = true;
  try {
    const text = await decodeQrImage(file);
    if (text) {
      stop();
      emit("detected", text);
    } else {
      photoError.value = "No QR code was found in that photo. Try a closer, sharper shot.";
    }
  } catch (cause) {
    photoError.value = cause?.message || "That image could not be read.";
  } finally {
    photoBusy.value = false;
  }
}

function onKeydown(event) {
  if (event.key === "Escape" && props.open) close();
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      photoError.value = "";
      await nextTick();
      closeButton.value?.focus();
      void start();
      window.addEventListener("keydown", onKeydown);
    } else {
      stop();
      window.removeEventListener("keydown", onKeydown);
    }
  },
);

onBeforeUnmount(() => {
  stop();
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="app-modal-enter-active"
      enter-from-class="app-modal-enter-from"
      leave-active-class="app-modal-leave-active"
      leave-to-class="app-modal-leave-to"
    >
      <div
        v-if="open"
        class="qr-scan"
        role="dialog"
        aria-modal="true"
        aria-label="Scan a QR code"
      >
        <video
          ref="videoEl"
          class="qr-scan__video"
          :class="{ 'qr-scan__video--live': active }"
          muted
          playsinline
          autoplay
        />

        <div class="qr-scan__top">
          <div>
            <p class="qr-scan__eyebrow">Add a contact</p>
            <h2 class="qr-scan__title">Scan a Gupt code</h2>
          </div>
          <button
            ref="closeButton"
            type="button"
            class="qr-scan__icon-button"
            aria-label="Close scanner"
            @click="close"
          >
            <X :stroke-width="2.2" aria-hidden="true" />
          </button>
        </div>

        <div class="qr-scan__frame" aria-hidden="true">
          <span class="qr-scan__corner qr-scan__corner--tl" />
          <span class="qr-scan__corner qr-scan__corner--tr" />
          <span class="qr-scan__corner qr-scan__corner--bl" />
          <span class="qr-scan__corner qr-scan__corner--br" />
          <span class="qr-scan__beam" />
        </div>

        <div v-if="!active" class="qr-scan__fallback">
          <ScanLine class="qr-scan__fallback-icon" :stroke-width="1.6" aria-hidden="true" />
          <p v-if="starting" class="qr-scan__fallback-text">Starting the camera…</p>
          <p v-else-if="error" class="qr-scan__fallback-text" role="alert">{{ error }}</p>
          <p v-else class="qr-scan__fallback-text">
            Point the camera at a code from another device. The camera stays on this device.
          </p>
        </div>

        <div class="qr-scan__bottom">
          <p class="qr-scan__hint">
            The code never leaves your device — scanning only fills in the key or lobby code.
          </p>

          <div class="qr-scan__actions">
            <button
              v-if="torchAvailable"
              type="button"
              class="qr-scan__action"
              :class="{ 'qr-scan__action--on': torchOn }"
              :aria-pressed="torchOn"
              @click="toggleTorch"
            >
              <Zap :stroke-width="2" aria-hidden="true" />
              <span>{{ torchOn ? "Light off" : "Light on" }}</span>
            </button>
            <button
              v-if="cameraCount > 1"
              type="button"
              class="qr-scan__action"
              @click="switchCamera"
            >
              <RefreshCw :stroke-width="2" aria-hidden="true" />
              <span>Flip</span>
            </button>
            <button type="button" class="qr-scan__action" :disabled="photoBusy" @click="pickPhoto">
              <LoaderCircle v-if="photoBusy" class="qr-scan__spin" :stroke-width="2" aria-hidden="true" />
              <ImagePlus v-else :stroke-width="2" aria-hidden="true" />
              <span>{{ photoBusy ? "Reading…" : "Photo" }}</span>
            </button>
          </div>

          <p v-if="photoError" class="qr-scan__photo-error" role="alert">{{ photoError }}</p>

          <button type="button" class="qr-scan__manual" @click="close">
            Enter the code manually
          </button>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="qr-scan__file"
          @change="onFile"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.qr-scan {
  /* The scanner is a camera surface: ink and paper stay the QR pair in both
     themes, and every overlay is mixed from them. The hex fallbacks cover
     browsers without color-mix. */
  --scan-paper-soft: rgba(247, 248, 251, 0.72);
  --scan-paper-strong: rgba(247, 248, 251, 0.88);
  --scan-line: rgba(255, 255, 255, 0.16);
  --scan-surface: rgba(10, 12, 16, 0.55);
  --scan-surface-strong: rgba(20, 24, 32, 0.72);
  --scan-surface-hover: rgba(38, 44, 56, 0.86);
  --scan-scrim: rgba(0, 0, 0, 0.58);
  --scan-scrim-strong: rgba(0, 0, 0, 0.82);
  --scan-glow: rgba(255, 255, 255, 0.8);
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--app-qr-paper);
  background: var(--app-qr-ink);
}

@supports (color: color-mix(in lab, red, red)) {
  .qr-scan {
    --scan-paper-soft: color-mix(in srgb, var(--app-qr-paper) 72%, transparent);
    --scan-paper-strong: color-mix(in srgb, var(--app-qr-paper) 88%, transparent);
    --scan-line: color-mix(in srgb, var(--app-qr-paper) 16%, transparent);
    --scan-surface: color-mix(in srgb, var(--app-qr-ink) 55%, transparent);
    --scan-surface-strong: color-mix(in srgb, var(--app-qr-ink) 72%, transparent);
    --scan-surface-hover: color-mix(in srgb, var(--app-qr-paper) 18%, var(--app-qr-ink));
    --scan-scrim: color-mix(in srgb, var(--app-qr-ink) 58%, transparent);
    --scan-scrim-strong: color-mix(in srgb, var(--app-qr-ink) 82%, transparent);
    --scan-glow: color-mix(in srgb, var(--app-qr-paper) 80%, transparent);
  }
}

.qr-scan__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--app-dur-base) var(--app-ease-standard);
}

.qr-scan__video--live {
  opacity: 1;
}

.qr-scan__top {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: calc(env(safe-area-inset-top, 0px) + 18px) 20px 0;
}

.qr-scan__eyebrow {
  margin: 0 0 2px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--scan-paper-soft);
}

.qr-scan__title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.3;
}

.qr-scan__icon-button {
  display: grid;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  place-items: center;
  color: var(--app-qr-paper);
  background: var(--scan-surface);
  border: 1px solid var(--scan-line);
  border-radius: 999px;
  backdrop-filter: blur(10px);
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.qr-scan__icon-button:active {
  transform: scale(0.94);
}

.qr-scan__frame {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(72vw, 300px);
  aspect-ratio: 1;
  transform: translate(-50%, -52%);
  border-radius: 22px;
  box-shadow: 0 0 0 100vmax var(--scan-scrim);
  pointer-events: none;
}

.qr-scan__corner {
  position: absolute;
  width: 34px;
  height: 34px;
  border: 3px solid var(--app-qr-paper);
  border-radius: 4px;
}

.qr-scan__corner--tl {
  top: -2px;
  left: -2px;
  border-right: 0;
  border-bottom: 0;
}

.qr-scan__corner--tr {
  top: -2px;
  right: -2px;
  border-bottom: 0;
  border-left: 0;
}

.qr-scan__corner--bl {
  bottom: -2px;
  left: -2px;
  border-top: 0;
  border-right: 0;
}

.qr-scan__corner--br {
  right: -2px;
  bottom: -2px;
  border-top: 0;
  border-left: 0;
}

.qr-scan__beam {
  position: absolute;
  top: 8%;
  right: 6px;
  left: 6px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--app-qr-paper), transparent);
  box-shadow: 0 0 12px var(--scan-glow);
  animation: qr-scan-beam 2.6s var(--app-ease-standard) infinite;
}

.qr-scan__fallback {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 10px;
  width: min(72vw, 300px);
  padding: 0 8px;
  text-align: center;
  transform: translate(-50%, -52%);
}

.qr-scan__fallback-icon {
  width: 44px;
  height: 44px;
  color: var(--scan-paper-soft);
}

.qr-scan__fallback-text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--scan-paper-strong);
}

.qr-scan__bottom {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 12px;
  margin-top: auto;
  padding: 18px 20px calc(env(safe-area-inset-bottom, 0px) + 18px);
  background: linear-gradient(180deg, transparent, var(--scan-scrim-strong) 32%);
}

.qr-scan__hint {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--scan-paper-soft);
  text-align: center;
}

.qr-scan__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.qr-scan__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  padding: 0 14px;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--app-qr-paper);
  background: var(--scan-surface-strong);
  border: 1px solid var(--scan-line);
  border-radius: 999px;
  backdrop-filter: blur(10px);
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.qr-scan__action svg {
  width: 17px;
  height: 17px;
}

.qr-scan__action:active {
  transform: scale(0.96);
}

.qr-scan__action--on {
  color: var(--app-qr-ink);
  background: var(--app-qr-paper);
  border-color: var(--app-qr-paper);
}

.qr-scan__action:disabled {
  opacity: 0.65;
}

.qr-scan__spin {
  animation: qr-scan-spin 0.9s linear infinite;
}

.qr-scan__photo-error {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--app-danger);
  text-align: center;
}

.qr-scan__manual {
  justify-self: center;
  min-height: 44px;
  padding: 0 12px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--scan-paper-soft);
  text-decoration: underline;
  text-underline-offset: 3px;
  background: none;
  border: 0;
}

.qr-scan__file {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

@media (hover: hover) {
  .qr-scan__icon-button:hover,
  .qr-scan__action:hover {
    background: var(--scan-surface-hover);
  }

  .qr-scan__manual:hover {
    color: var(--app-qr-paper);
  }
}

@media (prefers-reduced-motion: reduce) {
  .qr-scan__beam,
  .qr-scan__spin {
    animation: none;
  }
}

@keyframes qr-scan-beam {
  0%,
  100% {
    top: 8%;
    opacity: 0;
  }

  12%,
  88% {
    opacity: 1;
  }

  50% {
    top: 90%;
  }
}

@keyframes qr-scan-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
