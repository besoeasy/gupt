<script setup>
import { ref } from "vue";
import { Bell, Check, X } from "lucide-vue-next";

import RoboAvatar from "@/components/RoboAvatar.vue";
import { useProfileCache } from "@/composables/useProfileCache";
import { sendNtfyPing } from "@/lib/ping";
import { dismissReplyReminder } from "@/lib/replyReminders";
import { useIdentityStore } from "@/stores/identity";

const props = defineProps({
  roomId: { type: String, required: true },
  peerPubkey: { type: String, required: true },
});

const identity = useIdentityStore();
const { displayName, profilePicture } = useProfileCache();

const pinging = ref(false);
const pingSent = ref(false);
const pingError = ref("");

async function notifyPeer() {
  if (pinging.value || pingSent.value) return;
  pinging.value = true;
  pingError.value = "";
  try {
    await identity.init();
    await sendNtfyPing({
      peerPubkey: props.peerPubkey,
      senderPubkeyHex: identity.pubkeyHex,
      senderName: identity.profileName,
    });
    pingSent.value = true;
    setTimeout(() => dismiss(), 1500);
  } catch (err) {
    pingError.value = err?.message || "Failed to send ping.";
  } finally {
    pinging.value = false;
  }
}

function dismiss() {
  dismissReplyReminder(props.roomId);
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      class="reply-reminder-bar flex shrink-0 items-center gap-2 border-y border-sky-500/35 bg-sky-500/15 px-3 py-2 shadow-[0_0_0_1px_rgba(14,165,233,0.15),inset_0_1px_0_rgba(255,255,255,0.06)] sm:gap-3 sm:px-4 sm:py-3"
    >
      <RoboAvatar
        :pubkey="peerPubkey"
        :src="profilePicture(peerPubkey)"
        size="sm"
        class="shrink-0 ring-2 ring-sky-400/30 max-sm:scale-90"
      />

      <div class="min-w-0 flex-1">
        <p class="truncate text-xs font-semibold text-sky-50 sm:text-sm">
          <template v-if="pingSent">Ping sent to {{ displayName(peerPubkey) }}!</template>
          <template v-else>No reply from {{ displayName(peerPubkey) }} yet</template>
        </p>
        <p v-if="!pingSent" class="mt-0.5 text-[11px] leading-snug text-sky-200/90 sm:text-sm">
          <span class="sm:hidden">Tap Ping to nudge them on gupt.</span>
          <span class="hidden sm:inline">
            They haven't messaged in a while — tap Ping to nudge them on gupt.
          </span>
        </p>
        <p v-if="pingError" class="mt-0.5 text-[11px] text-rose-300 sm:mt-1 sm:text-sm">
          {{ pingError }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          v-if="!pingSent"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-sky-500/25 transition-all hover:bg-sky-400 active:scale-95 disabled:opacity-50 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
          :disabled="pinging"
          @click="notifyPeer"
        >
          <Check v-if="pinging" class="h-3.5 w-3.5 animate-pulse sm:h-4 sm:w-4" aria-hidden="true" />
          <Bell v-else class="h-3.5 w-3.5 sm:h-4 sm:w-4" :stroke-width="2.2" aria-hidden="true" />
          Ping
        </button>
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-full text-sky-300 transition-colors hover:bg-sky-500/20 hover:text-sky-100 sm:h-9 sm:w-9"
          aria-label="Dismiss reminder"
          @click="dismiss"
        >
          <X class="h-4 w-4 sm:h-5 sm:w-5" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Transition>
</template>
