<script setup>
import { CircleCheckBig, CircleX } from "@lucide/vue";

defineProps({
  variant: { type: String, default: "error" },
  message: { type: String, required: true },
});
</script>

<template>
  <Transition
    appear
    enter-active-class="app-alert-banner__enter-active-class"
    enter-from-class="app-alert-banner__enter-from-class"
    enter-to-class="app-alert-banner__enter-to-class"
    leave-active-class="app-alert-banner__leave-active-class"
    leave-from-class="app-alert-banner__leave-from-class"
    leave-to-class="app-alert-banner__leave-to-class"
  >
    <div
      :class="
        variant === 'success'
          ? 'app-alert-banner__block--variant-1'
          : 'app-alert-banner__block--danger'
      "
      class="app-alert-banner__block"
    >
      <CircleCheckBig
        v-if="variant === 'success'"
        class="app-alert-banner__circle-check-big"
        :stroke-width="2"
        aria-hidden="true"
      />
      <CircleX v-else class="app-alert-banner__circle-x" :stroke-width="2" aria-hidden="true" />
      <span>{{ message }}</span>
    </div>
  </Transition>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
.app-alert-banner__circle-check-big {
  margin-top: calc(var(--spacing) * .5);
}
.app-alert-banner__circle-x {
  margin-top: calc(var(--spacing) * .5);
}
.app-alert-banner__block {
  display: flex;
}
.app-alert-banner__circle-check-big {
  height: calc(var(--spacing) * 4);
}
.app-alert-banner__circle-x {
  height: calc(var(--spacing) * 4);
}
.app-alert-banner__circle-check-big {
  width: calc(var(--spacing) * 4);
}
.app-alert-banner__circle-x {
  width: calc(var(--spacing) * 4);
}
.app-alert-banner__circle-check-big {
  flex-shrink: 0;
}
.app-alert-banner__circle-x {
  flex-shrink: 0;
}
.app-alert-banner__leave-to-class {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.app-alert-banner__enter-from-class {
  --translate-y: calc(var(--spacing) * -1.5);
  translate: var(--translate-x,0) calc(var(--spacing) * -1.5);
}
.app-alert-banner__enter-to-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.app-alert-banner__leave-from-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.app-alert-banner__enter-to-class {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
.app-alert-banner__leave-from-class {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
.app-alert-banner__enter-from-class {
  scale: .98;
}
.app-alert-banner__leave-to-class {
  scale: .98;
}
.app-alert-banner__block {
  align-items: flex-start;
}
.app-alert-banner__block {
  gap: calc(var(--spacing) * 3);
}
.app-alert-banner__block {
  border-radius: var(--radius-2xl);
}
.app-alert-banner__block--variant-1 {
  background-color: var(--app-success-soft);
}
.app-alert-banner__block--danger {
  background-color: var(--app-danger-soft);
}
.app-alert-banner__block {
  padding-inline: calc(var(--spacing) * 4);
}
.app-alert-banner__block {
  padding-block: calc(var(--spacing) * 3.5);
}
.app-alert-banner__block {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.app-alert-banner__block {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.app-alert-banner__block--danger {
  color: var(--app-danger);
}
.app-alert-banner__block--variant-1 {
  color: var(--app-success);
}
.app-alert-banner__enter-from-class {
  opacity: 0;
}
.app-alert-banner__leave-to-class {
  opacity: 0;
}
.app-alert-banner__enter-to-class {
  opacity: 1;
}
.app-alert-banner__leave-from-class {
  opacity: 1;
}
.app-alert-banner__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.app-alert-banner__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.app-alert-banner__leave-active-class {
  --duration: .2s;
  transition-duration: .2s;
}
.app-alert-banner__enter-active-class {
  --duration: .3s;
  transition-duration: .3s;
}
.app-alert-banner__leave-active-class {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.app-alert-banner__enter-active-class {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
}

</style>
