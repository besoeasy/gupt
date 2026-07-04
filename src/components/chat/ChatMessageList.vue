<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { estimateMessageRowSize } from "@/lib/chatListUtils";

const props = defineProps({
  items: { type: Array, default: () => [] },
  /** Disable virtualization for tiny threads (keeps transitions crisp). */
  virtualizeThreshold: { type: Number, default: 60 },
  /** Extra reactive deps per row so v-memo invalidates when external state changes (e.g. media blobs). */
  itemMemoDeps: { type: Function, default: null },
});

const emit = defineEmits(["scroll", "layout-resize"]);

const parentRef = ref(null);
const useVirtual = computed(() => props.items.length >= props.virtualizeThreshold);

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: props.items.length,
    getScrollElement: () => parentRef.value,
    estimateSize: (index) => estimateMessageRowSize(props.items[index]),
    overscan: 12,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 0,
  })),
);

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems());
const totalHeight = computed(() => rowVirtualizer.value.getTotalSize());

watch(
  () => props.items.length,
  () => {
    rowVirtualizer.value.measure();
  },
);

// When media blob/progress state changes for any item, re-measure all rendered
// virtual rows so that height changes from pending→loaded media are reflected
// immediately, preventing absolutely-positioned rows from overlapping.
watch(
  () => {
    if (!props.itemMemoDeps || !useVirtual.value) return null;
    return props.items.map((item, i) => props.itemMemoDeps(item, i));
  },
  () => {
    if (!useVirtual.value) return;
    nextTick(() => {
      rowVirtualizer.value.measure();
    });
  },
  { deep: true },
);

watch(totalHeight, (height, prev) => {
  if (height > Number(prev || 0)) emit("layout-resize", height);
});

function handleScroll(event) {
  emit("scroll", event);
}

function setMeasureRef(el, virtualRow) {
  if (!el || !useVirtual.value) return;
  rowVirtualizer.value.measureElement(el);
  void virtualRow;
}

function rowMemoDeps(item, index) {
  const deps = [item, props.items[index - 1], props.items[index + 1]];
  if (props.itemMemoDeps) deps.push(...props.itemMemoDeps(item, index));
  return deps;
}

function remeasure() {
  rowVirtualizer.value.measure();
}

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
    class="flex-1 overflow-x-hidden overflow-y-auto px-3 py-5 sm:px-5 lg:px-8 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--app-primary)_8%,transparent),transparent_30rem),transparent]"
    @scroll="handleScroll"
  >
    <slot name="header" />

    <slot name="before-list" />

    <div v-if="!items.length" class="py-4">
      <slot name="empty" />
    </div>

    <!-- Full render for short threads -->
    <div v-else-if="!useVirtual" class="space-y-1">
      <TransitionGroup name="message-bubble" tag="div" class="space-y-1">
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

    <!-- Virtualized render for long threads -->
    <div v-else class="relative w-full" :style="{ height: `${totalHeight}px` }">
      <div
        v-for="virtualRow in virtualRows"
        :key="String(virtualRow.key)"
        :data-index="virtualRow.index"
        class="min-w-0 max-w-full absolute top-0 left-0 w-full"
        :style="{ transform: `translateY(${virtualRow.start}px)` }"
        :ref="(el) => setMeasureRef(el, virtualRow)"
        v-memo="[...rowMemoDeps(items[virtualRow.index], virtualRow.index), virtualRow.start]"
      >
        <slot
          name="item"
          :item="items[virtualRow.index]"
          :index="virtualRow.index"
          :prev-item="items[virtualRow.index - 1]"
          :next-item="items[virtualRow.index + 1]"
        />
      </div>
    </div>

    <slot name="footer" />
  </div>
</template>
