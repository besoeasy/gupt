<script setup>
import { computed } from "vue";
import { PhoneCall, PhoneOff } from "@lucide/vue";
import { useCallStore } from "@/stores/calls";
import { useProfileCache } from "@/composables/useProfileCache";
import RoboAvatar from "@/components/RoboAvatar.vue";

const callStore = useCallStore();
const { displayName, profilePicture } = useProfileCache();

defineProps({
  belowNav: { type: Boolean, default: true },
});

const callerPubkey = computed(() => callStore.activePeerPubkey);
const isVideo = computed(() => callStore.incomingCall?.media?.video);

async function answer() {
  try {
    await callStore.acceptIncomingCall();
  } catch {
    
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
      class="sticky z-40 flex items-center gap-3 border-b border-(--nav-border) bg-(--nav-bg) px-4 py-2.5 backdrop-blur-[22px]"
      :class="belowNav ? 'top-14' : 'top-0'"
    >
      <RoboAvatar :pubkey="callerPubkey" :src="profilePicture(callerPubkey)" size="sm" />
      <div class="flex-1 min-w-0">
        <p class="truncate text-sm font-semibold">
          {{ displayName(callerPubkey) }}
        </p>
        <p class="text-xs text-(--app-muted)">
          {{ isVideo ? "Incoming video call" : "Incoming audio call" }}
        </p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full bg-(--app-success) px-3 py-1.5 text-xs font-bold text-white transition-colors hover:opacity-90 active:scale-95"
        @click="answer"
      >
        <PhoneCall class="h-3.5 w-3.5" aria-hidden="true" />
        Answer
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-(--app-border) bg-(--app-surface-soft) px-3 py-1.5 text-xs font-semibold text-(--app-text-soft) active:scale-95 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
        @click="decline"
      >
        <PhoneOff class="h-3.5 w-3.5" aria-hidden="true" />
        Decline
      </button>
    </div>
  </Transition>
</template>
