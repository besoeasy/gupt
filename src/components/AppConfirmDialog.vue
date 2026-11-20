<script setup>
import { Trash2, X } from "@/icons";

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: "Delete?" },
  message: { type: String, default: "This cannot be undone." },
  confirmLabel: { type: String, default: "Delete" },
});

const emit = defineEmits(["confirm", "cancel"]);
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
        class="app-confirm-dialog__block"
      >
        <div class="app-confirm-dialog__block-2" @click="emit('cancel')" />
        <div
          class="app-modal-panel app-confirm-dialog__dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <div
            class="app-confirm-dialog__block-3"
          >
            <div class="app-confirm-dialog__block-4">
              <h2 class="app-confirm-dialog__subtitle">{{ title }}</h2>
              <p class="app-confirm-dialog__text">{{ message }}</p>
            </div>
            <button
              type="button"
              class="app-confirm-dialog__button-cancel"
              title="Cancel"
              @click="emit('cancel')"
            >
              <X class="app-confirm-dialog__x" />
            </button>
          </div>
          <div class="app-confirm-dialog__block-5">
            <button
              type="button"
              class="app-confirm-dialog__button-cancel-2"
              @click="emit('cancel')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="app-confirm-dialog__button"
              @click="emit('confirm')"
            >
              <Trash2 class="app-confirm-dialog__trash2" />
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {




@media (hover:hover) {
.app-confirm-dialog__button-cancel:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.app-confirm-dialog__button:hover {
  background-color: #fb2c3640;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.app-confirm-dialog__button:hover {
  background-color: color-mix(in oklab,var(--color-red-500) 25%,transparent);
}
}
}

@media (hover:hover) {
.app-confirm-dialog__button-cancel:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.app-confirm-dialog__button-cancel-2:hover {
  color: var(--app-text);
}
}

@media (min-width:40rem) {
.app-confirm-dialog__block {
  align-items: center;
}
}

@media (min-width:40rem) {
.app-confirm-dialog__dialog {
  border-radius: var(--radius-3xl);
}
}

@media (min-width:40rem) {
.app-confirm-dialog__block {
  padding: calc(var(--spacing) * 4);
}
}

@layer gupt-components {
.app-confirm-dialog__block-2 {
  position: absolute;
}
.app-confirm-dialog__block {
  position: fixed;
}
.app-confirm-dialog__dialog {
  position: relative;
}
.app-confirm-dialog__block {
  inset: 0;
}
.app-confirm-dialog__block-2 {
  inset: 0;
}
.app-confirm-dialog__dialog {
  z-index: 10;
}
.app-confirm-dialog__block {
  z-index: 60;
}
.app-confirm-dialog__text {
  margin-top: var(--spacing);
}
.app-confirm-dialog__block {
  display: flex;
}
.app-confirm-dialog__block-3 {
  display: flex;
}
.app-confirm-dialog__block-5 {
  display: flex;
}
.app-confirm-dialog__button {
  display: inline-flex;
}
.app-confirm-dialog__trash2 {
  height: calc(var(--spacing) * 4);
}
.app-confirm-dialog__x {
  height: calc(var(--spacing) * 5);
}
.app-confirm-dialog__trash2 {
  width: calc(var(--spacing) * 4);
}
.app-confirm-dialog__x {
  width: calc(var(--spacing) * 5);
}
.app-confirm-dialog__dialog {
  width: 100%;
}
.app-confirm-dialog__dialog {
  max-width: var(--container-sm);
}
.app-confirm-dialog__block-4 {
  min-width: 0;
}
.app-confirm-dialog__button {
  align-items: center;
}
.app-confirm-dialog__block {
  align-items: flex-end;
}
.app-confirm-dialog__block-3 {
  align-items: flex-start;
}
.app-confirm-dialog__block-3 {
  justify-content: space-between;
}
.app-confirm-dialog__block {
  justify-content: center;
}
.app-confirm-dialog__block-5 {
  justify-content: flex-end;
}
.app-confirm-dialog__button {
  gap: calc(var(--spacing) * 1.5);
}
.app-confirm-dialog__block-5 {
  gap: calc(var(--spacing) * 2);
}
.app-confirm-dialog__block-3 {
  gap: calc(var(--spacing) * 3);
}
.app-confirm-dialog__dialog {
  overflow: hidden;
}
.app-confirm-dialog__button-cancel {
  border-radius: var(--radius-xl);
}
.app-confirm-dialog__button-cancel-2 {
  border-radius: var(--radius-xl);
}
.app-confirm-dialog__button {
  border-radius: var(--radius-xl);
}
.app-confirm-dialog__dialog {
  border-top-left-radius: var(--radius-3xl);
  border-top-right-radius: var(--radius-3xl);
}
.app-confirm-dialog__dialog {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.app-confirm-dialog__block-3 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.app-confirm-dialog__dialog {
  border-color: var(--app-border);
}
.app-confirm-dialog__block-3 {
  border-color: var(--app-border);
}
.app-confirm-dialog__dialog {
  background-color: var(--app-surface);
}
.app-confirm-dialog__block-2 {
  background-color: var(--ui-black);
}
.app-confirm-dialog__button {
  background-color: #fb2c3626;
}
.app-confirm-dialog__button-cancel {
  padding: calc(var(--spacing) * 1.5);
}
.app-confirm-dialog__button-cancel-2 {
  padding-inline: calc(var(--spacing) * 3.5);
}
.app-confirm-dialog__button {
  padding-inline: calc(var(--spacing) * 3.5);
}
.app-confirm-dialog__block-3 {
  padding-inline: calc(var(--spacing) * 5);
}
.app-confirm-dialog__block-5 {
  padding-inline: calc(var(--spacing) * 5);
}
.app-confirm-dialog__button-cancel-2 {
  padding-block: calc(var(--spacing) * 2);
}
.app-confirm-dialog__button {
  padding-block: calc(var(--spacing) * 2);
}
.app-confirm-dialog__block-3 {
  padding-block: calc(var(--spacing) * 4);
}
.app-confirm-dialog__block-5 {
  padding-block: calc(var(--spacing) * 4);
}
.app-confirm-dialog__subtitle {
  font-size: var(--text-base);
  line-height: var(--leading,var(--text-base--line-height));
}
.app-confirm-dialog__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.app-confirm-dialog__button-cancel-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.app-confirm-dialog__button {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.app-confirm-dialog__text {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.app-confirm-dialog__subtitle {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.app-confirm-dialog__button-cancel-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.app-confirm-dialog__button {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.app-confirm-dialog__text {
  color: var(--app-muted);
}
.app-confirm-dialog__button-cancel {
  color: var(--app-muted);
}
.app-confirm-dialog__button-cancel-2 {
  color: var(--app-muted);
}
.app-confirm-dialog__subtitle {
  color: var(--app-text);
}
.app-confirm-dialog__button {
  color: var(--color-red-400);
}
.app-confirm-dialog__dialog {
  --shadow: 0 24px 64px var(--shadow-color,#0006);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 24px 64px var(--shadow-color,#0006);
}
.app-confirm-dialog__block-2 {
  --backdrop-blur: blur(var(--blur-xs));
  -webkit-backdrop-filter: blur(var(--blur-xs)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-xs)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.app-confirm-dialog__button-cancel {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.app-confirm-dialog__button-cancel-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.app-confirm-dialog__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
[data-theme="light"] .app-confirm-dialog__button {
  color: var(--app-danger);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.app-confirm-dialog__block-2 {
  background-color: color-mix(in oklab,var(--ui-black) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.app-confirm-dialog__button {
  background-color: color-mix(in oklab,var(--color-red-500) 15%,transparent);
}
}
}
</style>
