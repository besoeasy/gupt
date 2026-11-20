<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  type: { type: String, default: "submit" },
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="primary-button__button"
  >
    <!-- spinner overlay -->
    <span
      v-if="loading"
      class="primary-button__text"
    >
      <svg
        class="primary-button__icon"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle class="primary-button__icon-shape" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
        <path
          class="primary-button__icon-path"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </span>
    <span
      :class="loading ? 'primary-button__text--hidden' : 'primary-button__text--visible'"
      class="primary-button__text-2"
    >
      <slot />
    </span>
  </button>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {


@media (hover:hover) {
.primary-button__button:hover {
  background-color: var(--app-primary-strong);
}
}



@layer gupt-components {
.primary-button__text {
  pointer-events: none;
}
.primary-button__text {
  position: absolute;
}
.primary-button__button {
  position: relative;
}
.primary-button__text {
  inset: 0;
}
.primary-button__text {
  display: flex;
}
.primary-button__button {
  display: inline-flex;
}
.primary-button__text-2 {
  display: inline-flex;
}
.primary-button__icon {
  height: calc(var(--spacing) * 4);
}
.primary-button__icon {
  width: calc(var(--spacing) * 4);
}
.primary-button__button {
  width: 100%;
}
.primary-button__icon {
  animation: var(--animate-spin);
}
.primary-button__button {
  align-items: center;
}
.primary-button__text {
  align-items: center;
}
.primary-button__text-2 {
  align-items: center;
}
.primary-button__button {
  justify-content: center;
}
.primary-button__text {
  justify-content: center;
}
.primary-button__button {
  gap: calc(var(--spacing) * 2);
}
.primary-button__text-2 {
  gap: calc(var(--spacing) * 2);
}
.primary-button__button {
  border-radius: var(--radius-2xl);
}
.primary-button__button {
  background-color: var(--app-primary);
}
.primary-button__button {
  padding-block: calc(var(--spacing) * 3.5);
}
.primary-button__button {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.primary-button__button {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.primary-button__button {
  color: #fff;
}
.primary-button__icon {
  color: #fffc;
}
.primary-button__text--hidden {
  opacity: 0;
}
.primary-button__icon-shape {
  opacity: .25;
}
.primary-button__icon-path {
  opacity: .75;
}
.primary-button__text--visible {
  opacity: 1;
}
.primary-button__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.primary-button__text-2 {
  transition-property: opacity;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.primary-button__text-2 {
  --duration: .15s;
  transition-duration: .15s;
}
.primary-button__button {
  --duration: .2s;
  transition-duration: .2s;
}
.primary-button__button:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.primary-button__button:focus-visible {
  --ring-color: var(--app-primary);
}
.primary-button__button:focus-visible {
  --ring-offset-width: 2px;
  --ring-offset-shadow: var(--ring-inset,) 0 0 0 2px var(--ring-offset-color,#fff);
}
.primary-button__button:focus-visible {
  --ring-offset-color: var(--app-bg);
}
.primary-button__button:focus-visible {
  --outline-style: none;
  outline-style: none;
}
.primary-button__button:active {
  scale: .97;
}
.primary-button__button:disabled {
  cursor: not-allowed;
}
.primary-button__button:disabled {
  opacity: .5;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.primary-button__icon {
  color: color-mix(in oklab,var(--color-white) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.primary-button__button:focus-visible {
  --ring-color: color-mix(in oklab, var(--app-primary) 45%, transparent);
}
}
}
</style>
