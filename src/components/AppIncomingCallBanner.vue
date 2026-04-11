<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { PhoneCall, PhoneOff } from "lucide-vue-next";
import { useCallStore } from "@/stores/calls";
import { useIdentityStore } from "@/stores/identity";
import { useProfileCache } from "@/composables/useProfileCache";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { dmRoomId } from "@/lib/crypto";

const callStore = useCallStore();
const identity = useIdentityStore();
const router = useRouter();
const { displayName, profilePicture } = useProfileCache();

const visible = computed(() => callStore.callState === "incoming");
const callerPubkey = computed(() => callStore.activePeerPubkey);
const isVideo = computed(() => callStore.incomingCall?.media?.video);

async function answer() {
  try {
    await callStore.acceptIncomingCall();
    const pk = callerPubkey.value;
    if (pk && identity.pubkeyHex) {
      const roomId = await dmRoomId(identity.pubkeyHex, pk);
      router.push(`/room/${roomId}`);
    }
  } catch {
    // error lives in callStore.callError
  }
}

function decline() {
  callStore.declineIncomingCall();
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
        :pubkey="callerPubkey"
        :src="profilePicture(callerPubkey)"
        size="sm"
        :story-ring="false"
      />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-white truncate">
          {{ displayName(callerPubkey) }}
        </p>
        <p class="text-xs text-zinc-400">
          {{ isVideo ? "Incoming video call" : "Incoming audio call" }}
        </p>
      </div>
      <button
        @click="answer"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors active:scale-95"
      >
        <PhoneCall class="w-3.5 h-3.5" aria-hidden="true" />
        Answer
      </button>
      <button
        @click="decline"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/14 text-xs font-semibold text-white transition-colors active:scale-95"
      >
        <PhoneOff class="w-3.5 h-3.5" aria-hidden="true" />
        Decline
      </button>
    </div>
  </Transition>
</template>
