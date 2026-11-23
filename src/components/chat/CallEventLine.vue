<script setup>
import { computed } from "vue";
import { Phone, PhoneMissed, Video } from "@/icons";
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
  <div class="call-line">
    <span class="call-line__chip" :class="{ 'call-line__chip--missed': isMissed && !message.mine }">
      <Video v-if="isVideo" class="call-line__icon" :stroke-width="1.8" aria-hidden="true" />
      <PhoneMissed
        v-else-if="isMissed"
        class="call-line__icon call-line__icon--danger"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <Phone v-else class="call-line__icon" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ label }}</span>
    </span>
  </div>
</template>

<style scoped>
/* Ledger pass: a call is a stamped note between message rows. */

.call-line {
  display: flex;
  justify-content: center;
  padding: var(--app-space-2) var(--app-space-4);
}

.call-line__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  user-select: none;
}

.call-line__chip--missed {
  border-color: color-mix(in oklab, var(--app-danger) 32%, var(--app-border));
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

.call-line__icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  opacity: 0.8;
}

.call-line__icon--danger {
  color: var(--app-danger);
  opacity: 1;
}
</style>
