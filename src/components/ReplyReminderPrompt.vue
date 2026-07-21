<script setup>
import { ref } from "vue";
import { Bell, Check, X } from "@lucide/vue";

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
    enter-from-class="opacity-0 translate-y-2 scale-95"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-2 scale-95"
  >
    <div class="flex justify-center w-full px-2 py-4">
      <div
        class="flex shrink-0 items-center gap-3 border border-(--app-border) bg-(--app-surface-soft) shadow-[0_4px_24px_rgba(0,0,0,0.12)] rounded-3xl px-3 py-3 sm:gap-4 sm:px-4 sm:py-3 max-w-[360px] w-full"
      >
        <RoboAvatar
          :pubkey="peerPubkey"
          :src="profilePicture(peerPubkey)"
          size="sm"
          class="shrink-0 ring-2 ring-(--app-primary)/30 max-sm:scale-90"
        />

        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-semibold text-(--app-text) sm:text-sm">
            <template v-if="pingSent">Ping sent to {{ displayName(peerPubkey) }}!</template>
            <template v-else>No reply from {{ displayName(peerPubkey) }}</template>
          </p>
          <p
            v-if="!pingSent"
            class="mt-0.5 text-[11px] leading-snug text-(--app-text-soft) sm:text-xs"
          >
            They haven't messaged in a while — tap Ping to nudge them.
          </p>
          <p v-if="pingError" class="mt-0.5 text-[11px] text-red-400 sm:mt-1 sm:text-xs">
            {{ pingError }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            v-if="!pingSent"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-2xl bg-(--app-primary) px-3 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-(--app-primary-strong) active:scale-95 disabled:opacity-50"
            :disabled="pinging"
            @click="notifyPeer"
          >
            <Check
              v-if="pinging"
              class="h-3.5 w-3.5 animate-pulse sm:h-4 sm:w-4"
              aria-hidden="true"
            />
            <Bell v-else class="h-3.5 w-3.5 sm:h-4 sm:w-4" :stroke-width="2.2" aria-hidden="true" />
            Ping
          </button>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full text-(--app-text-soft) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            aria-label="Dismiss reminder"
            @click="dismiss"
          >
            <X class="h-4 w-4 sm:h-5 sm:w-5" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
