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
  <div class="call-request-card__block">
    <div
      class="call-request-card__block-2"
    >
      <div class="call-request-card__block-3">
        <Video v-if="isVideo" class="call-request-card__video" :stroke-width="1.8" aria-hidden="true" />
        <Phone v-else class="call-request-card__phone" :stroke-width="1.8" aria-hidden="true" />
        <span class="call-request-card__text-call-request"
          >{{ isVideo ? "Video" : "Voice" }} call request</span
        >
      </div>

      <!-- Incoming: Accept / Decline buttons (only within 60s) -->
      <template v-if="showButtons">
        <div class="call-request-card__block-4">
          <button
            @click="handleAccept"
            class="call-request-card__button-accept"
          >
            <PhoneIncoming class="call-request-card__phone-incoming" :stroke-width="1.8" />
            Accept
          </button>
          <button
            @click="handleDecline"
            class="call-request-card__button-decline"
          >
            <PhoneOff class="call-request-card__phone-off" :stroke-width="1.8" />
            Decline
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.call-request-card__button-accept {
  border-color: color-mix(in oklab,var(--color-emerald-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-request-card__button-decline {
  border-color: color-mix(in oklab,var(--color-red-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-request-card__button-accept {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-request-card__button-decline {
  background-color: color-mix(in oklab,var(--color-red-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.call-request-card__block-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 90%,transparent);
}
}

@media (hover:hover) {
.call-request-card__button-accept:hover {
  background-color: #00bb7f33;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.call-request-card__button-accept:hover {
  background-color: color-mix(in oklab,var(--color-emerald-500) 20%,transparent);
}
}
}

@media (hover:hover) {
.call-request-card__button-decline:hover {
  background-color: #fb2c3633;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.call-request-card__button-decline:hover {
  background-color: color-mix(in oklab,var(--color-red-500) 20%,transparent);
}
}
}

@layer gupt-components {
.call-request-card__block {
  display: flex;
}
.call-request-card__block-3 {
  display: flex;
}
.call-request-card__block-4 {
  display: flex;
}
.call-request-card__block-2 {
  display: inline-flex;
}
.call-request-card__button-accept {
  display: inline-flex;
}
.call-request-card__button-decline {
  display: inline-flex;
}
.call-request-card__video {
  height: calc(var(--spacing) * 3.5);
}
.call-request-card__phone {
  height: calc(var(--spacing) * 3.5);
}
.call-request-card__phone-incoming {
  height: calc(var(--spacing) * 3.5);
}
.call-request-card__phone-off {
  height: calc(var(--spacing) * 3.5);
}
.call-request-card__video {
  width: calc(var(--spacing) * 3.5);
}
.call-request-card__phone {
  width: calc(var(--spacing) * 3.5);
}
.call-request-card__phone-incoming {
  width: calc(var(--spacing) * 3.5);
}
.call-request-card__phone-off {
  width: calc(var(--spacing) * 3.5);
}
.call-request-card__block-2 {
  max-width: 280px;
}
.call-request-card__video {
  flex-shrink: 0;
}
.call-request-card__phone {
  flex-shrink: 0;
}
.call-request-card__button-accept {
  cursor: pointer;
}
.call-request-card__button-decline {
  cursor: pointer;
}
.call-request-card__block-2 {
  flex-direction: column;
}
.call-request-card__block-2 {
  align-items: center;
}
.call-request-card__block-3 {
  align-items: center;
}
.call-request-card__block-4 {
  align-items: center;
}
.call-request-card__button-accept {
  align-items: center;
}
.call-request-card__button-decline {
  align-items: center;
}
.call-request-card__block {
  justify-content: center;
}
.call-request-card__button-accept {
  gap: calc(var(--spacing) * 1.5);
}
.call-request-card__button-decline {
  gap: calc(var(--spacing) * 1.5);
}
.call-request-card__block-3 {
  gap: calc(var(--spacing) * 2);
}
.call-request-card__block-4 {
  gap: calc(var(--spacing) * 2);
}
.call-request-card__block-2 {
  gap: calc(var(--spacing) * 2.5);
}
.call-request-card__button-accept {
  border-radius: var(--radius-lg);
}
.call-request-card__button-decline {
  border-radius: var(--radius-lg);
}
.call-request-card__block-2 {
  border-radius: var(--radius-xl);
}
.call-request-card__block-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-request-card__button-accept {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-request-card__button-decline {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.call-request-card__button-accept {
  border-color: #00bb7f4d;
}
.call-request-card__button-decline {
  border-color: #fb2c364d;
}
.call-request-card__block-2 {
  border-color: var(--ui-zinc-800);
}
.call-request-card__button-accept {
  background-color: #00bb7f1a;
}
.call-request-card__button-decline {
  background-color: #fb2c361a;
}
.call-request-card__block-2 {
  background-color: var(--ui-zinc-950);
}
.call-request-card__button-accept {
  padding-inline: calc(var(--spacing) * 3);
}
.call-request-card__button-decline {
  padding-inline: calc(var(--spacing) * 3);
}
.call-request-card__block {
  padding-inline: calc(var(--spacing) * 4);
}
.call-request-card__block-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.call-request-card__button-accept {
  padding-block: calc(var(--spacing) * 1.5);
}
.call-request-card__button-decline {
  padding-block: calc(var(--spacing) * 1.5);
}
.call-request-card__block {
  padding-block: calc(var(--spacing) * 2);
}
.call-request-card__block-2 {
  padding-block: calc(var(--spacing) * 3);
}
.call-request-card__block-2 {
  text-align: center;
}
.call-request-card__block-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.call-request-card__button-accept {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.call-request-card__button-decline {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.call-request-card__text-call-request {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.call-request-card__button-accept {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.call-request-card__button-decline {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.call-request-card__text-call-request {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.call-request-card__button-accept {
  color: var(--color-emerald-400);
}
.call-request-card__button-decline {
  color: var(--color-red-400);
}
.call-request-card__block-3 {
  color: var(--ui-zinc-300);
}
.call-request-card__block-2 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.call-request-card__button-accept {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.call-request-card__button-decline {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
[data-theme="light"] .call-request-card__button-accept {
  color: var(--app-success);
}
[data-theme="light"] .call-request-card__button-decline {
  color: var(--app-danger);
}
[data-theme="light"] .call-request-card__block-3 {
  color: var(--app-text-soft);
}
}
}
</style>
