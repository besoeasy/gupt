<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Lock, MessageSquare, Phone, X } from "@lucide/vue";

const CALL_TARGET = 7;

const props = defineProps({
  open: { type: Boolean, default: false },
  sentCount: { type: Number, default: 0 },
  title: { type: String, default: "" },
});

const emit = defineEmits(["close"]);

const sent = computed(() => Math.min(Math.max(Number(props.sentCount) || 0, 0), CALL_TARGET));
const remaining = computed(() => Math.max(CALL_TARGET - sent.value, 0));
const panelRef = ref(null);

function onKeydown(event) {
  if (event.key === "Escape") emit("close");
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      window.addEventListener("keydown", onKeydown);
      await nextTick();
      // Focus the sheet itself, not a button, so the close control does not
      // render as a pre-selected action.
      panelRef.value?.focus();
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  },
);

onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="app-modal-enter-active"
      enter-from-class="app-modal-enter-from"
      leave-active-class="app-modal-leave-active"
      leave-to-class="app-modal-leave-to"
    >
      <div
        v-if="open"
        class="chat-call-unlock-sheet__block"
      >
        <div class="chat-call-unlock-sheet__block-2" @click="emit('close')" />

        <div
          ref="panelRef"
          tabindex="-1"
          class="app-modal-panel chat-call-unlock-sheet__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-unlock-title"
        >
          <!-- Mobile grab handle -->
          <div class="chat-call-unlock-sheet__block-3" aria-hidden="true">
            <span class="chat-call-unlock-sheet__text" />
          </div>

          <div class="chat-call-unlock-sheet__block-4">
            <span
              class="chat-call-unlock-sheet__text-2"
              aria-hidden="true"
            >
              <Lock class="chat-call-unlock-sheet__lock" :stroke-width="1.9" />
            </span>
            <div class="chat-call-unlock-sheet__block-5">
              <h2
                id="call-unlock-title"
                class="chat-call-unlock-sheet__subtitle"
              >
                Calls unlock at 7 messages
              </h2>
              <p class="chat-call-unlock-sheet__text-3">
                {{
                  sent === 0
                    ? "Audio and video stay locked until you have sent 7 messages here."
                    : remaining > 0
                      ? `${remaining} more message${remaining === 1 ? "" : "s"} and calls open up.`
                      : "Calls are unlocked — the buttons in the header are live."
                }}
              </p>
              <p v-if="title" class="chat-call-unlock-sheet__text-with">
                with {{ title }}
              </p>
            </div>
            <button
              type="button"
              class="chat-call-unlock-sheet__button-close"
              title="Close"
              aria-label="Close"
              @click="emit('close')"
            >
              <X class="chat-call-unlock-sheet__x" :stroke-width="1.9" aria-hidden="true" />
            </button>
          </div>

          <div class="chat-call-unlock-sheet__block-6">
            <div class="chat-call-unlock-sheet__block-7">
              <div class="chat-call-unlock-sheet__block-8">
                <span class="chat-call-unlock-sheet__text-messages-you">Messages you sent</span>
                <span class="chat-call-unlock-sheet__text-4">
                  {{ sent }} / {{ CALL_TARGET }}
                </span>
              </div>
              <div
                class="chat-call-unlock-sheet__progressbar"
                role="progressbar"
                :aria-valuenow="sent"
                aria-valuemin="0"
                :aria-valuemax="CALL_TARGET"
                :aria-valuetext="`${sent} of ${CALL_TARGET} messages sent`"
              >
                <span
                  v-for="i in CALL_TARGET"
                  :key="i"
                  class="chat-call-unlock-sheet__text-5"
                  :class="i <= sent ? 'chat-call-unlock-sheet__text--variant-1' : 'chat-call-unlock-sheet__text--variant-2'"
                />
              </div>
              <p class="chat-call-unlock-sheet__text-6">
                <MessageSquare
                  class="chat-call-unlock-sheet__message-square"
                  :stroke-width="1.9"
                  aria-hidden="true"
                />
                {{
                  remaining > 0
                    ? `${remaining} more to go — only messages you send are counted.`
                    : "Enough messages sent — calls are unlocked."
                }}
              </p>
            </div>
          </div>

          <div class="chat-call-unlock-sheet__block-9">
            <p class="chat-call-unlock-sheet__text-7">
              The lock is a local rule computed on this device to keep cold callers out. It is not
              uploaded and your contact never sees it.
            </p>
          </div>

          <div class="chat-call-unlock-sheet__block-10">
            <button
              type="button"
              class="chat-call-unlock-sheet__button-got-it"
              @click="emit('close')"
            >
              <Phone
                v-if="remaining === 0"
                class="chat-call-unlock-sheet__phone"
                :stroke-width="1.9"
                aria-hidden="true"
              />
              Got it
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.chat-call-unlock-sheet__button-got-it {
  border-color: color-mix(in srgb,var(--app-primary) 45%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-call-unlock-sheet__block-2 {
  background-color: color-mix(in oklab,var(--ui-black) 70%,transparent);
}
}

@media (hover:hover) {
.chat-call-unlock-sheet__button-got-it:hover {
  border-color: var(--app-primary);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.chat-call-unlock-sheet__button-got-it:hover {
  border-color: color-mix(in srgb,var(--app-primary) 65%,transparent);
}
}
}

@media (hover:hover) {
.chat-call-unlock-sheet__button-close:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.chat-call-unlock-sheet__button-got-it:hover {
  background-color: var(--app-primary);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.chat-call-unlock-sheet__button-got-it:hover {
  background-color: color-mix(in srgb,var(--app-primary) 22%,transparent);
}
}
}

@media (hover:hover) {
.chat-call-unlock-sheet__button-close:hover {
  color: var(--app-text);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-call-unlock-sheet__button-close:focus-visible {
  --ring-color: color-mix(in srgb,var(--app-primary) 55%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-call-unlock-sheet__button-got-it:focus-visible {
  --ring-color: color-mix(in srgb,var(--app-primary) 55%,transparent);
}
}

@media (min-width:40rem) {
.chat-call-unlock-sheet__block-3 {
  display: none;
}
}

@media (min-width:40rem) {
.chat-call-unlock-sheet__block {
  align-items: center;
}
}

@media (min-width:40rem) {
.chat-call-unlock-sheet__dialog {
  border-radius: var(--radius-3xl);
}
}

@media (min-width:40rem) {
.chat-call-unlock-sheet__block {
  padding: calc(var(--spacing) * 4);
}
}

@media (min-width:40rem) {
.chat-call-unlock-sheet__block-4 {
  padding-top: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.chat-call-unlock-sheet__block-10 {
  padding-bottom: calc(var(--spacing) * 5);
}
}

@layer gupt-components {
.chat-call-unlock-sheet__block-2 {
  position: absolute;
}
.chat-call-unlock-sheet__block {
  position: fixed;
}
.chat-call-unlock-sheet__dialog {
  position: relative;
}
.chat-call-unlock-sheet__block {
  inset: 0;
}
.chat-call-unlock-sheet__block-2 {
  inset: 0;
}
.chat-call-unlock-sheet__dialog {
  z-index: 10;
}
.chat-call-unlock-sheet__block {
  z-index: 60;
}
.chat-call-unlock-sheet__text-3 {
  margin-top: var(--spacing);
}
.chat-call-unlock-sheet__text-with {
  margin-top: var(--spacing);
}
.chat-call-unlock-sheet__text-6 {
  margin-top: calc(var(--spacing) * 2);
}
.chat-call-unlock-sheet__progressbar {
  margin-top: calc(var(--spacing) * 2.5);
}
.chat-call-unlock-sheet__block {
  display: flex;
}
.chat-call-unlock-sheet__block-3 {
  display: flex;
}
.chat-call-unlock-sheet__block-4 {
  display: flex;
}
.chat-call-unlock-sheet__block-8 {
  display: flex;
}
.chat-call-unlock-sheet__progressbar {
  display: flex;
}
.chat-call-unlock-sheet__text-6 {
  display: flex;
}
.chat-call-unlock-sheet__text-2 {
  display: inline-flex;
}
.chat-call-unlock-sheet__button-close {
  display: inline-flex;
}
.chat-call-unlock-sheet__button-got-it {
  display: inline-flex;
}
.chat-call-unlock-sheet__text {
  height: var(--spacing);
}
.chat-call-unlock-sheet__text-5 {
  height: calc(var(--spacing) * 1.5);
}
.chat-call-unlock-sheet__message-square {
  height: calc(var(--spacing) * 3.5);
}
.chat-call-unlock-sheet__phone {
  height: calc(var(--spacing) * 4);
}
.chat-call-unlock-sheet__lock {
  height: calc(var(--spacing) * 5);
}
.chat-call-unlock-sheet__x {
  height: calc(var(--spacing) * 5);
}
.chat-call-unlock-sheet__text-2 {
  height: calc(var(--spacing) * 11);
}
.chat-call-unlock-sheet__button-close {
  height: calc(var(--spacing) * 11);
}
.chat-call-unlock-sheet__button-got-it {
  min-height: calc(var(--spacing) * 11);
}
.chat-call-unlock-sheet__message-square {
  width: calc(var(--spacing) * 3.5);
}
.chat-call-unlock-sheet__phone {
  width: calc(var(--spacing) * 4);
}
.chat-call-unlock-sheet__lock {
  width: calc(var(--spacing) * 5);
}
.chat-call-unlock-sheet__x {
  width: calc(var(--spacing) * 5);
}
.chat-call-unlock-sheet__text {
  width: calc(var(--spacing) * 9);
}
.chat-call-unlock-sheet__text-2 {
  width: calc(var(--spacing) * 11);
}
.chat-call-unlock-sheet__button-close {
  width: calc(var(--spacing) * 11);
}
.chat-call-unlock-sheet__dialog {
  width: 100%;
}
.chat-call-unlock-sheet__button-got-it {
  width: 100%;
}
.chat-call-unlock-sheet__dialog {
  max-width: var(--container-sm);
}
.chat-call-unlock-sheet__block-5 {
  min-width: 0;
}
.chat-call-unlock-sheet__block-5 {
  flex: 1;
}
.chat-call-unlock-sheet__text-5 {
  flex: 1;
}
.chat-call-unlock-sheet__text-2 {
  flex-shrink: 0;
}
.chat-call-unlock-sheet__button-close {
  flex-shrink: 0;
}
.chat-call-unlock-sheet__message-square {
  flex-shrink: 0;
}
.chat-call-unlock-sheet__block-8 {
  align-items: baseline;
}
.chat-call-unlock-sheet__text-2 {
  align-items: center;
}
.chat-call-unlock-sheet__button-close {
  align-items: center;
}
.chat-call-unlock-sheet__text-6 {
  align-items: center;
}
.chat-call-unlock-sheet__button-got-it {
  align-items: center;
}
.chat-call-unlock-sheet__block {
  align-items: flex-end;
}
.chat-call-unlock-sheet__block-4 {
  align-items: flex-start;
}
.chat-call-unlock-sheet__block-8 {
  justify-content: space-between;
}
.chat-call-unlock-sheet__block {
  justify-content: center;
}
.chat-call-unlock-sheet__block-3 {
  justify-content: center;
}
.chat-call-unlock-sheet__text-2 {
  justify-content: center;
}
.chat-call-unlock-sheet__button-close {
  justify-content: center;
}
.chat-call-unlock-sheet__button-got-it {
  justify-content: center;
}
.chat-call-unlock-sheet__progressbar {
  gap: calc(var(--spacing) * 1.5);
}
.chat-call-unlock-sheet__text-6 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-call-unlock-sheet__button-got-it {
  gap: calc(var(--spacing) * 2);
}
.chat-call-unlock-sheet__block-4 {
  gap: calc(var(--spacing) * 3);
}
.chat-call-unlock-sheet__block-8 {
  gap: calc(var(--spacing) * 3);
}
.chat-call-unlock-sheet__text-with {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-call-unlock-sheet__dialog {
  overflow: hidden;
}
.chat-call-unlock-sheet__text-2 {
  border-radius: var(--radius-2xl);
}
.chat-call-unlock-sheet__block-7 {
  border-radius: var(--radius-2xl);
}
.chat-call-unlock-sheet__text {
  border-radius: 3.40282e38px;
}
.chat-call-unlock-sheet__text-5 {
  border-radius: 3.40282e38px;
}
.chat-call-unlock-sheet__button-close {
  border-radius: var(--radius-xl);
}
.chat-call-unlock-sheet__button-got-it {
  border-radius: var(--radius-xl);
}
.chat-call-unlock-sheet__dialog {
  border-top-left-radius: var(--radius-3xl);
  border-top-right-radius: var(--radius-3xl);
}
.chat-call-unlock-sheet__dialog {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-call-unlock-sheet__block-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-call-unlock-sheet__button-got-it {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-call-unlock-sheet__dialog {
  border-color: var(--app-border);
}
.chat-call-unlock-sheet__block-7 {
  border-color: var(--app-border);
}
.chat-call-unlock-sheet__button-got-it {
  border-color: var(--app-primary);
}
.chat-call-unlock-sheet__text {
  background-color: var(--app-border-strong);
}
.chat-call-unlock-sheet__text--variant-1 {
  background-color: var(--app-primary);
}
.chat-call-unlock-sheet__text-2 {
  background-color: var(--app-primary-soft);
}
.chat-call-unlock-sheet__button-got-it {
  background-color: var(--app-primary-soft);
}
.chat-call-unlock-sheet__dialog {
  background-color: var(--app-surface);
}
.chat-call-unlock-sheet__text--variant-2 {
  background-color: var(--app-surface-hover);
}
.chat-call-unlock-sheet__block-7 {
  background-color: var(--app-surface-soft);
}
.chat-call-unlock-sheet__block-2 {
  background-color: var(--ui-black);
}
.chat-call-unlock-sheet__block-7 {
  padding: calc(var(--spacing) * 3.5);
}
.chat-call-unlock-sheet__button-got-it {
  padding-inline: calc(var(--spacing) * 4);
}
.chat-call-unlock-sheet__block-4 {
  padding-inline: calc(var(--spacing) * 5);
}
.chat-call-unlock-sheet__block-6 {
  padding-inline: calc(var(--spacing) * 5);
}
.chat-call-unlock-sheet__block-9 {
  padding-inline: calc(var(--spacing) * 5);
}
.chat-call-unlock-sheet__block-10 {
  padding-inline: calc(var(--spacing) * 5);
}
.chat-call-unlock-sheet__block-3 {
  padding-top: calc(var(--spacing) * 2.5);
}
.chat-call-unlock-sheet__block-9 {
  padding-top: calc(var(--spacing) * 3);
}
.chat-call-unlock-sheet__block-4 {
  padding-top: calc(var(--spacing) * 4);
}
.chat-call-unlock-sheet__block-6 {
  padding-top: calc(var(--spacing) * 4);
}
.chat-call-unlock-sheet__block-10 {
  padding-top: calc(var(--spacing) * 4);
}
.chat-call-unlock-sheet__block-10 {
  padding-bottom: max(3rem,calc(env(safe-area-inset-bottom) + 2.75rem));
}
.chat-call-unlock-sheet__text-with {
  font-family: var(--font-mono);
}
.chat-call-unlock-sheet__text-4 {
  font-family: var(--font-mono);
}
.chat-call-unlock-sheet__subtitle {
  font-size: var(--text-base);
  line-height: var(--leading,var(--text-base--line-height));
}
.chat-call-unlock-sheet__text-3 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.chat-call-unlock-sheet__button-got-it {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.chat-call-unlock-sheet__text-messages-you {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-call-unlock-sheet__text-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-call-unlock-sheet__text-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-call-unlock-sheet__text-with {
  font-size: 10px;
}
.chat-call-unlock-sheet__text-7 {
  font-size: 11px;
}
.chat-call-unlock-sheet__text-7 {
  --leading: calc(var(--spacing) * 4);
  line-height: calc(var(--spacing) * 4);
}
.chat-call-unlock-sheet__text-3 {
  --leading: calc(var(--spacing) * 5);
  line-height: calc(var(--spacing) * 5);
}
.chat-call-unlock-sheet__subtitle {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.chat-call-unlock-sheet__subtitle {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.chat-call-unlock-sheet__text-messages-you {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-call-unlock-sheet__text-4 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-call-unlock-sheet__button-got-it {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-call-unlock-sheet__subtitle {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.chat-call-unlock-sheet__text-3 {
  color: var(--app-muted);
}
.chat-call-unlock-sheet__button-close {
  color: var(--app-muted);
}
.chat-call-unlock-sheet__text-6 {
  color: var(--app-muted);
}
.chat-call-unlock-sheet__text-with {
  color: var(--app-muted-2);
}
.chat-call-unlock-sheet__text-7 {
  color: var(--app-muted-2);
}
.chat-call-unlock-sheet__text-2 {
  color: var(--app-primary);
}
.chat-call-unlock-sheet__button-got-it {
  color: var(--app-primary);
}
.chat-call-unlock-sheet__subtitle {
  color: var(--app-text);
}
.chat-call-unlock-sheet__text-4 {
  color: var(--app-text);
}
.chat-call-unlock-sheet__text-messages-you {
  color: var(--app-text-soft);
}
.chat-call-unlock-sheet__dialog {
  --shadow: 0 24px 64px var(--shadow-color,#0006);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 24px 64px var(--shadow-color,#0006);
}
.chat-call-unlock-sheet__block-2 {
  --backdrop-blur: blur(var(--blur-xs));
  -webkit-backdrop-filter: blur(var(--blur-xs)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-xs)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.chat-call-unlock-sheet__button-got-it {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-call-unlock-sheet__button-close {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-call-unlock-sheet__text-5 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-call-unlock-sheet__button-close {
  --duration: .2s;
  transition-duration: .2s;
}
.chat-call-unlock-sheet__button-got-it {
  --duration: .2s;
  transition-duration: .2s;
}
.chat-call-unlock-sheet__text-5 {
  --duration: .3s;
  transition-duration: .3s;
}
.chat-call-unlock-sheet__text-5 {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.chat-call-unlock-sheet__dialog {
  --outline-style: none;
  outline-style: none;
}
.chat-call-unlock-sheet__button-close:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.chat-call-unlock-sheet__button-got-it:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.chat-call-unlock-sheet__button-close:focus-visible {
  --ring-color: var(--app-primary);
}
.chat-call-unlock-sheet__button-got-it:focus-visible {
  --ring-color: var(--app-primary);
}
.chat-call-unlock-sheet__button-close:focus-visible {
  --outline-style: none;
  outline-style: none;
}
.chat-call-unlock-sheet__button-got-it:focus-visible {
  --outline-style: none;
  outline-style: none;
}
.chat-call-unlock-sheet__button-close:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.chat-call-unlock-sheet__button-got-it:active {
  scale: .98;
}
}
}
</style>
