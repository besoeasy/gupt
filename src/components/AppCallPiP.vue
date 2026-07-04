<script setup>
import { computed, ref } from "vue";
import { Maximize2, PhoneOff } from "lucide-vue-next";
import { useCallStore } from "@/stores/calls";
import { useProfileCache } from "@/composables/useProfileCache";
import { formatCallDuration, useCallDuration } from "@/composables/useCallDuration";
import { useCallMediaElements } from "@/composables/useCallMediaElements";
import { useCallNavigation } from "@/composables/useCallNavigation";
import RoboAvatar from "@/components/RoboAvatar.vue";

const callStore = useCallStore();
const { displayName, profilePicture } = useProfileCache();
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
      return formatCallDuration(durationSeconds.value);
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
  <audio v-if="visible" ref="remoteAudioEl" autoplay playsinline class="hidden" />

  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="visible"
      class="fixed bottom-4 right-4 z-50 w-72 overflow-hidden rounded-2xl border border-(--app-border) bg-(--app-surface) shadow-2xl"
    >
      <div v-if="showVideo" class="relative aspect-video bg-black">
        <video
          v-show="callStore.remoteHasVideo"
          ref="remoteVideoEl"
          autoplay
          playsinline
          class="h-full w-full object-cover"
        />
        <div
          v-if="!callStore.remoteHasVideo"
          class="flex h-full items-center justify-center text-[11px] text-(--app-muted)"
        >
          Waiting for video…
        </div>
      </div>

      <div class="flex items-center gap-3 px-3 py-2.5">
        <RoboAvatar
          v-if="!showVideo"
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="sm"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{{ displayName(peerPubkey) }}</p>
          <p class="text-xs text-(--app-muted)">{{ stateLabel }}</p>
        </div>
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          title="Return to call"
          @click="returnToCall"
        >
          <Maximize2 class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-white transition-colors hover:bg-red-500 active:scale-95"
          title="End call"
          @click="hangup"
        >
          <PhoneOff class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Transition>
</template>
