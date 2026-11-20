<script setup>
import { FEED_REACTIONS } from "@/lib/feed";

defineProps({
  counts: { type: Object, default: () => ({}) },
  myReaction: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["react"]);
</script>

<template>
  <div class="feed-reaction-bar__block" @click.stop>
    <button
      v-for="emoji in FEED_REACTIONS"
      :key="emoji"
      type="button"
      :disabled="disabled"
      class="feed-reaction-bar__button"
      :class="
        myReaction === emoji
          ? 'feed-reaction-bar__button--variant-1'
          : 'feed-reaction-bar__button--variant-2'
      "
      :title="myReaction === emoji ? 'Tap to remove' : 'React'"
      @click="emit('react', emoji)"
    >
      <span>{{ emoji }}</span>
      <span
        v-if="counts?.[emoji]"
        class="feed-reaction-bar__text"
        :class="myReaction === emoji ? 'feed-reaction-bar__text--variant-1' : 'feed-reaction-bar__text--muted'"
      >
        {{ counts[emoji] }}
      </span>
    </button>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.feed-reaction-bar__button--variant-1 {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 70%,transparent);
}
}

@media (hover:hover) {
.feed-reaction-bar__button--variant-2:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.feed-reaction-bar__button--variant-2:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.feed-reaction-bar__button--variant-2:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}
}

@layer gupt-components {
.feed-reaction-bar__block {
  display: flex;
}
.feed-reaction-bar__button {
  display: inline-flex;
}
.feed-reaction-bar__button {
  height: calc(var(--spacing) * 8);
}
.feed-reaction-bar__button {
  min-width: calc(var(--spacing) * 9);
}
.feed-reaction-bar__button {
  cursor: pointer;
}
.feed-reaction-bar__block {
  flex-wrap: wrap;
}
.feed-reaction-bar__block {
  align-items: center;
}
.feed-reaction-bar__button {
  align-items: center;
}
.feed-reaction-bar__button {
  justify-content: center;
}
.feed-reaction-bar__block {
  gap: var(--spacing);
}
.feed-reaction-bar__button {
  gap: var(--spacing);
}
.feed-reaction-bar__button {
  border-radius: var(--radius-lg);
}
.feed-reaction-bar__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-reaction-bar__button--variant-1 {
  border-color: var(--ui-zinc-600);
}
.feed-reaction-bar__button--variant-2 {
  border-color: var(--ui-zinc-800);
}
.feed-reaction-bar__button--variant-2 {
  background-color: #0000;
}
.feed-reaction-bar__button--variant-1 {
  background-color: var(--ui-zinc-800);
}
.feed-reaction-bar__button {
  padding-inline: calc(var(--spacing) * 2);
}
.feed-reaction-bar__text {
  font-family: var(--font-mono);
}
.feed-reaction-bar__button {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-reaction-bar__text {
  font-size: 11px;
}
.feed-reaction-bar__text {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-reaction-bar__text--variant-1 {
  color: var(--ui-zinc-100);
}
.feed-reaction-bar__text--muted {
  color: var(--ui-zinc-500);
}
.feed-reaction-bar__text {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-reaction-bar__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-reaction-bar__button:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.feed-reaction-bar__button:disabled {
  opacity: .5;
}
[data-theme="light"] .feed-reaction-bar__text--muted {
  color: var(--app-muted);
}
}
}
</style>
