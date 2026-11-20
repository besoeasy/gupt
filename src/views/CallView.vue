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
  <div class="call-shell call-view__block">
    <audio v-if="isActive" ref="remoteAudioEl" autoplay playsinline class="call-view__audio" />

    <!-- Remote video -->
    <div v-if="isActive && isVideoCall" class="call-view__block-2">
      <video
        v-show="callStore.remoteHasVideo"
        ref="remoteVideoEl"
        autoplay
        playsinline
        class="call-view__video"
      />
      <div
        v-if="!callStore.remoteHasVideo"
        class="call-view__block-3"
      >
        {{ callState === "connected" ? "Waiting for remote video…" : "Video will appear here." }}
      </div>
    </div>

    <!-- Audio / idle backdrop -->
    <div
      v-else
      class="call-view__block-4"
    />

    <!-- Top bar -->
    <header class="call-view__header">
      <div class="call-view__block-5">
        <button
          type="button"
          class="call-view__button-back-to"
          title="Back to chat"
          @click="goBack"
        >
          <ArrowLeft class="call-view__arrow-left" :stroke-width="2" aria-hidden="true" />
        </button>
        <div class="call-view__block-6">
          <p class="call-view__text">{{ peerLabel }}</p>
          <p class="call-view__text-2">{{ stateLabel }}</p>
        </div>

        <button
          v-if="callState === 'connected' && callStore.callSas"
          type="button"
          class="call-view__button"
          :class="
            callStore.sasVerified
              ? 'call-view__button--success'
              : 'call-view__button--variant-2'
          "
          :title="
            callStore.sasVerified
              ? 'Call verified direct and secure'
              : 'Click to verify call encryption (SAS)'
          "
          @click="showSasModal = true"
        >
          <ShieldCheck v-if="callStore.sasVerified" class="call-view__shield-check" />
          <Shield v-else class="call-view__shield" />
          <span class="call-view__text-3">{{ callStore.callSas.emojis.join(" ") }}</span>
        </button>

        <span
          v-if="callState === 'connected'"
          class="call-view__text-4"
        />
      </div>
    </header>

    <!-- Center content -->
    <main
      class="call-view__main"
    >
      <div v-if="!isActive && !isIncoming && !isStarting" class="call-view__block-7">
        <RoboAvatar
          v-if="peerPubkey"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="xxl"
          :hoverable="false"
        />
        <p v-if="callStore.callError" class="call-view__text-5">
          {{ callStore.callError }}
        </p>
        <p class="call-view__text-6">
          Start a voice or video call from the conversation screen, or wait for an incoming call.
        </p>
      </div>

      <div
        v-else-if="isStarting && !isActive && !isIncoming"
        class="call-view__block-8"
      >
        <RoboAvatar
          v-if="peerPubkey"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="xxl"
          :hoverable="false"
        />
        <p class="call-view__text-7">Starting call…</p>
      </div>

      <div
        v-else-if="isIncoming || !isVideoCall"
        class="call-view__block-9"
      >
        <RoboAvatar
          v-if="peerPubkey"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="hero"
          :hoverable="false"
          class="call-view__robo-avatar"
        />
        <div class="call-view__block-10">
          <h1 class="call-view__title">{{ peerLabel }}</h1>
          <p class="call-view__text-8">{{ stateLabel }}</p>
        </div>
      </div>

      <!-- Local PiP on video / screen share calls -->
      <div
        v-if="isActive && (isVideoCall || callStore.isScreenSharing)"
        class="call-view__block-11"
      >
        <video
          v-show="callStore.localHasVideo && (!callStore.cameraOff || callStore.isScreenSharing)"
          ref="localVideoEl"
          autoplay
          playsinline
          muted
          class="call-view__video-2"
          :class="callStore.isScreenSharing ? '' : 'call-view__video--variant-1'"
        />
        <div
          v-if="(!callStore.localHasVideo || callStore.cameraOff) && !callStore.isScreenSharing"
          class="call-view__block-camera-off"
        >
          Camera off
        </div>
      </div>
    </main>

    <AppAlertBanner
      v-if="callStore.connectivityWarning && callState !== 'connected'"
      :message="callStore.connectivityWarning"
      class="call-view__app-alert-banner"
    />

    <AppAlertBanner
      v-if="callStore.callError"
      :message="callStore.callError"
      class="call-view__app-alert-banner-2"
    />

    <!-- Controls -->
    <footer
      class="call-view__footer"
    >
      <div
        v-if="isIncoming"
        class="call-view__block-12"
      >
        <button
          type="button"
          class="call-view__button-answer"
          title="Answer"
          @click="answer"
        >
          <PhoneCall class="call-view__phone-call" :stroke-width="2" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="call-view__button-decline"
          title="Decline"
          @click="decline"
        >
          <PhoneOff class="call-view__phone-off" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>

      <div
        v-else-if="showCallControls"
        class="call-view__block-13"
      >
        <button
          v-if="isActive"
          type="button"
          class="call-view__button-2"
          :class="callStore.micMuted ? 'call-view__button--danger' : ''"
          :title="callStore.micMuted ? 'Unmute' : 'Mute'"
          @click="callStore.toggleMic()"
        >
          <MicOff v-if="callStore.micMuted" class="call-view__mic-off" :stroke-width="2" aria-hidden="true" />
          <Mic v-else class="call-view__mic" :stroke-width="2" aria-hidden="true" />
        </button>

        <button
          v-if="isActive"
          type="button"
          class="call-view__button-3"
          :class="callStore.cameraOff ? 'call-view__button--danger-2' : ''"
          :title="callStore.cameraOff ? 'Turn camera on' : 'Turn camera off'"
          @click="callStore.toggleCamera()"
        >
          <VideoOff
            v-if="callStore.cameraOff"
            class="call-view__video-off"
            :stroke-width="2"
            aria-hidden="true"
          />
          <Video v-else class="call-view__video-3" :stroke-width="2" aria-hidden="true" />
        </button>

        <button
          v-if="isActive && canScreenShare"
          type="button"
          class="call-view__button-4"
          :class="
            callStore.isScreenSharing
              ? 'call-view__button--variant-1'
              : ''
          "
          :title="callStore.isScreenSharing ? 'Stop sharing screen' : 'Share screen'"
          @click="callStore.toggleScreenShare()"
        >
          <MonitorOff
            v-if="callStore.isScreenSharing"
            class="call-view__monitor-off"
            :stroke-width="2"
            aria-hidden="true"
          />
          <MonitorUp v-else class="call-view__monitor-up" :stroke-width="2" aria-hidden="true" />
        </button>

        <button
          v-if="isActive && isVideoCall"
          type="button"
          class="call-view__button-switch-camera"
          :class="callStore.switchingCamera ? 'call-view__button-switch-camera--variant-1' : ''"
          title="Switch camera"
          :disabled="callStore.switchingCamera"
          @click="callStore.switchCamera()"
        >
          <FlipHorizontal2
            class="call-view__flip-horizontal2"
            :class="callStore.switchingCamera ? 'call-view__flip-horizontal2--spin' : ''"
            :stroke-width="2"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          class="call-view__button-end-call"
          title="End call"
          @click="hangup"
        >
          <PhoneOff class="call-view__phone-off-2" :stroke-width="2" aria-hidden="true" />
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
        class="call-view__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sas-modal-title"
        @click.self="showSasModal = false"
      >
        <div
          class="app-modal-panel call-view__block-14"
        >
          <div class="call-view__block-15">
            <div class="call-view__block-16">
              <div
                class="call-view__block-17"
                :class="
                  callStore.sasVerified
                    ? 'call-view__block--success'
                    : 'call-view__block--variant-2'
                "
              >
                <ShieldCheck v-if="callStore.sasVerified" class="call-view__shield-check-2" />
                <Shield v-else class="call-view__shield-2" />
              </div>
              <div>
                <h2 id="sas-modal-title" class="call-view__subtitle-call-verification">
                  Call Verification
                </h2>
                <p class="call-view__text-9">Short Authentication String (SAS)</p>
              </div>
            </div>
            <button
              type="button"
              class="call-view__button-5"
              @click="showSasModal = false"
            >
              <X class="call-view__x" />
            </button>
          </div>

          <p class="call-view__text-10">
            Compare these 4 emojis with <strong class="call-view__strong">{{ peerLabel }}</strong
            >. If they match on both screens, your call is direct, end-to-end encrypted, and free
            from relay tampering.
          </p>

          <!-- Emojis display card -->
          <div
            class="call-view__block-18"
          >
            <div class="call-view__block-19">
              <div
                v-for="(emoji, index) in callStore.callSas.emojis"
                :key="index"
                class="app-badge-pop call-view__block-20"
                :style="{ animationDelay: `${80 + index * 60}ms` }"
              >
                {{ emoji }}
              </div>
            </div>
            <span class="call-view__text-11">
              Code: #{{ callStore.callSas.code }}
            </span>
          </div>

          <div class="call-view__block-21">
            <button
              type="button"
              class="call-view__button-6"
              :class="
                callStore.sasVerified
                  ? 'call-view__button--success-2'
                  : 'call-view__button--variant-2-2'
              "
              @click="callStore.toggleSasVerified()"
            >
              <Check v-if="callStore.sasVerified" class="call-view__check" />
              <ShieldCheck v-else class="call-view__shield-check-3" />
              {{ callStore.sasVerified ? "Marked as Verified ✓" : "Mark as Verified" }}
            </button>

            <button
              type="button"
              class="call-view__button-close"
              @click="showSasModal = false"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {














@supports (background-image:linear-gradient(in lab,red,red)) {
.call-view__block-4 {
  --gradient-position: to bottom in oklab;
}
}

@media (hover:hover) {
.call-view__button-back-to:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.call-view__button--variant-2:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.call-view__button-2:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.call-view__button-3:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.call-view__button-4:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.call-view__button-switch-camera:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.call-view__button-back-to:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.call-view__button-2:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.call-view__button-3:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.call-view__button-4:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.call-view__button-switch-camera:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.call-view__button-5:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.call-view__button--success:hover {
  background-color: #00bb7f33;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.call-view__button--success:hover {
  background-color: color-mix(in oklab,var(--color-emerald-500) 20%,transparent);
}
}
}

@media (hover:hover) {
.call-view__button--success-2:hover {
  background-color: #00bb7f40;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.call-view__button--success-2:hover {
  background-color: color-mix(in oklab,var(--color-emerald-500) 25%,transparent);
}
}
}

@media (hover:hover) {
.call-view__button-end-call:hover {
  background-color: var(--color-red-500);
}
}

@media (hover:hover) {
.call-view__button-back-to:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.call-view__button--variant-2:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.call-view__button-2:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.call-view__button-3:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.call-view__button-4:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.call-view__button-switch-camera:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.call-view__button-5:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.call-view__button-close:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.call-view__button--variant-2-2:hover {
  opacity: .9;
}
}



@media (min-width:40rem) {
.call-view__block-20 {
  height: calc(var(--spacing) * 14);
}
}

@media (min-width:40rem) {
.call-view__block-11 {
  height: calc(var(--spacing) * 32);
}
}

@media (min-width:40rem) {
.call-view__block-20 {
  width: calc(var(--spacing) * 14);
}
}

@media (min-width:40rem) {
.call-view__block-11 {
  width: calc(var(--spacing) * 24);
}
}

@media (min-width:40rem) {
.call-view__block-19 {
  gap: calc(var(--spacing) * 3);
}
}

@media (min-width:40rem) {
.call-view__block-13 {
  gap: calc(var(--spacing) * 4);
}
}

@media (min-width:40rem) {
.call-view__block-5 {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.call-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.call-view__footer {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.call-view__footer {
  padding-block: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.call-view__block-20 {
  font-size: var(--text-3xl);
  line-height: var(--leading,var(--text-3xl--line-height));
}
}

@media (min-width:64rem) {
.call-view__block-5 {
  padding-inline: calc(var(--spacing) * 8);
}
}

@media (min-width:64rem) {
.call-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@media (min-width:64rem) {
.call-view__footer {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.call-view__block-2 {
  position: absolute;
}
.call-view__block-4 {
  position: absolute;
}
.call-view__block-11 {
  position: absolute;
}
.call-view__dialog {
  position: fixed;
}
.call-view__block {
  position: relative;
}
.call-view__header {
  position: relative;
}
.call-view__main {
  position: relative;
}
.call-view__app-alert-banner {
  position: relative;
}
.call-view__app-alert-banner-2 {
  position: relative;
}
.call-view__footer {
  position: relative;
}
.call-view__block-2 {
  inset: 0;
}
.call-view__block-4 {
  inset: 0;
}
.call-view__dialog {
  inset: 0;
}
.call-view__block-11 {
  right: calc(var(--spacing) * 4);
}
.call-view__block-11 {
  bottom: calc(var(--spacing) * 28);
}
.call-view__main {
  z-index: 10;
}
.call-view__header {
  z-index: 20;
}
.call-view__block-11 {
  z-index: 20;
}
.call-view__app-alert-banner {
  z-index: 20;
}
.call-view__app-alert-banner-2 {
  z-index: 20;
}
.call-view__footer {
  z-index: 20;
}
.call-view__dialog {
  z-index: 50;
}
.call-view__app-alert-banner {
  margin-inline: calc(var(--spacing) * 4);
}
.call-view__app-alert-banner-2 {
  margin-inline: calc(var(--spacing) * 4);
}
.call-view__block-5 {
  margin-inline: auto;
}
.call-view__main {
  margin-inline: auto;
}
.call-view__block-12 {
  margin-inline: auto;
}
.call-view__block-13 {
  margin-inline: auto;
}
.call-view__app-alert-banner {
  margin-bottom: calc(var(--spacing) * 2);
}
.call-view__app-alert-banner-2 {
  margin-bottom: calc(var(--spacing) * 2);
}
.call-view__block {
  display: flex;
}
.call-view__block-3 {
  display: flex;
}
.call-view__block-5 {
  display: flex;
}
.call-view__main {
  display: flex;
}
.call-view__block-9 {
  display: flex;
}
.call-view__block-camera-off {
  display: flex;
}
.call-view__block-12 {
  display: flex;
}
.call-view__block-13 {
  display: flex;
}
.call-view__dialog {
  display: flex;
}
.call-view__block-15 {
  display: flex;
}
.call-view__block-16 {
  display: flex;
}
.call-view__block-17 {
  display: flex;
}
.call-view__block-18 {
  display: flex;
}
.call-view__block-19 {
  display: flex;
}
.call-view__block-20 {
  display: flex;
}
.call-view__button-6 {
  display: flex;
}
.call-view__audio {
  display: none;
}
.call-view__text-4 {
  display: inline-block;
}
.call-view__button-back-to {
  display: inline-flex;
}
.call-view__button {
  display: inline-flex;
}
.call-view__button-answer {
  display: inline-flex;
}
.call-view__button-decline {
  display: inline-flex;
}
.call-view__button-2 {
  display: inline-flex;
}
.call-view__button-3 {
  display: inline-flex;
}
.call-view__button-4 {
  display: inline-flex;
}
.call-view__button-switch-camera {
  display: inline-flex;
}
.call-view__button-end-call {
  display: inline-flex;
}
.call-view__button-5 {
  display: inline-flex;
}
.call-view__text-4 {
  height: calc(var(--spacing) * 2);
}
.call-view__shield-check {
  height: calc(var(--spacing) * 3.5);
}
.call-view__shield {
  height: calc(var(--spacing) * 3.5);
}
.call-view__arrow-left {
  height: calc(var(--spacing) * 4);
}
.call-view__x {
  height: calc(var(--spacing) * 4);
}
.call-view__check {
  height: calc(var(--spacing) * 4);
}
.call-view__shield-check-3 {
  height: calc(var(--spacing) * 4);
}
.call-view__mic-off {
  height: calc(var(--spacing) * 5);
}
.call-view__mic {
  height: calc(var(--spacing) * 5);
}
.call-view__video-off {
  height: calc(var(--spacing) * 5);
}
.call-view__video-3 {
  height: calc(var(--spacing) * 5);
}
.call-view__monitor-off {
  height: calc(var(--spacing) * 5);
}
.call-view__monitor-up {
  height: calc(var(--spacing) * 5);
}
.call-view__flip-horizontal2 {
  height: calc(var(--spacing) * 5);
}
.call-view__shield-check-2 {
  height: calc(var(--spacing) * 5);
}
.call-view__shield-2 {
  height: calc(var(--spacing) * 5);
}
.call-view__phone-call {
  height: calc(var(--spacing) * 6);
}
.call-view__phone-off {
  height: calc(var(--spacing) * 6);
}
.call-view__phone-off-2 {
  height: calc(var(--spacing) * 6);
}
.call-view__button-5 {
  height: calc(var(--spacing) * 8);
}
.call-view__button-back-to {
  height: calc(var(--spacing) * 10);
}
.call-view__block-17 {
  height: calc(var(--spacing) * 10);
}
.call-view__button-2 {
  height: calc(var(--spacing) * 12);
}
.call-view__button-3 {
  height: calc(var(--spacing) * 12);
}
.call-view__button-4 {
  height: calc(var(--spacing) * 12);
}
.call-view__button-switch-camera {
  height: calc(var(--spacing) * 12);
}
.call-view__block-20 {
  height: calc(var(--spacing) * 13);
}
.call-view__button-answer {
  height: calc(var(--spacing) * 14);
}
.call-view__button-decline {
  height: calc(var(--spacing) * 14);
}
.call-view__button-end-call {
  height: calc(var(--spacing) * 14);
}
.call-view__block-11 {
  height: calc(var(--spacing) * 28);
}
.call-view__block {
  height: 100dvh;
}
.call-view__video {
  height: 100%;
}
.call-view__block-3 {
  height: 100%;
}
.call-view__video-2 {
  height: 100%;
}
.call-view__block-camera-off {
  height: 100%;
}
.call-view__text-4 {
  width: calc(var(--spacing) * 2);
}
.call-view__shield-check {
  width: calc(var(--spacing) * 3.5);
}
.call-view__shield {
  width: calc(var(--spacing) * 3.5);
}
.call-view__arrow-left {
  width: calc(var(--spacing) * 4);
}
.call-view__x {
  width: calc(var(--spacing) * 4);
}
.call-view__check {
  width: calc(var(--spacing) * 4);
}
.call-view__shield-check-3 {
  width: calc(var(--spacing) * 4);
}
.call-view__mic-off {
  width: calc(var(--spacing) * 5);
}
.call-view__mic {
  width: calc(var(--spacing) * 5);
}
.call-view__video-off {
  width: calc(var(--spacing) * 5);
}
.call-view__video-3 {
  width: calc(var(--spacing) * 5);
}
.call-view__monitor-off {
  width: calc(var(--spacing) * 5);
}
.call-view__monitor-up {
  width: calc(var(--spacing) * 5);
}
.call-view__flip-horizontal2 {
  width: calc(var(--spacing) * 5);
}
.call-view__shield-check-2 {
  width: calc(var(--spacing) * 5);
}
.call-view__shield-2 {
  width: calc(var(--spacing) * 5);
}
.call-view__phone-call {
  width: calc(var(--spacing) * 6);
}
.call-view__phone-off {
  width: calc(var(--spacing) * 6);
}
.call-view__phone-off-2 {
  width: calc(var(--spacing) * 6);
}
.call-view__button-5 {
  width: calc(var(--spacing) * 8);
}
.call-view__button-back-to {
  width: calc(var(--spacing) * 10);
}
.call-view__block-17 {
  width: calc(var(--spacing) * 10);
}
.call-view__button-2 {
  width: calc(var(--spacing) * 12);
}
.call-view__button-3 {
  width: calc(var(--spacing) * 12);
}
.call-view__button-4 {
  width: calc(var(--spacing) * 12);
}
.call-view__button-switch-camera {
  width: calc(var(--spacing) * 12);
}
.call-view__block-20 {
  width: calc(var(--spacing) * 13);
}
.call-view__button-answer {
  width: calc(var(--spacing) * 14);
}
.call-view__button-decline {
  width: calc(var(--spacing) * 14);
}
.call-view__button-end-call {
  width: calc(var(--spacing) * 14);
}
.call-view__block-11 {
  width: calc(var(--spacing) * 20);
}
.call-view__block {
  width: 100%;
}
.call-view__video {
  width: 100%;
}
.call-view__block-3 {
  width: 100%;
}
.call-view__header {
  width: 100%;
}
.call-view__block-5 {
  width: 100%;
}
.call-view__main {
  width: 100%;
}
.call-view__video-2 {
  width: 100%;
}
.call-view__block-camera-off {
  width: 100%;
}
.call-view__footer {
  width: 100%;
}
.call-view__block-12 {
  width: 100%;
}
.call-view__block-14 {
  width: 100%;
}
.call-view__button-6 {
  width: 100%;
}
.call-view__button-close {
  width: 100%;
}
.call-view__block-5 {
  max-width: var(--container-6xl);
}
.call-view__main {
  max-width: var(--container-6xl);
}
.call-view__block-12 {
  max-width: var(--container-6xl);
}
.call-view__block-13 {
  max-width: var(--container-lg);
}
.call-view__block-7 {
  max-width: var(--container-sm);
}
.call-view__block-8 {
  max-width: var(--container-sm);
}
.call-view__block-14 {
  max-width: var(--container-sm);
}
.call-view__block-6 {
  min-width: 0;
}
.call-view__block-6 {
  flex: 1;
}
.call-view__main {
  flex: 1;
}
.call-view__text-4 {
  flex-shrink: 0;
}
.call-view__video--variant-1 {
  --scale-x: -1;
  scale: -1 var(--scale-y,1);
}
.call-view__text-4 {
  animation: var(--animate-pulse);
}
.call-view__flip-horizontal2--spin {
  animation: var(--animate-spin);
}
.call-view__button-back-to {
  cursor: pointer;
}
.call-view__button {
  cursor: pointer;
}
.call-view__button-5 {
  cursor: pointer;
}
.call-view__button-6 {
  cursor: pointer;
}
.call-view__button-close {
  cursor: pointer;
}
.call-view__block {
  flex-direction: column;
}
.call-view__main {
  flex-direction: column;
}
.call-view__block-9 {
  flex-direction: column;
}
.call-view__block-18 {
  flex-direction: column;
}
.call-view__block-3 {
  align-items: center;
}
.call-view__block-5 {
  align-items: center;
}
.call-view__button-back-to {
  align-items: center;
}
.call-view__button {
  align-items: center;
}
.call-view__main {
  align-items: center;
}
.call-view__block-9 {
  align-items: center;
}
.call-view__block-camera-off {
  align-items: center;
}
.call-view__block-12 {
  align-items: center;
}
.call-view__button-answer {
  align-items: center;
}
.call-view__button-decline {
  align-items: center;
}
.call-view__block-13 {
  align-items: center;
}
.call-view__button-2 {
  align-items: center;
}
.call-view__button-3 {
  align-items: center;
}
.call-view__button-4 {
  align-items: center;
}
.call-view__button-switch-camera {
  align-items: center;
}
.call-view__button-end-call {
  align-items: center;
}
.call-view__dialog {
  align-items: center;
}
.call-view__block-16 {
  align-items: center;
}
.call-view__block-17 {
  align-items: center;
}
.call-view__button-5 {
  align-items: center;
}
.call-view__block-18 {
  align-items: center;
}
.call-view__block-19 {
  align-items: center;
}
.call-view__block-20 {
  align-items: center;
}
.call-view__button-6 {
  align-items: center;
}
.call-view__block-15 {
  align-items: flex-start;
}
.call-view__block-15 {
  justify-content: space-between;
}
.call-view__block-3 {
  justify-content: center;
}
.call-view__button-back-to {
  justify-content: center;
}
.call-view__main {
  justify-content: center;
}
.call-view__block-camera-off {
  justify-content: center;
}
.call-view__block-12 {
  justify-content: center;
}
.call-view__button-answer {
  justify-content: center;
}
.call-view__button-decline {
  justify-content: center;
}
.call-view__block-13 {
  justify-content: center;
}
.call-view__button-2 {
  justify-content: center;
}
.call-view__button-3 {
  justify-content: center;
}
.call-view__button-4 {
  justify-content: center;
}
.call-view__button-switch-camera {
  justify-content: center;
}
.call-view__button-end-call {
  justify-content: center;
}
.call-view__dialog {
  justify-content: center;
}
.call-view__block-17 {
  justify-content: center;
}
.call-view__button-5 {
  justify-content: center;
}
.call-view__block-18 {
  justify-content: center;
}
.call-view__block-19 {
  justify-content: center;
}
.call-view__block-20 {
  justify-content: center;
}
.call-view__button-6 {
  justify-content: center;
}
.call-view__button {
  gap: calc(var(--spacing) * 1.5);
}
.call-view__button-6 {
  gap: calc(var(--spacing) * 2);
}
.call-view__block-16 {
  gap: calc(var(--spacing) * 2.5);
}
.call-view__block-19 {
  gap: calc(var(--spacing) * 2.5);
}
.call-view__block-5 {
  gap: calc(var(--spacing) * 3);
}
.call-view__block-13 {
  gap: calc(var(--spacing) * 3);
}
.call-view__block-15 {
  gap: calc(var(--spacing) * 3);
}
.call-view__block-18 {
  gap: calc(var(--spacing) * 3);
}
.call-view__block-12 {
  gap: calc(var(--spacing) * 4);
}
.call-view__block-9 {
  gap: calc(var(--spacing) * 5);
}
:where(.call-view__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.call-view__block-21>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.call-view__block-7>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.call-view__block-8>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.call-view__block-14>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
.call-view__text {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.call-view__block {
  overflow: hidden;
}
.call-view__block-11 {
  overflow: hidden;
}
.call-view__block-14 {
  overflow: hidden;
}
.call-view__button-back-to {
  border-radius: var(--radius-2xl);
}
.call-view__block-11 {
  border-radius: var(--radius-2xl);
}
.call-view__button-2 {
  border-radius: var(--radius-2xl);
}
.call-view__button-3 {
  border-radius: var(--radius-2xl);
}
.call-view__button-4 {
  border-radius: var(--radius-2xl);
}
.call-view__button-switch-camera {
  border-radius: var(--radius-2xl);
}
.call-view__block-17 {
  border-radius: var(--radius-2xl);
}
.call-view__block-18 {
  border-radius: var(--radius-2xl);
}
.call-view__block-20 {
  border-radius: var(--radius-2xl);
}
.call-view__button-6 {
  border-radius: var(--radius-2xl);
}
.call-view__button-close {
  border-radius: var(--radius-2xl);
}
.call-view__block-14 {
  border-radius: var(--radius-3xl);
}
.call-view__text-4 {
  border-radius: 3.40282e38px;
}
.call-view__button-answer {
  border-radius: 3.40282e38px;
}
.call-view__button-decline {
  border-radius: 3.40282e38px;
}
.call-view__button-end-call {
  border-radius: 3.40282e38px;
}
.call-view__button {
  border-radius: var(--radius-xl);
}
.call-view__button-5 {
  border-radius: var(--radius-xl);
}
.call-view__button-back-to {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-view__block-11 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-view__button-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-view__button-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-view__button-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-view__button-switch-camera {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-view__block-14 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-view__block-18 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-view__block-20 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-view__footer {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.call-view__header {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.call-view__header {
  border-color: var(--app-border);
}
.call-view__button-back-to {
  border-color: var(--app-border);
}
.call-view__button--variant-2 {
  border-color: var(--app-border);
}
.call-view__footer {
  border-color: var(--app-border);
}
.call-view__button-2 {
  border-color: var(--app-border);
}
.call-view__button-3 {
  border-color: var(--app-border);
}
.call-view__button-4 {
  border-color: var(--app-border);
}
.call-view__button-switch-camera {
  border-color: var(--app-border);
}
.call-view__block-18 {
  border-color: var(--app-border);
}
.call-view__block-20 {
  border-color: var(--app-border);
}
.call-view__block-11 {
  border-color: var(--app-border-strong);
}
.call-view__block-14 {
  border-color: var(--app-border-strong);
}
.call-view__button--variant-1 {
  border-color: var(--app-primary);
}
.call-view__button--success {
  border-color: #00bb7f66;
}
.call-view__block-18 {
  background-color: var(--app-bg);
}
.call-view__button--variant-2-2 {
  background-color: var(--app-primary);
}
.call-view__button--variant-1 {
  background-color: var(--app-primary-soft);
}
.call-view__text-4 {
  background-color: var(--app-success);
}
.call-view__button-answer {
  background-color: var(--app-success);
}
.call-view__block-11 {
  background-color: var(--app-surface);
}
.call-view__block-14 {
  background-color: var(--app-surface);
}
.call-view__block-20 {
  background-color: var(--app-surface);
}
.call-view__button-back-to {
  background-color: var(--app-surface-soft);
}
.call-view__button--variant-2 {
  background-color: var(--app-surface-soft);
}
.call-view__button-2 {
  background-color: var(--app-surface-soft);
}
.call-view__button-3 {
  background-color: var(--app-surface-soft);
}
.call-view__button-4 {
  background-color: var(--app-surface-soft);
}
.call-view__button-switch-camera {
  background-color: var(--app-surface-soft);
}
.call-view__block--variant-2 {
  background-color: var(--app-surface-soft);
}
.call-view__header {
  background-color: var(--nav-bg);
}
.call-view__footer {
  background-color: var(--nav-bg);
}
.call-view__block-2 {
  background-color: var(--ui-black);
}
.call-view__dialog {
  background-color: var(--ui-black);
}
.call-view__button--success {
  background-color: #00bb7f1a;
}
.call-view__block--success {
  background-color: #00bb7f26;
}
.call-view__button--success-2 {
  background-color: #00bb7f26;
}
.call-view__button--danger {
  background-color: #fb2c3626;
}
.call-view__button--danger-2 {
  background-color: #fb2c3626;
}
.call-view__button-decline {
  background-color: var(--color-red-600);
}
.call-view__button-end-call {
  background-color: var(--color-red-600);
}
.call-view__block-4 {
  --gradient-position: to bottom;
}
.call-view__block-4 {
  background-image: linear-gradient(var(--gradient-stops,));
}
.call-view__block-4 {
  --gradient-from: var(--app-surface);
  --gradient-stops: var(--gradient-via-stops,var(--gradient-position,), var(--app-surface) var(--gradient-from-position,0%), var(--gradient-to,#0000) var(--gradient-to-position,100%));
}
.call-view__block-4 {
  --gradient-via: var(--app-bg);
  --gradient-via-stops: var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--app-bg) var(--gradient-via-position,50%), var(--gradient-to,#0000) var(--gradient-to-position,100%);
  --gradient-stops: var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--app-bg) var(--gradient-via-position,50%), var(--gradient-to,#0000) var(--gradient-to-position,100%);
}
.call-view__block-4 {
  --gradient-to: var(--ui-black);
  --gradient-stops: var(--gradient-via-stops,var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--ui-black) var(--gradient-to-position,100%));
}
.call-view__video {
  object-fit: cover;
}
.call-view__video-2 {
  object-fit: cover;
}
.call-view__block-14 {
  padding: calc(var(--spacing) * 6);
}
.call-view__button {
  padding-inline: calc(var(--spacing) * 2.5);
}
.call-view__block-5 {
  padding-inline: calc(var(--spacing) * 4);
}
.call-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.call-view__footer {
  padding-inline: calc(var(--spacing) * 4);
}
.call-view__dialog {
  padding-inline: calc(var(--spacing) * 4);
}
.call-view__block-18 {
  padding-inline: calc(var(--spacing) * 4);
}
.call-view__button-6 {
  padding-inline: calc(var(--spacing) * 4);
}
.call-view__block-3 {
  padding-inline: calc(var(--spacing) * 6);
}
.call-view__button {
  padding-block: var(--spacing);
}
.call-view__button-close {
  padding-block: calc(var(--spacing) * 2.5);
}
.call-view__block-5 {
  padding-block: calc(var(--spacing) * 3);
}
.call-view__button-6 {
  padding-block: calc(var(--spacing) * 3);
}
.call-view__footer {
  padding-block: calc(var(--spacing) * 4);
}
.call-view__block-18 {
  padding-block: calc(var(--spacing) * 5);
}
.call-view__dialog {
  padding-block: calc(var(--spacing) * 6);
}
.call-view__main {
  padding-block: calc(var(--spacing) * 8);
}
.call-view__block-3 {
  text-align: center;
}
.call-view__block-7 {
  text-align: center;
}
.call-view__block-8 {
  text-align: center;
}
.call-view__block-9 {
  text-align: center;
}
.call-view__button-close {
  text-align: center;
}
.call-view__text-11 {
  font-family: var(--font-mono);
}
.call-view__title {
  font-size: var(--text-2xl);
  line-height: var(--leading,var(--text-2xl--line-height));
}
.call-view__block-20 {
  font-size: var(--text-2xl);
  line-height: var(--leading,var(--text-2xl--line-height));
}
.call-view__subtitle-call-verification {
  font-size: var(--text-base);
  line-height: var(--leading,var(--text-base--line-height));
}
.call-view__block-3 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.call-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.call-view__text-3 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.call-view__text-5 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.call-view__text-6 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.call-view__text-7 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.call-view__text-8 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.call-view__button-6 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.call-view__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.call-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.call-view__text-9 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.call-view__text-10 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.call-view__button-close {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.call-view__block-camera-off {
  font-size: 10px;
}
.call-view__text-11 {
  font-size: 11px;
}
.call-view__text-5 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.call-view__text-6 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.call-view__text-7 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.call-view__text-10 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.call-view__text {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.call-view__title {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.call-view__subtitle-call-verification {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.call-view__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.call-view__button-close {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.call-view__button-6 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.call-view__title {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.call-view__text-3 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.call-view__text-11 {
  --tracking: var(--tracking-widest);
  letter-spacing: var(--tracking-widest);
}
.call-view__text-5 {
  color: var(--app-danger);
}
.call-view__block-3 {
  color: var(--app-muted);
}
.call-view__text-2 {
  color: var(--app-muted);
}
.call-view__shield {
  color: var(--app-muted);
}
.call-view__text-6 {
  color: var(--app-muted);
}
.call-view__text-7 {
  color: var(--app-muted);
}
.call-view__text-8 {
  color: var(--app-muted);
}
.call-view__block-camera-off {
  color: var(--app-muted);
}
.call-view__text-9 {
  color: var(--app-muted);
}
.call-view__button-5 {
  color: var(--app-muted);
}
.call-view__text-10 {
  color: var(--app-muted);
}
.call-view__text-11 {
  color: var(--app-muted);
}
.call-view__button-close {
  color: var(--app-muted);
}
.call-view__button--variant-1 {
  color: var(--app-primary);
}
.call-view__block--variant-2 {
  color: var(--app-primary);
}
.call-view__button--variant-2-2 {
  color: var(--app-primary-text);
}
.call-view__subtitle-call-verification {
  color: var(--app-text);
}
.call-view__strong {
  color: var(--app-text);
}
.call-view__button-back-to {
  color: var(--app-text-soft);
}
.call-view__button--variant-2 {
  color: var(--app-text-soft);
}
.call-view__button-2 {
  color: var(--app-text-soft);
}
.call-view__button-3 {
  color: var(--app-text-soft);
}
.call-view__button-4 {
  color: var(--app-text-soft);
}
.call-view__button-switch-camera {
  color: var(--app-text-soft);
}
.call-view__button--success {
  color: var(--color-emerald-300);
}
.call-view__button--success-2 {
  color: var(--color-emerald-300);
}
.call-view__shield-check {
  color: var(--color-emerald-400);
}
.call-view__block--success {
  color: var(--color-emerald-400);
}
.call-view__button--danger {
  color: var(--color-red-400);
}
.call-view__button--danger-2 {
  color: var(--color-red-400);
}
.call-view__button-answer {
  color: var(--color-white);
}
.call-view__button-decline {
  color: var(--color-white);
}
.call-view__button-end-call {
  color: var(--color-white);
}
.call-view__text-11 {
  text-transform: uppercase;
}
.call-view__button-switch-camera--variant-1 {
  opacity: .5;
}
.call-view__block-11 {
  --shadow: 0 25px 50px -12px var(--shadow-color,#00000040);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 25px 50px -12px var(--shadow-color,#00000040);
}
.call-view__block-14 {
  --shadow: 0 25px 50px -12px var(--shadow-color,#00000040);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 25px 50px -12px var(--shadow-color,#00000040);
}
.call-view__block-20 {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.call-view__robo-avatar {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(4px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(4px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.call-view__robo-avatar {
  --ring-color: var(--app-primary-soft);
}
.call-view__dialog {
  --backdrop-blur: blur(var(--blur-xs));
  -webkit-backdrop-filter: blur(var(--blur-xs)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-xs)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.call-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.call-view__button-6 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.call-view__button-answer {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.call-view__button-decline {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.call-view__flip-horizontal2 {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.call-view__button-end-call {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.call-view__button {
  -webkit-user-select: none;
  user-select: none;
}
.call-view__button-6 {
  -webkit-user-select: none;
  user-select: none;
}
.call-view__button-back-to:focus {
  --outline-style: none;
  outline-style: none;
}
.call-view__button-back-to:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.call-view__button-back-to:focus-visible {
  --ring-color: var(--app-primary);
}
.call-view__button-answer:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.call-view__button-decline:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.call-view__button-end-call:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
[data-theme="light"] .call-view__button--success {
  color: var(--app-success);
}
[data-theme="light"] .call-view__button--success-2 {
  color: var(--app-success);
}
[data-theme="light"] .call-view__shield-check {
  color: var(--app-success);
}
[data-theme="light"] .call-view__block--success {
  color: var(--app-success);
}
[data-theme="light"] .call-view__button--danger {
  color: var(--app-danger);
}
[data-theme="light"] .call-view__button--danger-2 {
  color: var(--app-danger);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.call-view__button--success {
  border-color: color-mix(in oklab,var(--color-emerald-500) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-view__dialog {
  background-color: color-mix(in oklab,var(--ui-black) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-view__button--success {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-view__block--success {
  background-color: color-mix(in oklab,var(--color-emerald-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-view__button--success-2 {
  background-color: color-mix(in oklab,var(--color-emerald-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-view__button--danger {
  background-color: color-mix(in oklab,var(--color-red-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-view__button--danger-2 {
  background-color: color-mix(in oklab,var(--color-red-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-view__button-back-to:focus-visible {
  --ring-color: color-mix(in srgb,var(--app-primary) 60%,transparent);
}
}
}
</style>
