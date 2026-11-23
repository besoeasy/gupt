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
} from "@/icons";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { formatCallDuration, useCallDuration } from "@/composables/useCallDuration";
import { useCallMediaElements } from "@/composables/useCallMediaElements";
import { useCallNavigation } from "@/composables/useCallNavigation";
import { normalizePubkey } from "@/lib/crypto";
import { useCallStore } from "@/stores/calls";
import { useProfileStore } from "@/stores/profiles";

const route = useRoute();
const router = useRouter();
const callStore = useCallStore();
const pendingStart = ref(false);
const showSasModal = ref(false);
const { displayName, profilePicture, prefetch } = useProfileStore();
const { returnToConversation } = useCallNavigation();

const canScreenShare = computed(
  () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia),
);

const peerPubkey = computed(() => normalizePubkey(String(route.params.peerPubkey || "")));
const peerLabel = computed(() => (peerPubkey.value ? displayName(peerPubkey.value) : "Contact"));

const callState = computed(() => callStore.callState);
const callMedia = computed(() => callStore.callMedia);
const isRequesting = computed(() => Boolean(route.query.requesting));
const requestingMode = computed(() => route.query.requesting || "");

const isCallForPeer = computed(() => {
  if (!peerPubkey.value) return false;
  const activePeer = normalizePubkey(callStore.activePeerPubkey);
  return !activePeer || activePeer === peerPubkey.value;
});

const isIncoming = computed(() => callState.value === "incoming" && isCallForPeer.value);
const isActive = computed(
  () =>
    isCallForPeer.value &&
    (isRequesting.value ||
      ["requesting-media", "outgoing", "connecting", "connected"].includes(callState.value)),
);
const isStarting = computed(
  () => pendingStart.value || isRequesting.value || callState.value === "requesting-media",
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
  <div class="call">
    <audio v-if="isActive" ref="remoteAudioEl" autoplay playsinline class="call__audio" />

    <!-- Remote video -->
    <div v-if="isActive && isVideoCall" class="call__stage call__stage--video">
      <video
        v-show="callStore.remoteHasVideo"
        ref="remoteVideoEl"
        autoplay
        playsinline
        class="call__remote-video"
      />
      <div v-if="!callStore.remoteHasVideo" class="call__stage-note">
        {{ callState === "connected" ? "Waiting for remote video…" : "Video will appear here." }}
      </div>
    </div>

    <!-- Audio / idle backdrop -->
    <div v-else class="call__stage call__stage--audio" />

    <!-- Top bar -->
    <header class="call__header">
      <button type="button" class="call__back" title="Back to chat" @click="goBack">
        <ArrowLeft class="call__back-icon" :stroke-width="1.9" aria-hidden="true" />
      </button>

      <div class="call__identity">
        <p class="call__peer">{{ peerLabel }}</p>
        <p class="call__state">
          <span
            class="call__state-dot"
            :class="{
              'call__state-dot--live': callState === 'connected',
              'call__state-dot--ringing': callState === 'ringing' || isIncoming,
            }"
            aria-hidden="true"
          />
          {{ stateLabel }}
        </p>
      </div>

      <button
        v-if="callState === 'connected' && callStore.callSas"
        type="button"
        class="call__sas"
        :class="callStore.sasVerified ? 'call__sas--verified' : ''"
        :title="
          callStore.sasVerified
            ? 'Call verified direct and secure'
            : 'Click to verify call encryption (SAS)'
        "
        @click="showSasModal = true"
      >
        <ShieldCheck v-if="callStore.sasVerified" class="call__sas-icon" :stroke-width="1.9" aria-hidden="true" />
        <Shield v-else class="call__sas-icon" :stroke-width="1.9" aria-hidden="true" />
        <span class="call__sas-emojis">{{ callStore.callSas.emojis.join(" ") }}</span>
      </button>
    </header>

    <!-- Center content -->
    <main class="call__main">
      <div v-if="!isActive && !isIncoming && !isStarting" class="call__idle">
        <RoboAvatar
          v-if="peerPubkey"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="xxl"
          :hoverable="false"
        />
        <p v-if="callStore.callError" class="call__error">{{ callStore.callError }}</p>
        <p class="call__hint">
          Start a voice or video call from the conversation screen, or wait for an incoming call.
        </p>
      </div>

      <div v-else-if="isStarting && !isActive && !isIncoming" class="call__idle">
        <RoboAvatar
          v-if="peerPubkey"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="xxl"
          :hoverable="false"
        />
        <p class="call__starting">
          <span class="call__starting-dot" aria-hidden="true" />
          Starting call…
        </p>
      </div>

      <div v-else-if="isIncoming || !isVideoCall" class="call__contact">
        <RoboAvatar
          v-if="peerPubkey"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="hero"
          :hoverable="false"
          class="call__avatar"
        />
        <div class="call__contact-text">
          <h1 class="call__contact-name">{{ peerLabel }}</h1>
          <p class="call__contact-state">{{ stateLabel }}</p>
        </div>
      </div>

      <!-- Local PiP on video / screen share calls -->
      <div v-if="isActive && (isVideoCall || callStore.isScreenSharing)" class="call__pip">
        <video
          v-show="callStore.localHasVideo && (!callStore.cameraOff || callStore.isScreenSharing)"
          ref="localVideoEl"
          autoplay
          playsinline
          muted
          class="call__local-video"
          :class="callStore.isScreenSharing ? '' : 'call__local-video--mirror'"
        />
        <div
          v-if="(!callStore.localHasVideo || callStore.cameraOff) && !callStore.isScreenSharing"
          class="call__pip-note"
        >
          Camera off
        </div>
      </div>
    </main>

    <div v-if="callStore.connectivityWarning && callState !== 'connected'" class="call__alert">
      <AppAlertBanner :message="callStore.connectivityWarning" />
    </div>

    <div v-if="callStore.callError" class="call__alert">
      <AppAlertBanner :message="callStore.callError" />
    </div>

    <!-- Controls -->
    <footer class="call__footer">
      <div v-if="isIncoming" class="call__incoming-actions">
        <button type="button" class="call__action call__action--answer" title="Answer" @click="answer">
          <PhoneCall class="call__action-icon" :stroke-width="1.9" aria-hidden="true" />
          <span class="call__action-label">Answer</span>
        </button>
        <button type="button" class="call__action call__action--decline" title="Decline" @click="decline">
          <PhoneOff class="call__action-icon" :stroke-width="1.9" aria-hidden="true" />
          <span class="call__action-label">Decline</span>
        </button>
      </div>

      <div v-else-if="showCallControls" class="call__controls">
        <button
          v-if="isActive"
          type="button"
          class="call__control"
          :class="callStore.micMuted ? 'call__control--off' : ''"
          :title="callStore.micMuted ? 'Unmute' : 'Mute'"
          :aria-pressed="callStore.micMuted"
          @click="callStore.toggleMic()"
        >
          <MicOff v-if="callStore.micMuted" class="call__control-icon" :stroke-width="1.9" aria-hidden="true" />
          <Mic v-else class="call__control-icon" :stroke-width="1.9" aria-hidden="true" />
          <span class="call__control-label">{{ callStore.micMuted ? "Unmute" : "Mute" }}</span>
        </button>

        <button
          v-if="isActive"
          type="button"
          class="call__control"
          :class="callStore.cameraOff ? 'call__control--off' : ''"
          :title="callStore.cameraOff ? 'Turn camera on' : 'Turn camera off'"
          :aria-pressed="callStore.cameraOff"
          @click="callStore.toggleCamera()"
        >
          <VideoOff v-if="callStore.cameraOff" class="call__control-icon" :stroke-width="1.9" aria-hidden="true" />
          <Video v-else class="call__control-icon" :stroke-width="1.9" aria-hidden="true" />
          <span class="call__control-label">{{ callStore.cameraOff ? "Camera on" : "Camera off" }}</span>
        </button>

        <button
          v-if="isActive && canScreenShare"
          type="button"
          class="call__control"
          :class="callStore.isScreenSharing ? 'call__control--on' : ''"
          :title="callStore.isScreenSharing ? 'Stop sharing screen' : 'Share screen'"
          :aria-pressed="callStore.isScreenSharing"
          @click="callStore.toggleScreenShare()"
        >
          <MonitorOff v-if="callStore.isScreenSharing" class="call__control-icon" :stroke-width="1.9" aria-hidden="true" />
          <MonitorUp v-else class="call__control-icon" :stroke-width="1.9" aria-hidden="true" />
          <span class="call__control-label">{{ callStore.isScreenSharing ? "Stop share" : "Share" }}</span>
        </button>

        <button
          v-if="isActive && isVideoCall"
          type="button"
          class="call__control call__control--icon"
          :class="callStore.switchingCamera ? 'call__control--busy' : ''"
          title="Switch camera"
          :disabled="callStore.switchingCamera"
          @click="callStore.switchCamera()"
        >
          <FlipHorizontal2
            class="call__control-icon"
            :class="callStore.switchingCamera ? 'call__control-icon--spin' : ''"
            :stroke-width="1.9"
            aria-hidden="true"
          />
          <span class="call__control-label">Flip</span>
        </button>

        <button type="button" class="call__hangup" title="End call" @click="hangup">
          <PhoneOff class="call__hangup-icon" :stroke-width="1.9" aria-hidden="true" />
          <span class="call__hangup-label">End</span>
        </button>
      </div>
    </footer>

    <!-- SAS Verification Modal -->
    <Transition
      enter-active-class="app-modal-enter-active"
      enter-from-class="app-modal-enter-from"
      leave-active-class="app-modal-leave-active"
      leave-to-class="app-modal-leave-to"
    >
      <div
        v-if="showSasModal && callStore.callSas"
        class="call__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sas-modal-title"
        @click.self="showSasModal = false"
      >
        <div class="app-modal-panel call__panel">
          <header class="call__panel-head">
            <div class="call__panel-title">
              <span
                class="call__panel-mark"
                :class="callStore.sasVerified ? 'call__panel-mark--verified' : ''"
                aria-hidden="true"
              >
                <ShieldCheck v-if="callStore.sasVerified" class="call__panel-mark-icon" :stroke-width="1.9" />
                <Shield v-else class="call__panel-mark-icon" :stroke-width="1.9" />
              </span>
              <div>
                <h2 id="sas-modal-title" class="call__panel-heading">Call verification</h2>
                <p class="call__panel-caption">Short Authentication String (SAS)</p>
              </div>
            </div>
            <button type="button" class="call__panel-close" title="Close" @click="showSasModal = false">
              <X class="call__panel-close-icon" :stroke-width="2" aria-hidden="true" />
            </button>
          </header>

          <p class="call__panel-text">
            Compare these 4 emojis with <strong>{{ peerLabel }}</strong>. If they match on both
            screens, your call is direct, end-to-end encrypted, and free from relay tampering.
          </p>

          <div class="call__sas-sheet">
            <div class="call__sas-emojis" aria-hidden="true">
              <div
                v-for="(emoji, index) in callStore.callSas.emojis"
                :key="index"
                class="app-badge-pop call__sas-emoji"
                :style="{ animationDelay: `${80 + index * 60}ms` }"
              >
                {{ emoji }}
              </div>
            </div>
            <span class="call__sas-code">Code: #{{ callStore.callSas.code }}</span>
          </div>

          <div class="call__panel-actions">
            <button
              type="button"
              class="call__verify"
              :class="callStore.sasVerified ? 'call__verify--done' : ''"
              @click="callStore.toggleSasVerified()"
            >
              <Check v-if="callStore.sasVerified" class="call__verify-icon" :stroke-width="2.2" aria-hidden="true" />
              <ShieldCheck v-else class="call__verify-icon" :stroke-width="1.9" aria-hidden="true" />
              {{ callStore.sasVerified ? "Marked as verified" : "Mark as verified" }}
            </button>

            <button type="button" class="call__panel-dismiss" @click="showSasModal = false">
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Ledger pass: the call is a full-bleed stage with a hairline command rail. */

.call {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100dvh;
  background: var(--app-bg);
  color: var(--app-text);
  overflow: hidden;
}

.call__audio {
  display: none;
}

/* ---- Stage ---- */

.call__stage {
  position: absolute;
  inset: 0;
}

.call__stage--video {
  background: #000;
}

.call__stage--audio {
  background:
    radial-gradient(
      120% 80% at 50% 0%,
      color-mix(in oklab, var(--app-surface-soft) 82%, transparent) 0%,
      transparent 60%
    ),
    linear-gradient(to bottom, var(--app-surface) 0%, var(--app-bg) 46%, #000 100%);
}

.call__remote-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.call__stage-note {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding-inline: var(--app-space-5);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  text-align: center;
  color: color-mix(in oklab, var(--app-text) 60%, transparent);
}

/* ---- Header ---- */

.call__header {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  width: 100%;
  padding: var(--app-space-3) var(--app-space-4);
  border-bottom: 1px solid color-mix(in oklab, var(--app-border) 70%, transparent);
  background: color-mix(in oklab, var(--app-bg) 78%, transparent);
  backdrop-filter: blur(14px);
  animation: ledger-fade 240ms var(--app-ease-standard) both;
}

.call__back {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text-soft);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.call__back:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

.call__back-icon {
  width: 15px;
  height: 15px;
}

.call__identity {
  flex: 1;
  min-width: 0;
}

.call__peer {
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.call__state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.call__state-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-border-strong);
}

.call__state-dot--ringing {
  background: var(--app-warning);
  animation: ledger-dot-pulse 1.4s var(--app-ease-standard) infinite;
}

.call__state-dot--live {
  background: var(--app-success);
  box-shadow: var(--app-glow-amber);
}

.call__sas {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding-inline: 9px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.call__sas--verified {
  border-color: color-mix(in oklab, var(--app-success) 34%, var(--app-border));
  background: var(--app-success-soft);
  color: var(--app-success);
}

.call__sas-icon {
  width: 12px;
  height: 12px;
}

.call__sas-emojis {
  font-size: 11px;
  letter-spacing: 0.06em;
}

/* ---- Main ---- */

.call__main {
  position: relative;
  z-index: 10;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 60rem;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.call__idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-4);
  max-width: 24rem;
  text-align: center;
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.call__error {
  margin: 0;
  padding: 7px 11px;
  border: 1px solid color-mix(in oklab, var(--app-danger) 30%, var(--app-border));
  border-radius: var(--app-radius-sm);
  background: var(--app-danger-soft);
  font-size: 11px;
  line-height: 1.55;
  color: var(--app-danger);
}

.call__hint {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--app-muted-2);
}

.call__starting {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.call__starting-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-warning);
  animation: ledger-dot-pulse 1.4s var(--app-ease-standard) infinite;
}

.call__contact {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-4);
  text-align: center;
  animation: ledger-rise 460ms var(--app-ease-emphasized) both;
}

.call__contact-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.call__contact-name {
  margin: 0;
  font-size: var(--app-text-display);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: var(--app-tracking-display);
  color: var(--app-text);
}

.call__contact-state {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.call__pip {
  position: absolute;
  right: var(--app-space-4);
  bottom: 78px;
  z-index: 20;
  width: 104px;
  height: 142px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  box-shadow: 0 18px 40px -24px rgba(0, 0, 0, 0.6);
  animation: ledger-rise 360ms var(--app-ease-emphasized) both;
}

.call__local-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.call__local-video--mirror {
  transform: scaleX(-1);
}

.call__pip-note {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

/* ---- Alerts ---- */

.call__alert {
  position: relative;
  z-index: 20;
  width: 100%;
  max-width: 60rem;
  margin-inline: auto;
  padding-inline: var(--app-space-4);
}

/* ---- Footer ---- */

.call__footer {
  position: relative;
  z-index: 20;
  width: 100%;
  padding: var(--app-space-3) var(--app-space-4) var(--app-space-4);
  border-top: 1px solid color-mix(in oklab, var(--app-border) 70%, transparent);
  background: color-mix(in oklab, var(--app-bg) 78%, transparent);
  backdrop-filter: blur(14px);
}

.call__incoming-actions,
.call__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 36rem;
  margin-inline: auto;
}

.call__action,
.call__control,
.call__hangup {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 52px;
  height: 52px;
  padding-inline: 10px;
  border-radius: var(--app-radius-md);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.call__control {
  border: 1px solid var(--app-border);
  background: transparent;
  color: var(--app-text-soft);
}

.call__control--off {
  border-color: color-mix(in oklab, var(--app-danger) 32%, var(--app-border));
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

.call__control--on {
  border-color: color-mix(in oklab, var(--app-success) 32%, var(--app-border));
  background: var(--app-success-soft);
  color: var(--app-success);
}

.call__control--busy {
  opacity: 0.6;
  cursor: default;
}

.call__action--answer {
  border: 1px solid color-mix(in oklab, var(--app-success) 44%, transparent);
  background: var(--app-success);
  color: #000;
}

.call__action--decline,
.call__hangup {
  border: 1px solid color-mix(in oklab, var(--app-danger) 50%, transparent);
  background: var(--app-danger);
  color: var(--color-white);
}

.call__action:active,
.call__control:active,
.call__hangup:active {
  transform: translateY(1px);
}

.call__action-icon,
.call__control-icon,
.call__hangup-icon {
  width: 16px;
  height: 16px;
}

.call__action-label,
.call__control-label,
.call__hangup-label {
  font-family: var(--font-mono);
  font-size: 7.5px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0.78;
}

.call__control-icon--spin {
  animation: var(--animate-spin);
}

/* ---- Verification panel ---- */

.call__dialog {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--app-space-4);
  background: color-mix(in oklab, #000 58%, transparent);
  backdrop-filter: blur(3px);
}

.call__panel {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  width: 100%;
  max-width: 25rem;
  padding: var(--app-space-5);
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-lg);
  background: var(--app-surface);
  box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.7);
}

.call__panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.call__panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.call__panel-mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  color: var(--app-primary);
}

.call__panel-mark--verified {
  border-color: color-mix(in oklab, var(--app-success) 34%, var(--app-border));
  background: var(--app-success-soft);
  color: var(--app-success);
}

.call__panel-mark-icon {
  width: 14px;
  height: 14px;
}

.call__panel-heading {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.call__panel-caption {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.call__panel-close {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.call__panel-close-icon {
  width: 13px;
  height: 13px;
}

.call__panel-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--app-muted);
}

.call__panel-text strong {
  font-weight: 500;
  color: var(--app-text);
}

.call__sas-sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface-soft);
}

.call__sas-emojis {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.call__sas-emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  font-size: 22px;
  line-height: 1;
}

.call__sas-code {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.call__panel-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.call__verify {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 38px;
  padding-inline: 12px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-text);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.call__verify--done {
  border-color: color-mix(in oklab, var(--app-success) 38%, var(--app-border));
  background: var(--app-success-soft);
  color: var(--app-success);
}

.call__verify-icon {
  width: 12px;
  height: 12px;
}

.call__panel-dismiss {
  width: 100%;
  min-height: 30px;
  padding-block: 6px;
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

@media (min-width: 40rem) {
  .call__header {
    padding-inline: var(--app-space-6);
  }

  .call__footer {
    padding-inline: var(--app-space-6);
  }

  .call__pip {
    right: var(--app-space-6);
    bottom: 92px;
    width: 128px;
    height: 172px;
  }

  .call__action,
  .call__control,
  .call__hangup {
    min-width: 64px;
    height: 58px;
    padding-inline: 12px;
  }

  .call__panel {
    padding: var(--app-space-6);
  }
}

@media (max-width: 25rem) {
  .call__control-label {
    display: none;
  }

  .call__control {
    min-width: 48px;
  }
}

@media (hover: hover) {
  .call__back:hover {
    border-color: var(--app-border-strong);
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .call__sas:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .call__control:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .call__control--off:hover {
    border-color: var(--app-danger);
    color: var(--app-danger);
  }

  .call__control--on:hover {
    border-color: var(--app-success);
    color: var(--app-success);
  }

  .call__action--answer:hover {
    background: color-mix(in oklab, var(--app-success) 86%, #000);
  }

  .call__action--decline:hover,
  .call__hangup:hover {
    background: color-mix(in oklab, var(--app-danger) 86%, #000);
  }

  .call__panel-close:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .call__verify:hover {
    border-color: var(--app-text);
  }

  .call__panel-dismiss:hover {
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .call__back,
  .call__sas,
  .call__action,
  .call__control,
  .call__hangup,
  .call__verify,
  .call__panel-dismiss,
  .call__panel-close {
    min-height: var(--app-touch-h);
  }

  .call__back,
  .call__panel-close {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .call__header,
  .call__idle,
  .call__contact,
  .call__pip {
    animation: none;
  }

  .call__state-dot--ringing,
  .call__starting-dot {
    animation: none;
  }

  .call__back,
  .call__sas,
  .call__action,
  .call__control,
  .call__hangup,
  .call__verify,
  .call__panel-close,
  .call__panel-dismiss {
    transition: none;
  }
}
</style>
