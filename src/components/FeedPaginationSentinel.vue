<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import { LoaderCircle, RefreshCw, CircleCheckBig } from "@lucide/vue";

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
  <div ref="sentinelEl" class="flex flex-col items-center justify-center pt-4 pb-6">
    <div
      v-if="isLoading"
      class="flex items-center gap-2 text-xs text-zinc-400 py-3"
      role="status"
    >
      <LoaderCircle class="h-4 w-4 animate-spin text-zinc-300" />
      <span>Loading older posts…</span>
    </div>
    <button
      v-else-if="hasMore"
      type="button"
      class="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-5 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95 cursor-pointer"
      @click="triggerLoadMore"
    >
      <RefreshCw class="h-3.5 w-3.5 text-zinc-400" />
      <span>Load older posts</span>
    </button>
    <div
      v-else
      class="flex items-center gap-2 text-xs text-zinc-500 py-4 select-none"
    >
      <CircleCheckBig class="h-3.5 w-3.5 text-zinc-600" />
      <span>You're all caught up</span>
    </div>
  </div>
</template>
