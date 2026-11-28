<script setup>
import { computed, ref, watch } from "vue";
import { Download, X } from "@/icons";
import { getFileLabel } from "@/lib/chatUtils";

const props = defineProps({
  open: { type: Boolean, default: false },
  src: { type: String, default: null },
  /** Message whose attachment is shown; used for the image alt text. */
  message: { type: Object, default: null },
});

const emit = defineEmits(["close", "download"]);

const altText = computed(() => getFileLabel(props.message || {}));

const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const isPinching = ref(false);
let pinchStartDist = 0;
let pinchStartScale = 1;
let panStartX = 0;
let panStartY = 0;
let panStartOffsetX = 0;
let panStartOffsetY = 0;
let lastTap = 0;

function reset() {
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
  isPinching.value = false;
}

// Opening always starts from a fit-to-screen view, matching the previous
// in-parent `openLightbox()` behaviour.
watch(
  () => props.open,
  (open) => {
    if (open) reset();
  },
);

function onTouchStart(e) {
  if (e.touches.length === 2) {
    isPinching.value = true;
    const dx = e.touches[1].clientX - e.touches[0].clientX;
    const dy = e.touches[1].clientY - e.touches[0].clientY;
    pinchStartDist = Math.hypot(dx, dy);
    pinchStartScale = scale.value;
  } else if (e.touches.length === 1) {
    isPinching.value = false;
    panStartX = e.touches[0].clientX;
    panStartY = e.touches[0].clientY;
    panStartOffsetX = offsetX.value;
    panStartOffsetY = offsetY.value;
  }
}

function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 2 && isPinching.value) {
    const dx = e.touches[1].clientX - e.touches[0].clientX;
    const dy = e.touches[1].clientY - e.touches[0].clientY;
    const dist = Math.hypot(dx, dy);
    scale.value = Math.min(5, Math.max(0.5, pinchStartScale * (dist / pinchStartDist)));
  } else if (e.touches.length === 1 && !isPinching.value && scale.value > 1) {
    offsetX.value = panStartOffsetX + (e.touches[0].clientX - panStartX);
    offsetY.value = panStartOffsetY + (e.touches[0].clientY - panStartY);
  }
}

function onTouchEnd(e) {
  if (e.touches.length < 2) isPinching.value = false;
}

function onTap() {
  const n = Date.now();
  if (n - lastTap < 300) {
    scale.value = scale.value > 1 ? 1 : 2.5;
    offsetX.value = 0;
    offsetY.value = 0;
  }
  lastTap = n;
}

function close() {
  emit("close");
}

function download() {
  emit("download");
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="chat-message-bubble__enter-active-class-2"
      enter-from-class="chat-message-bubble__enter-from-class-2"
      enter-to-class="chat-message-bubble__enter-to-class-2"
      leave-active-class="chat-message-bubble__leave-active-class-2"
      leave-from-class="chat-message-bubble__leave-from-class-2"
      leave-to-class="chat-message-bubble__leave-to-class-2"
    >
      <div
        v-if="open"
        class="chat-message-bubble__lightbox"
        @click.self="close"
      >
        <div class="chat-message-bubble__lightbox-actions">
          <button
            type="button"
            @click="download"
            class="chat-message-bubble__button-save-image"
            aria-label="Save image to device"
          >
            <Download class="chat-message-bubble__download-4" :stroke-width="2" />
          </button>
          <button
            type="button"
            @click="close"
            class="chat-message-bubble__button-close"
            aria-label="Close"
          >
            <X class="chat-message-bubble__x-2" :stroke-width="2" />
          </button>
        </div>

        <div
          class="chat-message-bubble__lightbox-stage"
          @touchstart="onTouchStart"
          @touchmove.prevent="onTouchMove"
          @touchend="onTouchEnd"
          @click="onTap"
        >
          <img
            :src="src"
            :alt="altText"
            class="chat-message-bubble__image-4"
            :style="{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
              transition: isPinching ? 'none' : 'transform 0.15s ease-out',
            }"
            draggable="false"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.chat-message-bubble__lightbox {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: color-mix(in oklab,var(--app-bg) 95%,transparent);
}

.chat-message-bubble__lightbox-actions {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.chat-message-bubble__lightbox-stage {
  display: flex;
  height: 100%;
  width: 100%;
  touch-action: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  -webkit-user-select: none;
  user-select: none;
}

.chat-message-bubble__image-4 {
  pointer-events: none;
  max-height: 100%;
  max-width: 100vw;
  object-fit: contain;
}

@media (min-width: 40rem) {
  .chat-message-bubble__image-4 {
    max-width: 100%;
  }
}

.chat-message-bubble__button-save-image {
  cursor: pointer;
  border-radius: 9999px;
  padding: 0.5rem;
  color: var(--color-white);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  background-color: color-mix(in oklab,var(--color-white) 10%,transparent);
}

.chat-message-bubble__button-close {
  cursor: pointer;
  border-radius: 9999px;
  padding: 0.5rem;
  color: var(--color-white);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  background-color: color-mix(in oklab,var(--color-white) 10%,transparent);
}

.chat-message-bubble__download-4 {
  height: 1.25rem;
  width: 1.25rem;
}

.chat-message-bubble__x-2 {
  height: 1.25rem;
  width: 1.25rem;
}

.chat-message-bubble__enter-active-class-2 {
  transition-property: opacity;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .15s;
}

.chat-message-bubble__leave-active-class-2 {
  transition-property: opacity;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .15s;
}

.chat-message-bubble__enter-from-class-2 {
  opacity: 0;
}

.chat-message-bubble__leave-to-class-2 {
  opacity: 0;
}

.chat-message-bubble__enter-to-class-2 {
  opacity: 1;
}

.chat-message-bubble__leave-from-class-2 {
  opacity: 1;
}

@media (hover: hover) {
  .chat-message-bubble__button-save-image:hover {
    background-color: color-mix(in oklab,var(--color-white) 20%,transparent);
  }
  .chat-message-bubble__button-close:hover {
    background-color: color-mix(in oklab,var(--color-white) 20%,transparent);
  }
}

[data-theme="light"] .chat-message-bubble__button-save-image {
  background-color: var(--app-surface-soft);
}
[data-theme="light"] .chat-message-bubble__button-close {
  background-color: var(--app-surface-soft);
}
[data-theme="light"] .chat-message-bubble__button-save-image:hover {
  background-color: var(--app-surface-hover);
}
[data-theme="light"] .chat-message-bubble__button-close:hover {
  background-color: var(--app-surface-hover);
}

@media (prefers-reduced-motion: reduce) {
  .chat-message-bubble__button-save-image,
  .chat-message-bubble__button-close {
    transition: none;
  }
  .chat-message-bubble__enter-active-class-2,
  .chat-message-bubble__leave-active-class-2 {
    transition: none;
  }
  .chat-message-bubble__image-4 {
    transition: none !important;
  }
}
</style>
