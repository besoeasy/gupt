<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  FlipHorizontal2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Video,
  VideoOff,
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
const { displayName, profilePicture, prefetch } = useProfileCache();
const { returnToConversation } = useCallNavigation();

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
  await callStore.acceptIncomingCall();
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
  // Requesting mode: caller sent a call request, just show "Requesting…" UI —
  // the actual call starts when the call session receives call-accept
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
    <header
      class="relative z-20 flex items-center gap-3 border-b border-(--app-border) bg-(--nav-bg) px-4 py-3"
    >
      <button
        type="button"
        class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
        title="Back to chat"
        @click="goBack"
      >
        <ArrowLeft class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
      </button>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-bold">{{ peerLabel }}</p>
        <p class="text-xs text-(--app-muted)">{{ stateLabel }}</p>
      </div>
      <span
        v-if="callState === 'connected'"
        class="inline-block h-2 w-2 shrink-0 rounded-full bg-(--app-success) animate-pulse"
      />
    </header>

    <!-- Center content -->
    <main class="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-8">
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

      <!-- Local PiP on video calls -->
      <div
        v-if="isActive && isVideoCall"
        class="absolute bottom-28 right-4 z-20 h-28 w-20 overflow-hidden rounded-2xl border border-(--app-border-strong) bg-(--app-surface) shadow-2xl sm:h-32 sm:w-24"
      >
        <video
          v-show="callStore.localHasVideo && !callStore.cameraOff"
          ref="localVideoEl"
          autoplay
          playsinline
          muted
          class="h-full w-full object-cover scale-x-[-1]"
        />
        <div
          v-if="!callStore.localHasVideo || callStore.cameraOff"
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
    <footer class="relative z-20 border-t border-(--app-border) bg-(--nav-bg) px-4 py-5">
      <div v-if="isIncoming" class="mx-auto flex max-w-md items-center justify-center gap-4">
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
          v-if="isActive && isVideoCall"
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
  </div>
</template>
