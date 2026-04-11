<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { PhoneOff } from "lucide-vue-next";
import { useCallStore } from "@/stores/calls";
import { useProfileCache } from "@/composables/useProfileCache";
import RoboAvatar from "@/components/RoboAvatar.vue";

const callStore = useCallStore();
const { displayName, profilePicture } = useProfileCache();

const ACTIVE_STATES = new Set(["requesting-media", "outgoing", "connecting", "connected"]);
const visible = computed(() => ACTIVE_STATES.has(callStore.callState));
const peerPubkey = computed(() => callStore.activePeerPubkey);

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

watch(
  () => callStore.callState,
  (state) => {
    if (state === "connected") startTimer();
    else stopTimer();
  },
);

onBeforeUnmount(stopTimer);

function formatDuration(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

const stateLabel = computed(() => {
  switch (callStore.callState) {
    case "requesting-media":
      return "Setting up…";
    case "outgoing":
      return "Calling…";
    case "connecting":
      return "Connecting…";
    case "connected":
      return formatDuration(durationSeconds.value);
    default:
      return "";
  }
});

function hangup() {
  callStore.hangup();
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="-translate-y-full opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="-translate-y-full opacity-0"
  >
    <div
      v-if="visible"
      class="sticky top-14 z-40 flex items-center gap-3 px-4 py-2.5 bg-zinc-900/95 backdrop-blur-xl border-b border-white/7"
    >
      <RoboAvatar
        :pubkey="peerPubkey"
        :src="profilePicture(peerPubkey)"
        size="sm"
        :story-ring="false"
      />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-white truncate">
          {{ displayName(peerPubkey) }}
        </p>
        <p class="text-xs text-zinc-400">
          {{ stateLabel }}
        </p>
      </div>
      <span
        v-if="callStore.callState === 'connected'"
        class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
      ></span>
      <button
        @click="hangup"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-700 hover:bg-red-600 text-xs font-bold text-white transition-colors active:scale-95 shrink-0"
      >
        <PhoneOff class="w-3.5 h-3.5" aria-hidden="true" />
        End
      </button>
    </div>
  </Transition>
</template>
