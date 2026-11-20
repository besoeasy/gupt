<script setup>
import { computed } from "vue";
import { PhoneCall, PhoneOff } from "@lucide/vue";
import { useCallStore } from "@/stores/calls";
import { useProfileStore } from "@/stores/profiles";
import RoboAvatar from "@/components/RoboAvatar.vue";

const callStore = useCallStore();
const { displayName, profilePicture } = useProfileStore();

defineProps({
  belowNav: { type: Boolean, default: true },
});

const callerPubkey = computed(() => callStore.activePeerPubkey);
const isVideo = computed(() => callStore.incomingCall?.media?.video);

async function answer() {
  try {
    await callStore.acceptIncomingCall();
  } catch {}
}

function decline() {
  callStore.declineIncomingCall();
}
</script>

<template>
  <Transition
    enter-active-class="app-incoming-call-banner__enter-active-class"
    enter-from-class="app-incoming-call-banner__enter-from-class"
    enter-to-class="app-incoming-call-banner__enter-to-class"
    leave-active-class="app-incoming-call-banner__leave-active-class"
    leave-from-class="app-incoming-call-banner__leave-from-class"
    leave-to-class="app-incoming-call-banner__leave-to-class"
  >
    <div
      class="app-incoming-call-banner__block"
      :class="belowNav ? 'app-incoming-call-banner__block--variant-1' : 'app-incoming-call-banner__block--variant-2'"
    >
      <div class="app-incoming-call-banner__block-2">
        <RoboAvatar :pubkey="callerPubkey" :src="profilePicture(callerPubkey)" size="sm" />
        <div class="app-incoming-call-banner__block-3">
          <p class="app-incoming-call-banner__text">
            {{ displayName(callerPubkey) }}
          </p>
          <p class="app-incoming-call-banner__text-2">
            {{ isVideo ? "Incoming video call" : "Incoming audio call" }}
          </p>
        </div>
        <button
          type="button"
          class="app-incoming-call-banner__button-answer"
          @click="answer"
        >
          <PhoneCall class="app-incoming-call-banner__phone-call" aria-hidden="true" />
          Answer
        </button>
        <button
          type="button"
          class="app-incoming-call-banner__button-decline"
          @click="decline"
        >
          <PhoneOff class="app-incoming-call-banner__phone-off" aria-hidden="true" />
          Decline
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
@media (hover:hover) {
.app-incoming-call-banner__button-decline:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.app-incoming-call-banner__button-decline:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.app-incoming-call-banner__button-decline:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.app-incoming-call-banner__button-answer:hover {
  opacity: .9;
}
}

@media (min-width:40rem) {
.app-incoming-call-banner__block-2 {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.app-incoming-call-banner__block-2 {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.app-incoming-call-banner__block {
  position: sticky;
}
.app-incoming-call-banner__block--variant-2 {
  top: 0;
}
.app-incoming-call-banner__block--variant-1 {
  top: calc(var(--spacing) * 14);
}
.app-incoming-call-banner__block {
  z-index: 40;
}
.app-incoming-call-banner__block-2 {
  margin-inline: auto;
}
.app-incoming-call-banner__block-2 {
  display: flex;
}
.app-incoming-call-banner__button-answer {
  display: inline-flex;
}
.app-incoming-call-banner__button-decline {
  display: inline-flex;
}
.app-incoming-call-banner__phone-call {
  height: calc(var(--spacing) * 3.5);
}
.app-incoming-call-banner__phone-off {
  height: calc(var(--spacing) * 3.5);
}
.app-incoming-call-banner__phone-call {
  width: calc(var(--spacing) * 3.5);
}
.app-incoming-call-banner__phone-off {
  width: calc(var(--spacing) * 3.5);
}
.app-incoming-call-banner__block-2 {
  width: 100%;
}
.app-incoming-call-banner__block-2 {
  max-width: var(--container-6xl);
}
.app-incoming-call-banner__block-3 {
  min-width: 0;
}
.app-incoming-call-banner__block-3 {
  flex: 1;
}
.app-incoming-call-banner__enter-from-class {
  --translate-y: -100%;
  translate: var(--translate-x,0) -100%;
}
.app-incoming-call-banner__leave-to-class {
  --translate-y: -100%;
  translate: var(--translate-x,0) -100%;
}
.app-incoming-call-banner__enter-to-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.app-incoming-call-banner__leave-from-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.app-incoming-call-banner__button-answer {
  cursor: pointer;
}
.app-incoming-call-banner__button-decline {
  cursor: pointer;
}
.app-incoming-call-banner__block-2 {
  align-items: center;
}
.app-incoming-call-banner__button-answer {
  align-items: center;
}
.app-incoming-call-banner__button-decline {
  align-items: center;
}
.app-incoming-call-banner__button-answer {
  gap: calc(var(--spacing) * 1.5);
}
.app-incoming-call-banner__button-decline {
  gap: calc(var(--spacing) * 1.5);
}
.app-incoming-call-banner__block-2 {
  gap: calc(var(--spacing) * 3);
}
.app-incoming-call-banner__text {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.app-incoming-call-banner__button-answer {
  border-radius: 3.40282e38px;
}
.app-incoming-call-banner__button-decline {
  border-radius: 3.40282e38px;
}
.app-incoming-call-banner__button-decline {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.app-incoming-call-banner__block {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.app-incoming-call-banner__button-decline {
  border-color: var(--app-border);
}
.app-incoming-call-banner__block {
  border-color: var(--nav-border);
}
.app-incoming-call-banner__button-answer {
  background-color: var(--app-success);
}
.app-incoming-call-banner__button-decline {
  background-color: var(--app-surface-soft);
}
.app-incoming-call-banner__block {
  background-color: var(--nav-bg);
}
.app-incoming-call-banner__button-answer {
  padding-inline: calc(var(--spacing) * 3);
}
.app-incoming-call-banner__button-decline {
  padding-inline: calc(var(--spacing) * 3);
}
.app-incoming-call-banner__block-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.app-incoming-call-banner__button-answer {
  padding-block: calc(var(--spacing) * 1.5);
}
.app-incoming-call-banner__button-decline {
  padding-block: calc(var(--spacing) * 1.5);
}
.app-incoming-call-banner__block-2 {
  padding-block: calc(var(--spacing) * 2.5);
}
.app-incoming-call-banner__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.app-incoming-call-banner__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.app-incoming-call-banner__button-answer {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.app-incoming-call-banner__button-decline {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.app-incoming-call-banner__button-answer {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.app-incoming-call-banner__text {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.app-incoming-call-banner__button-decline {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.app-incoming-call-banner__text-2 {
  color: var(--app-muted);
}
.app-incoming-call-banner__button-decline {
  color: var(--app-text-soft);
}
.app-incoming-call-banner__button-answer {
  color: var(--color-white);
}
.app-incoming-call-banner__enter-from-class {
  opacity: 0;
}
.app-incoming-call-banner__leave-to-class {
  opacity: 0;
}
.app-incoming-call-banner__enter-to-class {
  opacity: 1;
}
.app-incoming-call-banner__leave-from-class {
  opacity: 1;
}
.app-incoming-call-banner__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.app-incoming-call-banner__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.app-incoming-call-banner__button-answer {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.app-incoming-call-banner__leave-active-class {
  --duration: .2s;
  transition-duration: .2s;
}
.app-incoming-call-banner__enter-active-class {
  --duration: .34s;
  transition-duration: .34s;
}
.app-incoming-call-banner__leave-active-class {
  --ease: var(--app-ease-in);
  transition-timing-function: var(--app-ease-in);
}
.app-incoming-call-banner__enter-active-class {
  --ease: var(--app-ease-spring);
  transition-timing-function: var(--app-ease-spring);
}
.app-incoming-call-banner__button-answer:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.app-incoming-call-banner__button-decline:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
}
}
</style>
