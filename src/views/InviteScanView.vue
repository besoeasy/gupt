<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import jsQR from "jsqr";
import { LoaderCircle, ScanLine } from "@lucide/vue";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { decodeInviteRelays, openInviteDm } from "@/lib/invites";
import { useIdentityStore } from "@/stores/identity";

const router = useRouter();
const identity = useIdentityStore();

const videoRef = ref(null);
const canvasRef = ref(null);
const scanning = ref(false);
const openingDm = ref(false);
const error = ref("");
const status = ref("Requesting camera…");

let stream = null;
let rafId = null;
let stopped = true;

function stopCamera() {
  stopped = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
}

function parseInviteFromText(text) {
  const s = String(text || "").trim();
  const inviteMatch = s.match(/\/#\/invite\/([A-Za-z0-9]+)(?:\/([A-Za-z0-9_-]+))?/);
  if (inviteMatch) {
    return {
      token: inviteMatch[1],
      relays: inviteMatch[2] ? decodeInviteRelays(inviteMatch[2]) : [],
    };
  }
  if (/^[A-Za-z0-9]{8,24}$/.test(s)) return { token: s, relays: [] };
  return null;
}

async function handleDecoded(text) {
  const parsed = parseInviteFromText(text);
  if (!parsed) {
    error.value = "Not a GUPT invite. Scan an invite QR from the Share invite screen.";
    return;
  }

  stopCamera();
  scanning.value = false;
  openingDm.value = true;
  error.value = "";
  status.value = "Opening conversation…";
  try {
    await identity.init();
    const { roomId } = await openInviteDm(identity, parsed.token, parsed.relays);
    router.replace(`/room/${roomId}`);
  } catch (e) {
    error.value = e.message || "Unable to open conversation.";
    openingDm.value = false;
    status.value = "";
  }
}

function tick() {
  if (stopped) return;
  const video = videoRef.value;
  const canvas = canvasRef.value;
  if (!video || !canvas) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width && height) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      if (code?.data) {
        void handleDecoded(code.data);
        return;
      }
    }
  }
  rafId = requestAnimationFrame(tick);
}

async function startScanner() {
  error.value = "";
  status.value = "Requesting camera…";
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera is not available on this device.");
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    const video = videoRef.value;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    stopped = false;
    scanning.value = true;
    status.value = "Point the camera at a GUPT invite QR code.";
    tick();
  } catch (e) {
    const name = e?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      error.value = "Camera permission denied. Allow camera access and try again.";
    } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      error.value = "No camera found on this device.";
    } else if (name === "NotReadableError" || name === "TrackStartError") {
      error.value = "The camera is busy or unavailable.";
    } else {
      error.value = e.message || "Unable to start the camera.";
    }
    scanning.value = false;
    status.value = "";
  }
}

onMounted(() => {
  void startScanner();
});

onBeforeUnmount(() => {
  stopCamera();
});
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader
          back-to="/invite/new"
          back-label="Share"
          eyebrow="Nearby pairing"
          title="Scan a GUPT invite"
        >
          <p class="text-sm leading-6 text-(--app-muted)">
            Point your camera at someone's invite QR to start an encrypted chat instantly.
          </p>
        </PageBackHeader>

        <section class="space-y-4">
          <AppAlertBanner v-if="error" :message="error" />

          <div
            class="relative overflow-hidden rounded-2xl border border-(--app-border) bg-(--app-surface-soft) shadow-sm"
          >
            <video ref="videoRef" class="aspect-[3/4] w-full object-cover" aria-hidden="true" />
            <canvas ref="canvasRef" class="hidden" />

            <div
              v-if="scanning"
              class="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div class="h-48 w-48 rounded-3xl border-4 border-(--app-primary) opacity-70" />
            </div>

            <div
              v-if="openingDm"
              class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-(--app-bg)/80 backdrop-blur"
            >
              <LoaderCircle
                class="h-8 w-8 animate-spin text-(--app-primary)"
                :stroke-width="2"
                aria-hidden="true"
              />
              <p class="text-sm font-semibold text-(--app-text)">Opening conversation…</p>
            </div>

            <div
              v-if="status && !openingDm"
              class="pointer-events-none absolute inset-x-0 bottom-0 bg-(--app-bg)/70 px-4 py-3 text-center text-xs text-(--app-muted) backdrop-blur"
            >
              {{ status }}
            </div>
          </div>

          <PrimaryButton v-if="error" class="w-full" @click="startScanner">
            <ScanLine class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            Try again
          </PrimaryButton>
        </section>
      </div>
    </div>
  </main>
</template>
