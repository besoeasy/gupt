<script setup>
import { ChevronDown } from "@lucide/vue";

defineProps({
  count: { type: Number, default: 0 },
});

const emit = defineEmits(["click"]);
</script>

<template>
  <Transition
    enter-active-class="new-messages-pill__enter-active-class"
    enter-from-class="new-messages-pill__enter-from-class"
    enter-to-class="new-messages-pill__enter-to-class"
    leave-active-class="new-messages-pill__leave-active-class"
    leave-from-class="new-messages-pill__leave-from-class"
    leave-to-class="new-messages-pill__leave-to-class"
  >
    <button
      v-if="count > 0"
      type="button"
      class="new-messages-pill__button"
      @click="emit('click')"
    >
      <ChevronDown class="new-messages-pill__chevron-down" :stroke-width="2" aria-hidden="true" />
      {{ count === 1 ? "New message" : `${count} new messages` }}
    </button>
  </Transition>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.new-messages-pill__button {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 90%,transparent);
}
}

@media (hover:hover) {
.new-messages-pill__button:hover {
  border-color: var(--ui-zinc-600);
}
}

@media (hover:hover) {
.new-messages-pill__button:hover {
  background-color: var(--ui-zinc-800);
}
}

@layer gupt-components {
.new-messages-pill__button {
  position: absolute;
}
.new-messages-pill__button {
  bottom: calc(var(--spacing) * 4);
}
.new-messages-pill__button {
  left: 50%;
}
.new-messages-pill__button {
  z-index: 20;
}
.new-messages-pill__button {
  display: inline-flex;
}
.new-messages-pill__chevron-down {
  height: calc(var(--spacing) * 3.5);
}
.new-messages-pill__chevron-down {
  width: calc(var(--spacing) * 3.5);
}
.new-messages-pill__button {
  --translate-x: -50% ;
  translate: -50%  var(--translate-y,0);
}
.new-messages-pill__enter-to-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.new-messages-pill__leave-from-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.new-messages-pill__enter-from-class {
  --translate-y: calc(var(--spacing) * 2);
  translate: var(--translate-x,0) calc(var(--spacing) * 2);
}
.new-messages-pill__leave-to-class {
  --translate-y: calc(var(--spacing) * 2);
  translate: var(--translate-x,0) calc(var(--spacing) * 2);
}
.new-messages-pill__enter-from-class {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.new-messages-pill__leave-to-class {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.new-messages-pill__enter-to-class {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
.new-messages-pill__leave-from-class {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
.new-messages-pill__button {
  cursor: pointer;
}
.new-messages-pill__button {
  align-items: center;
}
.new-messages-pill__button {
  gap: calc(var(--spacing) * 1.5);
}
.new-messages-pill__button {
  border-radius: 3.40282e38px;
}
.new-messages-pill__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.new-messages-pill__button {
  border-color: var(--ui-zinc-700);
}
.new-messages-pill__button {
  background-color: var(--ui-zinc-900);
}
.new-messages-pill__button {
  padding-inline: calc(var(--spacing) * 3.5);
}
.new-messages-pill__button {
  padding-block: var(--spacing);
}
.new-messages-pill__button {
  font-family: var(--font-mono);
}
.new-messages-pill__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.new-messages-pill__button {
  color: var(--ui-zinc-100);
}
.new-messages-pill__enter-from-class {
  opacity: 0;
}
.new-messages-pill__leave-to-class {
  opacity: 0;
}
.new-messages-pill__enter-to-class {
  opacity: 1;
}
.new-messages-pill__leave-from-class {
  opacity: 1;
}
.new-messages-pill__button {
  --shadow: 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
}
.new-messages-pill__button {
  --backdrop-blur: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.new-messages-pill__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.new-messages-pill__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.new-messages-pill__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.new-messages-pill__leave-active-class {
  --duration: .15s;
  transition-duration: .15s;
}
.new-messages-pill__enter-active-class {
  --duration: .28s;
  transition-duration: .28s;
}
.new-messages-pill__leave-active-class {
  --ease: var(--app-ease-in);
  transition-timing-function: var(--app-ease-in);
}
.new-messages-pill__enter-active-class {
  --ease: var(--app-ease-spring);
  transition-timing-function: var(--app-ease-spring);
}
}
}
</style>
