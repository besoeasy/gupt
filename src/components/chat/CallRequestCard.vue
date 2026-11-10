<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import { Phone, PhoneIncoming, PhoneOff, Video } from "@lucide/vue";

const props = defineProps({
  message: { type: Object, required: true },
});

const emit = defineEmits(["accept", "decline"]);

const isVideo = computed(() => Boolean(props.message?.media?.video));
const isMine = computed(() => Boolean(props.message?.mine));

const requestAgeMs = computed(() => {
  const msgTs = props.message?.created_at || props.message?.ts || 0;
  return Date.now() - msgTs;
});

const timedOut = ref(requestAgeMs.value > 60_000);

let timer = null;
if (!timedOut.value) {
  const remaining = Math.max(0, 60_000 - requestAgeMs.value);
  timer = setTimeout(() => {
    timedOut.value = true;
  }, remaining);
}
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

const showButtons = computed(() => !isMine.value && !timedOut.value);

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
      class="inline-flex flex-col items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/90 px-4 py-3 text-center max-w-[280px] shadow-xs"
    >
      <div class="flex items-center gap-2 text-xs text-zinc-300">
        <Video v-if="isVideo" class="w-3.5 h-3.5 shrink-0" :stroke-width="1.8" aria-hidden="true" />
        <Phone v-else class="w-3.5 h-3.5 shrink-0" :stroke-width="1.8" aria-hidden="true" />
        <span class="font-medium tracking-tight"
          >{{ isVideo ? "Video" : "Voice" }} call request</span
        >
      </div>

      <!-- Incoming: Accept / Decline buttons (only within 60s) -->
      <template v-if="showButtons">
        <div class="flex items-center gap-2">
          <button
            @click="handleAccept"
            class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 cursor-pointer"
          >
            <PhoneIncoming class="w-3.5 h-3.5" :stroke-width="1.8" />
            Accept
          </button>
          <button
            @click="handleDecline"
            class="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 cursor-pointer"
          >
            <PhoneOff class="w-3.5 h-3.5" :stroke-width="1.8" />
            Decline
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
