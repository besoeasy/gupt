<script setup>
import { computed, ref } from "vue";
import { Maximize2, PhoneOff } from "@lucide/vue";
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
  <audio v-if="visible" ref="remoteAudioEl" autoplay playsinline class="app-call-pi-p__audio" />

  <Transition
    enter-active-class="app-call-pi-p__enter-active-class"
    enter-from-class="app-call-pi-p__enter-from-class"
    enter-to-class="app-call-pi-p__enter-to-class"
    leave-active-class="app-call-pi-p__leave-active-class"
    leave-from-class="app-call-pi-p__leave-from-class"
    leave-to-class="app-call-pi-p__leave-to-class"
  >
    <div
      v-if="visible"
      class="app-call-pi-p__block"
    >
      <div v-if="showVideo" class="app-call-pi-p__block-2">
        <video
          v-show="callStore.remoteHasVideo"
          ref="remoteVideoEl"
          autoplay
          playsinline
          class="app-call-pi-p__video"
        />
        <div
          v-if="!callStore.remoteHasVideo"
          class="app-call-pi-p__block-3"
        >
          Waiting for video…
        </div>
      </div>

      <div class="app-call-pi-p__block-4">
        <RoboAvatar
          v-if="!showVideo"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="sm"
        />
        <div class="app-call-pi-p__block-5">
          <p class="app-call-pi-p__text">{{ displayName(peerPubkey) }}</p>
          <p class="app-call-pi-p__text-2">{{ stateLabel }}</p>
        </div>
        <button
          type="button"
          class="app-call-pi-p__button-return-to"
          title="Return to call"
          @click="returnToCall"
        >
          <Maximize2 class="app-call-pi-p__maximize2" :stroke-width="2" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="app-call-pi-p__button-end-call"
          title="End call"
          @click="hangup"
        >
          <PhoneOff class="app-call-pi-p__phone-off" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
@media (hover:hover) {
.app-call-pi-p__button-return-to:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.app-call-pi-p__button-return-to:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.app-call-pi-p__button-end-call:hover {
  background-color: var(--color-red-500);
}
}

@media (hover:hover) {
.app-call-pi-p__button-return-to:hover {
  color: var(--app-text);
}
}

@layer gupt-components {
.app-call-pi-p__block {
  position: fixed;
}
.app-call-pi-p__block-2 {
  position: relative;
}
.app-call-pi-p__block {
  right: calc(var(--spacing) * 4);
}
.app-call-pi-p__block {
  bottom: calc(var(--spacing) * 4);
}
.app-call-pi-p__block {
  z-index: 50;
}
.app-call-pi-p__block-3 {
  display: flex;
}
.app-call-pi-p__block-4 {
  display: flex;
}
.app-call-pi-p__audio {
  display: none;
}
.app-call-pi-p__button-return-to {
  display: inline-flex;
}
.app-call-pi-p__button-end-call {
  display: inline-flex;
}
.app-call-pi-p__block-2 {
  aspect-ratio: var(--aspect-video);
}
.app-call-pi-p__maximize2 {
  height: calc(var(--spacing) * 4);
}
.app-call-pi-p__phone-off {
  height: calc(var(--spacing) * 4);
}
.app-call-pi-p__button-return-to {
  height: calc(var(--spacing) * 9);
}
.app-call-pi-p__button-end-call {
  height: calc(var(--spacing) * 9);
}
.app-call-pi-p__video {
  height: 100%;
}
.app-call-pi-p__block-3 {
  height: 100%;
}
.app-call-pi-p__maximize2 {
  width: calc(var(--spacing) * 4);
}
.app-call-pi-p__phone-off {
  width: calc(var(--spacing) * 4);
}
.app-call-pi-p__button-return-to {
  width: calc(var(--spacing) * 9);
}
.app-call-pi-p__button-end-call {
  width: calc(var(--spacing) * 9);
}
.app-call-pi-p__block {
  width: calc(var(--spacing) * 72);
}
.app-call-pi-p__video {
  width: 100%;
}
.app-call-pi-p__block-5 {
  min-width: 0;
}
.app-call-pi-p__block-5 {
  flex: 1;
}
.app-call-pi-p__enter-to-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.app-call-pi-p__leave-from-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.app-call-pi-p__leave-to-class {
  --translate-y: calc(var(--spacing) * 4);
  translate: var(--translate-x,0) calc(var(--spacing) * 4);
}
.app-call-pi-p__enter-from-class {
  --translate-y: calc(var(--spacing) * 6);
  translate: var(--translate-x,0) calc(var(--spacing) * 6);
}
.app-call-pi-p__enter-from-class {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.app-call-pi-p__leave-to-class {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.app-call-pi-p__enter-to-class {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
.app-call-pi-p__leave-from-class {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
.app-call-pi-p__block-3 {
  align-items: center;
}
.app-call-pi-p__block-4 {
  align-items: center;
}
.app-call-pi-p__button-return-to {
  align-items: center;
}
.app-call-pi-p__button-end-call {
  align-items: center;
}
.app-call-pi-p__block-3 {
  justify-content: center;
}
.app-call-pi-p__button-return-to {
  justify-content: center;
}
.app-call-pi-p__button-end-call {
  justify-content: center;
}
.app-call-pi-p__block-4 {
  gap: calc(var(--spacing) * 3);
}
.app-call-pi-p__text {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.app-call-pi-p__block {
  overflow: hidden;
}
.app-call-pi-p__block {
  border-radius: var(--radius-2xl);
}
.app-call-pi-p__button-return-to {
  border-radius: var(--radius-xl);
}
.app-call-pi-p__button-end-call {
  border-radius: var(--radius-xl);
}
.app-call-pi-p__block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.app-call-pi-p__button-return-to {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.app-call-pi-p__block {
  border-color: var(--app-border);
}
.app-call-pi-p__button-return-to {
  border-color: var(--app-border);
}
.app-call-pi-p__block {
  background-color: var(--app-surface);
}
.app-call-pi-p__button-return-to {
  background-color: var(--app-surface-soft);
}
.app-call-pi-p__block-2 {
  background-color: var(--ui-black);
}
.app-call-pi-p__button-end-call {
  background-color: var(--color-red-600);
}
.app-call-pi-p__video {
  object-fit: cover;
}
.app-call-pi-p__block-4 {
  padding-inline: calc(var(--spacing) * 3);
}
.app-call-pi-p__block-4 {
  padding-block: calc(var(--spacing) * 2.5);
}
.app-call-pi-p__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.app-call-pi-p__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.app-call-pi-p__block-3 {
  font-size: 11px;
}
.app-call-pi-p__text {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.app-call-pi-p__block-3 {
  color: var(--app-muted);
}
.app-call-pi-p__text-2 {
  color: var(--app-muted);
}
.app-call-pi-p__button-return-to {
  color: var(--app-text-soft);
}
.app-call-pi-p__button-end-call {
  color: var(--color-white);
}
.app-call-pi-p__enter-from-class {
  opacity: 0;
}
.app-call-pi-p__leave-to-class {
  opacity: 0;
}
.app-call-pi-p__enter-to-class {
  opacity: 1;
}
.app-call-pi-p__leave-from-class {
  opacity: 1;
}
.app-call-pi-p__block {
  --shadow: 0 25px 50px -12px var(--shadow-color,#00000040);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 25px 50px -12px var(--shadow-color,#00000040);
}
.app-call-pi-p__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.app-call-pi-p__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.app-call-pi-p__button-end-call {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.app-call-pi-p__leave-active-class {
  --duration: .2s;
  transition-duration: .2s;
}
.app-call-pi-p__enter-active-class {
  --duration: .34s;
  transition-duration: .34s;
}
.app-call-pi-p__leave-active-class {
  --ease: var(--app-ease-in);
  transition-timing-function: var(--app-ease-in);
}
.app-call-pi-p__enter-active-class {
  --ease: var(--app-ease-spring);
  transition-timing-function: var(--app-ease-spring);
}
.app-call-pi-p__button-end-call:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
}
}
</style>
