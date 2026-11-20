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
  <div class="call-event-line__block">
    <div
      class="call-event-line__block-2"
      :class="isMissed && !message.mine ? 'call-event-line__block--danger' : ''"
    >
      <Video
        v-if="isVideo"
        class="call-event-line__video"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <PhoneMissed
        v-else-if="isMissed"
        class="call-event-line__phone-missed"
        :stroke-width="1.8"
        aria-hidden="true"
      />
      <Phone v-else class="call-event-line__phone" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
.call-event-line__block {
  display: flex;
}
.call-event-line__block-2 {
  display: inline-flex;
}
.call-event-line__video {
  height: calc(var(--spacing) * 3);
}
.call-event-line__phone-missed {
  height: calc(var(--spacing) * 3);
}
.call-event-line__phone {
  height: calc(var(--spacing) * 3);
}
.call-event-line__video {
  width: calc(var(--spacing) * 3);
}
.call-event-line__phone-missed {
  width: calc(var(--spacing) * 3);
}
.call-event-line__phone {
  width: calc(var(--spacing) * 3);
}
.call-event-line__video {
  flex-shrink: 0;
}
.call-event-line__phone-missed {
  flex-shrink: 0;
}
.call-event-line__phone {
  flex-shrink: 0;
}
.call-event-line__block-2 {
  align-items: center;
}
.call-event-line__block {
  justify-content: center;
}
.call-event-line__block-2 {
  gap: calc(var(--spacing) * 2);
}
.call-event-line__block-2 {
  border-radius: var(--radius-lg);
}
.call-event-line__block-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-event-line__block--danger {
  border-color: #fb2c364d;
}
.call-event-line__block-2 {
  border-color: var(--ui-zinc-800);
}
.call-event-line__block--danger {
  background-color: var(--app-danger-soft);
}
.call-event-line__block-2 {
  background-color: var(--ui-zinc-900);
}
.call-event-line__block-2 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.call-event-line__block {
  padding-inline: calc(var(--spacing) * 4);
}
.call-event-line__block-2 {
  padding-block: var(--spacing);
}
.call-event-line__block {
  padding-block: calc(var(--spacing) * 2);
}
.call-event-line__block-2 {
  font-family: var(--font-mono);
}
.call-event-line__block-2 {
  font-size: 11px;
}
.call-event-line__block--danger {
  color: var(--color-red-400);
}
.call-event-line__phone-missed {
  color: var(--color-red-400);
}
.call-event-line__block-2 {
  color: var(--ui-zinc-400);
}
.call-event-line__video {
  opacity: .7;
}
.call-event-line__phone {
  opacity: .7;
}
.call-event-line__block-2 {
  -webkit-user-select: none;
  user-select: none;
}
[data-theme="light"] .call-event-line__block--danger {
  color: var(--app-danger);
}
[data-theme="light"] .call-event-line__phone-missed {
  color: var(--app-danger);
}
[data-theme="light"] .call-event-line__block-2 {
  color: var(--app-muted);
}
}


@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.call-event-line__block--danger {
  border-color: color-mix(in oklab,var(--color-red-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-event-line__block-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}
}
</style>
