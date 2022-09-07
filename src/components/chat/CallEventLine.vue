<script setup>
import { computed } from "vue";
import { Phone, PhoneMissed, Video } from "lucide-vue-next";
import { formatCallEventText } from "@/lib/calls";

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
      class="call-event-pill inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] select-none ui-muted"
      :class="isMissed && !message.mine ? 'text-(--app-danger)' : ''"
    >
      <Video
        v-if="isVideo"
        class="w-3 h-3 shrink-0 opacity-70"
        :stroke-width="2"
        aria-hidden="true"
      />
      <PhoneMissed
        v-else-if="isMissed"
        class="w-3 h-3 shrink-0 opacity-80"
        :stroke-width="2"
        aria-hidden="true"
      />
      <Phone v-else class="w-3 h-3 shrink-0 opacity-70" :stroke-width="2" aria-hidden="true" />
      <span>{{ label }}</span>
    </div>
  </div>
</template>
