<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ChevronDown, ChevronUp, PhoneOff } from "lucide-vue-next";
import { useCallStore } from "@/stores/calls";
import { useProfileCache } from "@/composables/useProfileCache";
import RoboAvatar from "@/components/RoboAvatar.vue";

const callStore = useCallStore();
const { displayName, profilePicture } = useProfileCache();

const ACTIVE_STATES = new Set(["requesting-media", "outgoing", "connecting", "connected"]);
const callState = computed(() => callStore.callState);
const callMedia = computed(() => callStore.callMedia);
const peerPubkey = computed(() => callStore.activePeerPubkey);
const localHasVideo = computed(() => callStore.localHasVideo);
const remoteHasVideo = computed(() => callStore.remoteHasVideo);
const localCallStream = computed(() => callStore.localCallStream);
const remoteCallStream = computed(() => callStore.remoteCallStream);

// Visible whenever there's an active call (to ensure audio element stays mounted)
const active = computed(() => ACTIVE_STATES.has(callState.value));
// Show the visual video panel only for video calls
const showVideo = computed(
  () => active.value && (callMedia.value.video || localHasVideo.value || remoteHasVideo.value),
);

// Duration timer
const durationSeconds = ref(0);
let durationInterval = null;

function startTimer() {
  durationSeconds.value = 0;
  clearInterval(durationInterval);
  durationInterval = setInterval(() => {
    durationSeconds.value++;
  }, 1000);
}
function stopTimer() {
  clearInterval(durationInterval);
  durationInterval = null;
  durationSeconds.value = 0;
}
watch(callState, (state) => {
  if (state === "connected") startTimer();
  else stopTimer();
});
onBeforeUnmount(stopTimer);

function formatDuration(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const stateLabel = computed(() => {
  switch (callState.value) {
    case "requesting-media":
      return "Setting up…";
    case "outgoing":
      return callMedia.value.video ? "Calling with video…" : "Calling…";
    case "connecting":
      return "Connecting…";
    case "connected":
      return formatDuration(durationSeconds.value);
    default:
      return "";
  }
});

// Media element refs
const localVideoEl = ref(null);
const remoteVideoEl = ref(null);
const remoteAudioEl = ref(null);

function syncMedia(element, stream, muted = false) {
  if (!element) return;
  if (element.srcObject !== (stream || null)) element.srcObject = stream || null;
  if ("muted" in element) element.muted = muted;
}

watch([localVideoEl, localCallStream], ([el, stream]) => syncMedia(el, stream, true), {
  immediate: true,
});
watch([remoteVideoEl, remoteCallStream], ([el, stream]) => syncMedia(el, stream, false), {
  immediate: true,
});
watch([remoteAudioEl, remoteCallStream], ([el, stream]) => syncMedia(el, stream, false), {
  immediate: true,
});

function hangup() {
  callStore.hangup();
}

// Minimized state for the video overlay
const minimized = ref(false);
</script>

<template>
  <!-- Remote audio: always mounted while a call is active so audio persists across route changes -->
  <audio v-if="active" ref="remoteAudioEl" autoplay playsinline class="hidden" />

  <!-- Floating video overlay: only shown for video calls -->
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="translate-y-4 opacity-0 scale-95"
    enter-to-class="translate-y-0 opacity-100 scale-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100 scale-100"
    leave-to-class="translate-y-4 opacity-0 scale-95"
  >
    <div
      v-if="showVideo"
      class="fixed bottom-4 right-4 z-50 w-72 bg-zinc-900 border border-white/10 rounded-xl overflow-hidden"
    >
      <!-- Header bar -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-white/7">
        <RoboAvatar
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="sm"
          :story-ring="false"
        />
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-white truncate">{{ displayName(peerPubkey) }}</p>
          <p class="text-xs text-zinc-400">{{ stateLabel }}</p>
        </div>
        <button
          @click="minimized = !minimized"
          class="flex items-center justify-center w-6 h-6 text-zinc-500 hover:text-white transition-colors rounded"
          :title="minimized ? 'Expand' : 'Minimize'"
        >
          <ChevronUp v-if="minimized" class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
          <ChevronDown v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
        </button>
        <button
          @click="hangup"
          class="flex items-center justify-center w-7 h-7 rounded-full bg-red-700 hover:bg-red-600 transition-colors shrink-0"
          title="End call"
        >
          <PhoneOff class="w-3.5 h-3.5 text-white" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>

      <!-- Video feeds -->
      <div v-if="!minimized" class="relative bg-zinc-950">
        <!-- Remote video (main) -->
        <div class="aspect-video relative flex items-center justify-center text-xs text-zinc-500">
          <video
            v-show="remoteHasVideo"
            ref="remoteVideoEl"
            autoplay
            playsinline
            class="absolute inset-0 h-full w-full object-cover"
          />
          <span v-if="!remoteHasVideo">
            {{
              callState === "connected"
                ? "Waiting for remote video…"
                : "Remote video will appear here."
            }}
          </span>
        </div>

        <!-- Local video (PIP, bottom-left) -->
        <div
          class="absolute bottom-2 left-2 w-20 aspect-video rounded overflow-hidden bg-zinc-900 border border-white/10"
        >
          <video
            v-show="localHasVideo"
            ref="localVideoEl"
            autoplay
            playsinline
            muted
            class="h-full w-full object-cover scale-x-[-1]"
          />
          <div
            v-if="!localHasVideo"
            class="h-full w-full flex items-center justify-center text-[9px] text-zinc-600"
          >
            No cam
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
