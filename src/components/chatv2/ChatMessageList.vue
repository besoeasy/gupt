<script setup>
import { ref, watch, onBeforeUnmount } from "vue";

const props = defineProps({
  items: { type: Array, default: () => [] },
  itemMemoDeps: { type: Function, default: null },
});

const emit = defineEmits(["scroll", "layout-resize"]);

const parentRef = ref(null);
const containerRef = ref(null);

let containerObserver = null;

watch(containerRef, (el) => {
  if (containerObserver) {
    containerObserver.disconnect();
    containerObserver = null;
  }
  if (el) {
    let prevHeight = el.getBoundingClientRect().height;
    containerObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const h = entry.contentBoxSize?.[0]?.blockSize ?? entry.contentRect?.height ?? 0;
      if (Math.abs(h - prevHeight) < 1) return;
      prevHeight = h;
      emit("layout-resize", h);
    });
    containerObserver.observe(el);
  }
});

function handleScroll(event) {
  emit("scroll", event);
}

function rowMemoDeps(item, index) {
  const deps = [item, props.items[index - 1], props.items[index + 1]];
  if (props.itemMemoDeps) deps.push(...props.itemMemoDeps(item, index));
  return deps;
}

function remeasure() {
  const el = containerRef.value;
  if (el) emit("layout-resize", el.getBoundingClientRect().height);
}

onBeforeUnmount(() => {
  if (containerObserver) {
    containerObserver.disconnect();
    containerObserver = null;
  }
});

defineExpose({
  parentRef,
  remeasure,
  scrollToBottom: (behavior = "auto") => {
    const el = parentRef.value;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  },
});
</script>

<template>
  <div
    ref="parentRef"
    class="flex-1 overflow-x-hidden overflow-y-auto px-3 py-5 sm:px-5 lg:px-8 bg-(--app-bg)"
    @scroll="handleScroll"
  >
    <slot name="header" />

    <slot name="before-list" />

    <div v-if="!items.length" class="py-4">
      <slot name="empty" />
    </div>

    <div v-else ref="containerRef">
      <TransitionGroup
        enter-active-class="transition-all duration-[140ms] ease-[var(--app-ease-swift)]"
        enter-from-class="opacity-0 translate-y-1.5 scale-95"
        move-class="transition-transform duration-[200ms] ease-[var(--app-ease-swift)]"
        tag="div"
      >
        <div
          v-for="(item, index) in items"
          :key="item.id"
          class="min-w-0 max-w-full"
          v-memo="rowMemoDeps(item, index)"
        >
          <slot
            name="item"
            :item="item"
            :index="index"
            :prev-item="items[index - 1]"
            :next-item="items[index + 1]"
          />
        </div>
      </TransitionGroup>
    </div>

    <slot name="footer" />
  </div>
</template>
