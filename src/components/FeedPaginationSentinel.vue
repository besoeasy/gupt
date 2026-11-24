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
  <div ref="sentinelEl" class="feed-end">
    <div v-if="isLoading" class="feed-end__status" role="status">
      <LoaderCircle class="feed-end__icon feed-end__icon--spin" :stroke-width="2" aria-hidden="true" />
      <span>Loading older posts…</span>
    </div>

    <button v-else-if="hasMore" type="button" class="feed-end__btn" @click="triggerLoadMore">
      <RefreshCw class="feed-end__icon" :stroke-width="1.9" aria-hidden="true" />
      <span>Load older posts</span>
    </button>

    <div v-else class="feed-end__status">
      <CircleCheckBig class="feed-end__icon feed-end__icon--done" :stroke-width="1.8" aria-hidden="true" />
      <span>You're all caught up</span>
    </div>
  </div>
</template>

<style scoped>
/* Ledger pass: the end of the feed is a quiet mono footnote. */

.feed-end {
  display: flex;
  justify-content: center;
  padding: var(--app-space-5) var(--app-space-4);
}

.feed-end__status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.feed-end__btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding-inline: 13px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.feed-end__btn:active {
  transform: translateY(1px);
}

.feed-end__btn:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

.feed-end__icon {
  width: 12px;
  height: 12px;
}

.feed-end__icon--spin {
  animation: spin 1s linear infinite;
}

.feed-end__icon--done {
  color: var(--app-success);
}

@media (hover: hover) {
  .feed-end__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .feed-end__btn {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .feed-end__btn {
    transition: none;
  }
}
</style>
