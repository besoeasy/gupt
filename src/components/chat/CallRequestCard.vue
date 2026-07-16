<script setup>
import { computed } from "vue";
import { Phone, PhoneIncoming, PhoneOff, Video } from "@lucide/vue";
import { useCallStore } from "@/stores/calls";

const props = defineProps({
  message: { type: Object, required: true },
});

const emit = defineEmits(["accept", "decline"]);
const callStore = useCallStore();

const isVideo = computed(() => Boolean(props.message?.media?.video));
const isMine = computed(() => Boolean(props.message?.mine));

const requestStatus = computed(() => {
  if (isMine.value && callStore.callRequestState?.requestId === props.message.requestId) {
    return callStore.callRequestState.status;
  }
  return null;
});

const statusLabel = computed(() => {
  switch (requestStatus.value) {
    case "pending":
      return "Waiting…";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    default:
      return null;
  }
});

function handleAccept() {
  emit("accept", props.message);
}

function handleDecline() {
  emit("decline", props.message);
}
</script>

<template>
  <div class="flex justify-center py-2 px-4">
    <div
      class="inline-flex flex-col items-center gap-2.5 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 text-center max-w-[280px]"
    >
      <div class="flex items-center gap-2 text-xs text-zinc-400">
        <Video v-if="isVideo" class="w-3.5 h-3.5 shrink-0" :stroke-width="2" aria-hidden="true" />
        <Phone v-else class="w-3.5 h-3.5 shrink-0" :stroke-width="2" aria-hidden="true" />
        <span class="font-medium">{{ isVideo ? "Video" : "Voice" }} call request</span>
      </div>

      <!-- Incoming: Accept / Decline buttons -->
      <template v-if="!isMine && !statusLabel">
        <div class="flex items-center gap-2">
          <button
            @click="handleAccept"
            class="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25"
          >
            <PhoneIncoming class="w-3.5 h-3.5" :stroke-width="2" />
            Accept
          </button>
          <button
            @click="handleDecline"
            class="inline-flex items-center gap-1.5 rounded-xl bg-red-500/15 px-3.5 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/25"
          >
            <PhoneOff class="w-3.5 h-3.5" :stroke-width="2" />
            Decline
          </button>
        </div>
      </template>

      <!-- Outgoing or responded: status label -->
      <template v-else-if="statusLabel">
        <span
          class="text-[11px] font-medium"
          :class="{
            'text-zinc-500': statusLabel === 'Waiting…',
            'text-emerald-400': statusLabel === 'Accepted',
            'text-red-400': statusLabel === 'Declined',
          }"
        >
          {{ statusLabel }}
        </span>
      </template>
    </div>
  </div>
</template>
