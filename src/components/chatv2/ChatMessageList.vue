<script setup>
import { ref, watch, onBeforeUnmount } from "vue";

const props = defineProps({
  items: { type: Array, default: () => [] },
  itemMemoDeps: { type: Function, default: null },
});

const emit = defineEmits(["scroll", "layout-resize", "reach-top"]);

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
  const el = event?.target;
  if (el && el.scrollTop < 80) {
    emit("reach-top");
  }
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
  <div ref="parentRef" class="msg-list" @scroll="handleScroll">
    <slot name="header" />

    <slot name="before-list" />

    <div v-if="!items.length" class="msg-list__empty">
      <slot name="empty" />
    </div>

    <div v-else ref="containerRef">
      <TransitionGroup
        enter-active-class="msg-enter-active"
        enter-from-class="msg-enter-from"
        leave-active-class="msg-leave-active"
        leave-to-class="msg-leave-to"
        move-class="msg-move"
        tag="div"
      >
        <div
          v-for="(item, index) in items"
          :key="item.id"
          class="msg-list__row"
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

<style scoped>
/* Ledger pass: the transcript column owns no chrome, only spacing. */

.msg-list {
  flex: 1;
  padding: var(--app-space-5) var(--app-space-3);
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--app-bg);
}

.msg-list__empty {
  padding-block: var(--app-space-4);
}

.msg-list__row {
  min-width: 0;
  max-width: 100%;
}

.msg-enter-active {
  transition:
    opacity 220ms var(--app-ease-swift),
    transform 220ms var(--app-ease-swift);
}

.msg-leave-active {
  transition:
    opacity 150ms var(--app-ease-in),
    transform 150ms var(--app-ease-in);
}

.msg-move {
  transition: transform 200ms var(--app-ease-swift);
}

.msg-enter-from,
.msg-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (min-width: 40rem) {
  .msg-list {
    padding-inline: var(--app-space-5);
  }
}

@media (min-width: 64rem) {
  .msg-list {
    padding-inline: var(--app-space-8);
  }
}

@media (prefers-reduced-motion: reduce) {
  .msg-enter-active,
  .msg-leave-active,
  .msg-move {
    transition: none;
  }
}
</style>
