<script setup>
import { computed } from "vue";
import { Phone, PhoneMissed, Video } from "@lucide/vue";
import { formatCallEventText } from "@/lib/webrtc";

const props = defineProps({
  message: { type: Object, required: true },
});

const label = computed(
  () =>
    props.message.text ||
    formatCallEventText(
      props.message.outcome,
      props.message.media,
      Number(props.message.durationSec || 0),
    ),
);

const isVideo = computed(() => Boolean(props.message?.media?.video));

const isMissed = computed(() =>
  ["missed", "no-answer", "declined", "failed", "busy"].includes(props.message?.outcome),
);
</script>

<template>
  <div class="flex justify-center py-2 px-4">
    <div
      class="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-mono select-none text-zinc-400"
      :class="isMissed && !message.mine ? 'border-red-500/30 bg-red-500/10 text-red-400' : ''"
    >
      <Video
        v-if="isVideo"
        class="w-3 h-3 shrink-0 opacity-70"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <PhoneMissed
        v-else-if="isMissed"
        class="w-3 h-3 shrink-0 text-red-400"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <Phone v-else class="w-3 h-3 shrink-0 opacity-70" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ label }}</span>
    </div>
  </div>
</template>
