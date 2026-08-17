<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  Check,
  FlipHorizontal2,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  PhoneCall,
  PhoneOff,
  Shield,
  ShieldCheck,
  Video,
  VideoOff,
  X,
} from "@lucide/vue";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { formatCallDuration, useCallDuration } from "@/composables/useCallDuration";
import { useCallMediaElements } from "@/composables/useCallMediaElements";
import { useCallNavigation } from "@/composables/useCallNavigation";
import { normalizeNostrPubkey } from "@/lib/crypto";
import { useCallStore } from "@/stores/calls";
import { useProfileCache } from "@/composables/useProfileCache";

const route = useRoute();
const router = useRouter();
const callStore = useCallStore();
const pendingStart = ref(false);
const showSasModal = ref(false);
const { displayName, profilePicture, prefetch } = useProfileCache();
const { returnToConversation } = useCallNavigation();

const canScreenShare = computed(
  () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia),
);

const peerPubkey = computed(() => normalizeNostrPubkey(String(route.params.peerPubkey || "")));
const peerLabel = computed(() => (peerPubkey.value ? displayName(peerPubkey.value) : "Contact"));

const callState = computed(() => callStore.callState);
const callMedia = computed(() => callStore.callMedia);
const isRequesting = computed(() => Boolean(route.query.requesting));
const requestingMode = computed(() => route.query.requesting || "");

const isCallForPeer = computed(() => {
  if (!peerPubkey.value) return false;
  const activePeer = normalizeNostrPubkey(callStore.activePeerPubkey);
  return !activePeer || activePeer === peerPubkey.value;
});

const hasPendingRequest = computed(
  () =>
    callStore.callRequestState?.status === "pending" &&
    callStore.callRequestState?.peerPubkey === peerPubkey.value,
);

const isIncoming = computed(() => callState.value === "incoming" && isCallForPeer.value);
const isActive = computed(
  () =>
    isCallForPeer.value &&
    (isRequesting.value ||
      hasPendingRequest.value ||
      ["requesting-media", "outgoing", "connecting", "connected"].includes(callState.value)),
);
const isStarting = computed(
  () =>
    pendingStart.value ||
    isRequesting.value ||
    hasPendingRequest.value ||
    callState.value === "requesting-media",
);
const showCallControls = computed(() => isActive.value || isStarting.value);
const isVideoCall = computed(
  () =>
    requestingMode.value === "video" ||
    callMedia.value.video ||
    callStore.localHasVideo ||
    callStore.remoteHasVideo,
);

const { durationSeconds } = useCallDuration(callState);

const qualityLabel = computed(() => {
  const q = callStore.callQuality;
  if (!q) return "";
  const parts = [];
  if (q.rtt != null) parts.push(`${q.rtt}ms`);
  if (q.packetLoss != null) parts.push(`${q.packetLoss}% loss`);
  if (q.localType && q.remoteType) parts.push(`${q.localType}→${q.remoteType}`);
  if (q.quality && q.quality !== "good") parts.push(q.quality);
  return parts.join(" · ");
});

const stateLabel = computed(() => {
  if (isRequesting.value) {
    return requestingMode.value === "video" ? "Requesting video call…" : "Requesting call…";
  }
  if (hasPendingRequest.value) {
    const media = callStore.callRequestState?.media;
    return media?.video ? "Requesting video call…" : "Requesting call…";
  }
  switch (callState.value) {
    case "requesting-media":
      return "Setting up microphone and camera…";
    case "outgoing":
      return callMedia.value.video ? "Calling with video…" : "Calling…";
    case "connecting":
      return "Connecting…";
    case "connected":
      return qualityLabel.value
        ? `${formatCallDuration(durationSeconds.value)} · ${qualityLabel.value}`
        : formatCallDuration(durationSeconds.value);
    case "incoming":
      return callMedia.value.video ? "Incoming video call" : "Incoming voice call";
    default:
      return "No active call";
  }
});

const localVideoEl = ref(null);
const remoteVideoEl = ref(null);
const remoteAudioEl = ref(null);

useCallMediaElements({
  localVideoEl,
  remoteVideoEl,
  remoteAudioEl,
  localCallStream: computed(() => callStore.localCallStream),
  remoteCallStream: computed(() => callStore.remoteCallStream),
});

async function answer() {
  if (!peerPubkey.value) return;
  try {
    await callStore.acceptIncomingCall();
  } catch (e) {
    callStore.callError = e?.message || "Unable to answer call.";
  }
}

function decline() {
  callStore.declineIncomingCall();
  void returnToConversation(peerPubkey.value);
}

function hangup() {
  callStore.hangup();
}

async function goBack() {
  if (callStore.callState === "idle") {
    callStore.hangup();
    await returnToConversation(peerPubkey.value);
    return;
  }
  hangup();
}

watch(
  () => callStore.callState,
  (state, previous) => {
    if (state === "idle" && previous && previous !== "idle" && route.path.startsWith("/call/")) {
      if (callStore.callError) return;
      void returnToConversation(peerPubkey.value);
    }
  },
);

watch(
  peerPubkey,
  (pk) => {
    if (pk) void prefetch([pk]);
  },
  { immediate: true },
);

async function maybeAutoStartFromQuery() {
  if (route.query.requesting) {
    await router.replace({ path: route.path });
    return;
  }

  const mode = String(route.query.start || "");
  if (mode !== "audio" && mode !== "video") return;
  if (!peerPubkey.value || callStore.callState !== "idle" || callStore.callError) return;

  pendingStart.value = true;
  try {
    const check = await callStore.runConnectivityCheck();
    if (!check.ok) {
      callStore.callError = check.warning || "Network check failed. Calls may not connect.";
      return;
    }
    if (mode === "video") await callStore.startVideoCall(peerPubkey.value);
    else await callStore.startAudioCall(peerPubkey.value);
  } finally {
    pendingStart.value = false;
    if (route.query.start) {
      await router.replace({ path: route.path });
    }
  }
}

onMounted(() => {
  void maybeAutoStartFromQuery();
});

onBeforeUnmount(() => {
  if (remoteAudioEl.value) remoteAudioEl.value.srcObject = null;
});
</script>

<template>
  <div class="call-shell relative flex h-dvh w-full flex-col overflow-hidden">
    <audio v-if="isActive" ref="remoteAudioEl" autoplay playsinline class="hidden" />

    <!-- Remote video -->
    <div v-if="isActive && isVideoCall" class="absolute inset-0 bg-black">
      <video
        v-show="callStore.remoteHasVideo"
        ref="remoteVideoEl"
        autoplay
        playsinline
        class="h-full w-full object-cover"
      />
      <div
        v-if="!callStore.remoteHasVideo"
        class="flex h-full w-full items-center justify-center px-6 text-center text-sm text-(--app-muted)"
      >
        {{ callState === "connected" ? "Waiting for remote video…" : "Video will appear here." }}
      </div>
    </div>

    <!-- Audio / idle backdrop -->
    <div
      v-else
      class="absolute inset-0 bg-linear-to-b from-(--app-surface) via-(--app-bg) to-black"
    />

    <!-- Top bar -->
    <header class="relative z-20 w-full border-b border-(--app-border) bg-(--nav-bg)">
      <div class="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] cursor-pointer"
          title="Back to chat"
          @click="goBack"
        >
          <ArrowLeft class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
        </button>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-bold">{{ peerLabel }}</p>
          <p class="text-xs text-(--app-muted)">{{ stateLabel }}</p>
        </div>

        <button
          v-if="callState === 'connected' && callStore.callSas"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition-all cursor-pointer select-none"
          :class="
            callStore.sasVerified
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
              : 'border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:text-(--app-text)'
          "
          :title="
            callStore.sasVerified
              ? 'Call verified direct and secure'
              : 'Click to verify call encryption (SAS)'
          "
          @click="showSasModal = true"
        >
          <ShieldCheck v-if="callStore.sasVerified" class="h-3.5 w-3.5 text-emerald-400" />
          <Shield v-else class="h-3.5 w-3.5 text-(--app-muted)" />
          <span class="tracking-wider text-sm">{{ callStore.callSas.emojis.join(" ") }}</span>
        </button>

        <span
          v-if="callState === 'connected'"
          class="inline-block h-2 w-2 shrink-0 rounded-full bg-(--app-success) animate-pulse"
        />
      </div>
    </header>

    <!-- Center content -->
    <main
      class="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8"
    >
      <div v-if="!isActive && !isIncoming && !isStarting" class="max-w-sm space-y-4 text-center">
        <RoboAvatar
          v-if="peerPubkey"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="xxl"
          :hoverable="false"
        />
        <p v-if="callStore.callError" class="text-sm leading-relaxed text-(--app-danger)">
          {{ callStore.callError }}
        </p>
        <p class="text-sm text-(--app-muted) leading-relaxed">
          Start a voice or video call from the conversation screen, or wait for an incoming call.
        </p>
      </div>

      <div
        v-else-if="isStarting && !isActive && !isIncoming"
        class="max-w-sm space-y-4 text-center"
      >
        <RoboAvatar
          v-if="peerPubkey"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="xxl"
          :hoverable="false"
        />
        <p class="text-sm text-(--app-muted) leading-relaxed">Starting call…</p>
      </div>

      <div
        v-else-if="isIncoming || !isVideoCall"
        class="flex flex-col items-center gap-5 text-center"
      >
        <RoboAvatar
          v-if="peerPubkey"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="hero"
          :hoverable="false"
          class="ring-4 ring-(--app-primary-soft)"
        />
        <div class="space-y-1">
          <h1 class="text-2xl font-bold tracking-tight">{{ peerLabel }}</h1>
          <p class="text-sm text-(--app-muted)">{{ stateLabel }}</p>
        </div>
      </div>

      <!-- Local PiP on video / screen share calls -->
      <div
        v-if="isActive && (isVideoCall || callStore.isScreenSharing)"
        class="absolute bottom-28 right-4 z-20 h-28 w-20 overflow-hidden rounded-2xl border border-(--app-border-strong) bg-(--app-surface) shadow-2xl sm:h-32 sm:w-24"
      >
        <video
          v-show="callStore.localHasVideo && (!callStore.cameraOff || callStore.isScreenSharing)"
          ref="localVideoEl"
          autoplay
          playsinline
          muted
          class="h-full w-full object-cover"
          :class="callStore.isScreenSharing ? '' : 'scale-x-[-1]'"
        />
        <div
          v-if="(!callStore.localHasVideo || callStore.cameraOff) && !callStore.isScreenSharing"
          class="flex h-full w-full items-center justify-center text-[10px] text-(--app-muted)"
        >
          Camera off
        </div>
      </div>
    </main>

    <AppAlertBanner
      v-if="callStore.connectivityWarning && callState !== 'connected'"
      :message="callStore.connectivityWarning"
      class="relative z-20 mx-4 mb-2"
    />

    <AppAlertBanner
      v-if="callStore.callError"
      :message="callStore.callError"
      class="relative z-20 mx-4 mb-2"
    />

    <!-- Controls -->
    <footer
      class="relative z-20 w-full border-t border-(--app-border) bg-(--nav-bg) px-4 py-4 sm:py-5 sm:px-6 lg:px-8"
    >
      <div
        v-if="isIncoming"
        class="mx-auto flex w-full max-w-6xl items-center justify-center gap-4"
      >
        <button
          type="button"
          class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-(--app-success) text-white transition-transform active:scale-95"
          title="Answer"
          @click="answer"
        >
          <PhoneCall class="h-6 w-6" :stroke-width="2" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white transition-transform active:scale-95"
          title="Decline"
          @click="decline"
        >
          <PhoneOff class="h-6 w-6" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>

      <div
        v-else-if="showCallControls"
        class="mx-auto flex max-w-lg items-center justify-center gap-3 sm:gap-4"
      >
        <button
          v-if="isActive"
          type="button"
          class="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          :class="callStore.micMuted ? 'bg-red-500/15 text-red-400' : ''"
          :title="callStore.micMuted ? 'Unmute' : 'Mute'"
          @click="callStore.toggleMic()"
        >
          <MicOff v-if="callStore.micMuted" class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
          <Mic v-else class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
        </button>

        <button
          v-if="isActive"
          type="button"
          class="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          :class="callStore.cameraOff ? 'bg-red-500/15 text-red-400' : ''"
          :title="callStore.cameraOff ? 'Turn camera on' : 'Turn camera off'"
          @click="callStore.toggleCamera()"
        >
          <VideoOff
            v-if="callStore.cameraOff"
            class="h-5 w-5"
            :stroke-width="2"
            aria-hidden="true"
          />
          <Video v-else class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
        </button>

        <button
          v-if="isActive && canScreenShare"
          type="button"
          class="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          :class="
            callStore.isScreenSharing
              ? 'bg-(--app-primary-soft) text-(--app-primary) border-(--app-primary)'
              : ''
          "
          :title="callStore.isScreenSharing ? 'Stop sharing screen' : 'Share screen'"
          @click="callStore.toggleScreenShare()"
        >
          <MonitorOff
            v-if="callStore.isScreenSharing"
            class="h-5 w-5"
            :stroke-width="2"
            aria-hidden="true"
          />
          <MonitorUp v-else class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
        </button>

        <button
          v-if="isActive && isVideoCall"
          type="button"
          class="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          :class="callStore.switchingCamera ? 'opacity-50' : ''"
          title="Switch camera"
          :disabled="callStore.switchingCamera"
          @click="callStore.switchCamera()"
        >
          <FlipHorizontal2
            class="h-5 w-5 transition-transform"
            :class="callStore.switchingCamera ? 'animate-spin' : ''"
            :stroke-width="2"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white transition-transform hover:bg-red-500 active:scale-95"
          title="End call"
          @click="hangup"
        >
          <PhoneOff class="h-6 w-6" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </footer>

    <!-- SAS Verification Modal -->
    <div
      v-if="showSasModal && callStore.callSas"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sas-modal-title"
      @click.self="showSasModal = false"
    >
      <div
        class="w-full max-w-sm overflow-hidden rounded-3xl border border-(--app-border-strong) bg-(--app-surface) p-6 shadow-2xl space-y-6"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-2xl"
              :class="
                callStore.sasVerified
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-(--app-surface-soft) text-(--app-primary)'
              "
            >
              <ShieldCheck v-if="callStore.sasVerified" class="h-5 w-5" />
              <Shield v-else class="h-5 w-5" />
            </div>
            <div>
              <h2 id="sas-modal-title" class="text-base font-bold text-(--app-text)">
                Call Verification
              </h2>
              <p class="text-xs text-(--app-muted)">Short Authentication String (SAS)</p>
            </div>
          </div>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-xl text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text) cursor-pointer"
            @click="showSasModal = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <p class="text-xs leading-relaxed text-(--app-muted)">
          Compare these 4 emojis with <strong class="text-(--app-text)">{{ peerLabel }}</strong
          >. If they match on both screens, your call is direct, end-to-end encrypted, and free from
          relay tampering.
        </p>

        <!-- Emojis display card -->
        <div
          class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-(--app-border) bg-(--app-bg) py-5 px-4"
        >
          <div class="flex items-center justify-center gap-2.5 sm:gap-3">
            <div
              v-for="(emoji, index) in callStore.callSas.emojis"
              :key="index"
              class="flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface) text-2xl sm:text-3xl shadow-sm"
            >
              {{ emoji }}
            </div>
          </div>
          <span class="text-[11px] font-mono text-(--app-muted) tracking-widest uppercase">
            Code: #{{ callStore.callSas.code }}
          </span>
        </div>

        <div class="space-y-3">
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-2xl py-3 px-4 text-sm font-semibold transition-colors cursor-pointer select-none"
            :class="
              callStore.sasVerified
                ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-(--app-primary) text-(--app-primary-text) hover:opacity-90'
            "
            @click="callStore.toggleSasVerified()"
          >
            <Check v-if="callStore.sasVerified" class="h-4 w-4" />
            <ShieldCheck v-else class="h-4 w-4" />
            {{ callStore.sasVerified ? "Marked as Verified ✓" : "Mark as Verified" }}
          </button>

          <button
            type="button"
            class="w-full rounded-2xl py-2.5 text-center text-xs font-medium text-(--app-muted) hover:text-(--app-text) cursor-pointer"
            @click="showSasModal = false"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
