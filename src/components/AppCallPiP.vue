<script setup>
import { computed, ref } from "vue";
import { Maximize2, PhoneOff } from "@/icons";
import { useCallStore } from "@/stores/calls";
import { useProfileStore } from "@/stores/profiles";
import { formatCallDuration, useCallDuration } from "@/composables/useCallDuration";
import { useCallMediaElements } from "@/composables/useCallMediaElements";
import { useCallNavigation } from "@/composables/useCallNavigation";
import RoboAvatar from "@/components/RoboAvatar.vue";

const callStore = useCallStore();
const { displayName, profilePicture } = useProfileStore();
const { openCallSurface } = useCallNavigation();

const ACTIVE_STATES = new Set(["requesting-media", "outgoing", "connecting", "connected"]);
const visible = computed(() => ACTIVE_STATES.has(callStore.callState));
const peerPubkey = computed(() => callStore.activePeerPubkey);
const showVideo = computed(
  () =>
    visible.value &&
    (callStore.callMedia.video || callStore.localHasVideo || callStore.remoteHasVideo),
);

const { durationSeconds } = useCallDuration(computed(() => callStore.callState));

const stateLabel = computed(() => {
  switch (callStore.callState) {
    case "requesting-media":
      return "Setting up…";
    case "outgoing":
      return "Calling…";
    case "connecting":
      return "Connecting…";
    case "connected":
      return callStore.callSas
        ? `${formatCallDuration(durationSeconds.value)} · ${callStore.callSas.emojis.join(" ")}`
        : formatCallDuration(durationSeconds.value);
    default:
      return "";
  }
});

const remoteAudioEl = ref(null);
const remoteVideoEl = ref(null);

useCallMediaElements({
  localVideoEl: ref(null),
  remoteVideoEl,
  remoteAudioEl,
  localCallStream: computed(() => null),
  remoteCallStream: computed(() => callStore.remoteCallStream),
});

function returnToCall() {
  void openCallSurface(peerPubkey.value);
}

function hangup() {
  callStore.hangup();
}
</script>

<template>
  <audio v-if="visible" ref="remoteAudioEl" autoplay playsinline class="call-pip__audio" />

  <div v-if="visible" class="call-pip">
    <div v-if="showVideo" class="call-pip__stage">
      <video
        v-show="callStore.remoteHasVideo"
        ref="remoteVideoEl"
        autoplay
        playsinline
        class="call-pip__video"
      />
      <div v-if="!callStore.remoteHasVideo" class="call-pip__wait">
        <span class="call-pip__wait-dot" aria-hidden="true" />
        Waiting for video…
      </div>
    </div>

    <div class="call-pip__bar">
      <RoboAvatar
        v-if="!showVideo"
        :pubkey="peerPubkey"
        :src="profilePicture(peerPubkey)"
        size="sm"
      />
      <div class="call-pip__body">
        <p class="call-pip__name">{{ displayName(peerPubkey) }}</p>
        <p class="call-pip__state">{{ stateLabel }}</p>
      </div>
      <button
        type="button"
        class="call-pip__btn"
        title="Return to call"
        aria-label="Return to call"
        @click="returnToCall"
      >
        <Maximize2 class="call-pip__icon" :stroke-width="1.9" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="call-pip__btn call-pip__btn--end"
        title="End call"
        aria-label="End call"
        @click="hangup"
      >
        <PhoneOff class="call-pip__icon" :stroke-width="1.9" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Ledger pass: a floating call card, the one surface allowed a shadow. */

.call-pip {
  position: fixed;
  right: var(--app-space-4);
  bottom: calc(var(--app-space-4) + env(safe-area-inset-bottom, 0px));
  z-index: 50;
  width: min(288px, calc(100vw - 2 * var(--app-space-4)));
  overflow: hidden;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  box-shadow: 0 24px 56px -28px rgba(0, 0, 0, 0.65);
  animation: call-pip-in 340ms var(--app-ease-emphasized) both;
}

@keyframes call-pip-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.call-pip__audio {
  display: none;
}

/* ---- Video ---- */

.call-pip__stage {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--ui-black);
}

.call-pip__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.call-pip__wait {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: color-mix(in oklab, var(--ui-white) 62%, transparent);
}

.call-pip__wait-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-warning);
  animation: ledger-dot-pulse 1.6s var(--app-ease-standard) infinite;
}

/* ---- Bar ---- */

.call-pip__bar {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-top: 1px solid var(--app-border);
}

.call-pip__body {
  flex: 1;
  min-width: 0;
}

.call-pip__name {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.call-pip__state {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.call-pip__btn {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.call-pip__btn:active {
  transform: translateY(1px);
}

.call-pip__btn--end {
  border-color: color-mix(in oklab, var(--app-danger) 34%, var(--app-border));
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

.call-pip__icon {
  width: 13px;
  height: 13px;
}

.call-pip__btn:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

@media (hover: hover) {
  .call-pip__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .call-pip__btn--end:hover {
    border-color: var(--app-danger);
    background: color-mix(in oklab, var(--app-danger) 16%, var(--app-surface));
    color: var(--app-danger);
  }

  .call-pip__stage:hover .call-pip__wait {
    color: var(--ui-white);
  }
}

@media (pointer: coarse) {
  .call-pip__btn {
    width: var(--app-touch-h);
    height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .call-pip,
  .call-pip__wait-dot {
    animation: none;
  }

  .call-pip__btn {
    transition: none;
  }
}
</style>
