<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import { LoaderCircle, RefreshCw, CircleCheckBig } from "@/icons";

const props = defineProps({
  hasMore: { type: Boolean, default: true },
  isLoading: { type: Boolean, default: false },
});

const emit = defineEmits(["load-more"]);

const sentinelEl = ref(null);
let observer = null;

function triggerLoadMore() {
  if (props.isLoading || !props.hasMore) return;
  emit("load-more");
}

function setupObserver() {
  if (typeof IntersectionObserver === "undefined") return;
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      const first = entries[0];
      if (first && first.isIntersecting) {
        triggerLoadMore();
      }
    },
    { rootMargin: "300px 0px" },
  );
  if (sentinelEl.value) {
    observer.observe(sentinelEl.value);
  }
}

onMounted(setupObserver);

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});

watch(sentinelEl, (el) => {
  if (observer && el) {
    observer.disconnect();
    observer.observe(el);
  }
});
</script>

<template>
  <div ref="sentinelEl" class="feed-pagination-sentinel__block">
    <div
      v-if="isLoading"
      class="feed-pagination-sentinel__status"
      role="status"
    >
      <LoaderCircle class="feed-pagination-sentinel__loader-circle" />
      <span>Loading older posts…</span>
    </div>
    <button
      v-else-if="hasMore"
      type="button"
      class="feed-pagination-sentinel__button"
      @click="triggerLoadMore"
    >
      <RefreshCw class="feed-pagination-sentinel__refresh-cw" />
      <span>Load older posts</span>
    </button>
    <div
      v-else
      class="feed-pagination-sentinel__block-2"
    >
      <CircleCheckBig class="feed-pagination-sentinel__circle-check-big" />
      <span>You're all caught up</span>
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {


@media (hover:hover) {
.feed-pagination-sentinel__button:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.feed-pagination-sentinel__button:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.feed-pagination-sentinel__button:hover {
  color: var(--color-white);
}
}

@layer gupt-components {
.feed-pagination-sentinel__block {
  display: flex;
}
.feed-pagination-sentinel__status {
  display: flex;
}
.feed-pagination-sentinel__block-2 {
  display: flex;
}
.feed-pagination-sentinel__button {
  display: inline-flex;
}
.feed-pagination-sentinel__refresh-cw {
  height: calc(var(--spacing) * 3.5);
}
.feed-pagination-sentinel__circle-check-big {
  height: calc(var(--spacing) * 3.5);
}
.feed-pagination-sentinel__loader-circle {
  height: calc(var(--spacing) * 4);
}
.feed-pagination-sentinel__button {
  min-height: 44px;
}
.feed-pagination-sentinel__refresh-cw {
  width: calc(var(--spacing) * 3.5);
}
.feed-pagination-sentinel__circle-check-big {
  width: calc(var(--spacing) * 3.5);
}
.feed-pagination-sentinel__loader-circle {
  width: calc(var(--spacing) * 4);
}
.feed-pagination-sentinel__loader-circle {
  animation: var(--animate-spin);
}
.feed-pagination-sentinel__button {
  cursor: pointer;
}
.feed-pagination-sentinel__block {
  flex-direction: column;
}
.feed-pagination-sentinel__block {
  align-items: center;
}
.feed-pagination-sentinel__status {
  align-items: center;
}
.feed-pagination-sentinel__button {
  align-items: center;
}
.feed-pagination-sentinel__block-2 {
  align-items: center;
}
.feed-pagination-sentinel__block {
  justify-content: center;
}
.feed-pagination-sentinel__status {
  gap: calc(var(--spacing) * 2);
}
.feed-pagination-sentinel__button {
  gap: calc(var(--spacing) * 2);
}
.feed-pagination-sentinel__block-2 {
  gap: calc(var(--spacing) * 2);
}
.feed-pagination-sentinel__button {
  border-radius: var(--radius-xl);
}
.feed-pagination-sentinel__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-pagination-sentinel__button {
  border-color: var(--ui-zinc-800);
}
.feed-pagination-sentinel__button {
  background-color: var(--ui-zinc-900);
}
.feed-pagination-sentinel__button {
  padding-inline: calc(var(--spacing) * 5);
}
.feed-pagination-sentinel__status {
  padding-block: calc(var(--spacing) * 3);
}
.feed-pagination-sentinel__block-2 {
  padding-block: calc(var(--spacing) * 4);
}
.feed-pagination-sentinel__block {
  padding-top: calc(var(--spacing) * 4);
}
.feed-pagination-sentinel__block {
  padding-bottom: calc(var(--spacing) * 6);
}
.feed-pagination-sentinel__status {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-pagination-sentinel__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-pagination-sentinel__block-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-pagination-sentinel__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-pagination-sentinel__loader-circle {
  color: var(--ui-zinc-300);
}
.feed-pagination-sentinel__button {
  color: var(--ui-zinc-300);
}
.feed-pagination-sentinel__status {
  color: var(--ui-zinc-400);
}
.feed-pagination-sentinel__refresh-cw {
  color: var(--ui-zinc-400);
}
.feed-pagination-sentinel__block-2 {
  color: var(--ui-zinc-500);
}
.feed-pagination-sentinel__circle-check-big {
  color: var(--ui-zinc-600);
}
.feed-pagination-sentinel__button {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.feed-pagination-sentinel__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-pagination-sentinel__block-2 {
  -webkit-user-select: none;
  user-select: none;
}
.feed-pagination-sentinel__button:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
[data-theme="light"] .feed-pagination-sentinel__loader-circle {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-pagination-sentinel__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-pagination-sentinel__status {
  color: var(--app-muted);
}
[data-theme="light"] .feed-pagination-sentinel__refresh-cw {
  color: var(--app-muted);
}
[data-theme="light"] .feed-pagination-sentinel__block-2 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-pagination-sentinel__circle-check-big {
  color: var(--app-text-soft);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.feed-pagination-sentinel__button {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 80%,transparent);
}
}
}
</style>
