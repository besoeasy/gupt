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
  <div
    ref="parentRef"
    class="chat-message-list__block"
    @scroll="handleScroll"
  >
    <slot name="header" />

    <slot name="before-list" />

    <div v-if="!items.length" class="chat-message-list__block-2">
      <slot name="empty" />
    </div>

    <div v-else ref="containerRef">
      <TransitionGroup
        enter-active-class="chat-message-list__enter-active-class"
        enter-from-class="chat-message-list__enter-from-class"
        leave-active-class="chat-message-list__leave-active-class"
        leave-to-class="chat-message-list__leave-to-class"
        move-class="chat-message-list__move-class"
        tag="div"
      >
        <div
          v-for="(item, index) in items"
          :key="item.id"
          class="chat-message-list__block-3"
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
@layer base, gupt-components;

@layer gupt-components {
@media (min-width:40rem) {
.chat-message-list__block {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:64rem) {
.chat-message-list__block {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.chat-message-list__block-3 {
  max-width: 100%;
}
.chat-message-list__block-3 {
  min-width: 0;
}
.chat-message-list__block {
  flex: 1;
}
.chat-message-list__enter-from-class {
  --translate-y: calc(var(--spacing) * 2);
  translate: var(--translate-x,0) calc(var(--spacing) * 2);
}
.chat-message-list__block {
  overflow-x: hidden;
}
.chat-message-list__block {
  overflow-y: auto;
}
.chat-message-list__block {
  background-color: var(--app-bg);
}
.chat-message-list__block {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-message-list__block-2 {
  padding-block: calc(var(--spacing) * 4);
}
.chat-message-list__block {
  padding-block: calc(var(--spacing) * 5);
}
.chat-message-list__enter-from-class {
  opacity: 0;
}
.chat-message-list__leave-to-class {
  opacity: 0;
}
.chat-message-list__enter-active-class {
  transition-property: opacity,transform;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-list__leave-active-class {
  transition-property: opacity,transform;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-list__move-class {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-message-list__leave-active-class {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-message-list__enter-active-class {
  --duration: .2s;
  transition-duration: .2s;
}
.chat-message-list__move-class {
  --duration: .2s;
  transition-duration: .2s;
}
.chat-message-list__leave-active-class {
  --ease: var(--app-ease-in);
  transition-timing-function: var(--app-ease-in);
}
.chat-message-list__enter-active-class {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.chat-message-list__move-class {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
}
}
</style>
