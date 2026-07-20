import { nextTick, ref } from "vue";

const BOTTOM_THRESHOLD_PX = 150;

export function useChatScroll(getContainer) {
  const isNearBottom = ref(true);
  const unseenCount = ref(0);

  function getEl() {
    const source = typeof getContainer === "function" ? getContainer() : getContainer?.value;
    return source || null;
  }

  function distanceFromBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }

  function updateNearBottom() {
    const el = getEl();
    if (!el) {
      isNearBottom.value = true;
      return;
    }
    isNearBottom.value = distanceFromBottom(el) <= BOTTOM_THRESHOLD_PX;
    if (isNearBottom.value) unseenCount.value = 0;
  }

  function scrollToBottom(behavior = "auto") {
    const el = getEl();
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottom.value = true;
    unseenCount.value = 0;
  }

  function scrollToBottomAfterLayout(behavior = "auto") {
    nextTick(() => {
      requestAnimationFrame(() => {
        scrollToBottom(behavior);
      });
    });
  }

  function settleAtBottom(behavior = "auto") {
    scrollToBottomAfterLayout(behavior);
    setTimeout(() => {
      if (isNearBottom.value) scrollToBottom(behavior);
    }, 300);
  }

  function onMessagesUpdated(newRows, oldRows = [], options = {}) {
    const { loadingOlder = false } = options;
    if (loadingOlder) return;

    const nextLast = newRows.at(-1);
    const prevLast = oldRows.at(-1);

    if (!oldRows.length && newRows.length) {
      settleAtBottom();
      return;
    }

    if (!nextLast?.id || nextLast.id === prevLast?.id) return;

    const wasNearBottom = isNearBottom.value;
    const isOwnMessage = Boolean(
      nextLast.mine ?? (options.selfPubkey && nextLast.sender === options.selfPubkey),
    );

    if (wasNearBottom || isOwnMessage) {
      scrollToBottomAfterLayout();
    } else {
      unseenCount.value += 1;
    }
  }

  function onLayoutResize() {
    if (isNearBottom.value) scrollToBottom("auto");
  }

  function captureScrollHeight() {
    const el = getEl();
    return el ? el.scrollHeight : 0;
  }

  function restoreScrollAfterPrepend(prevScrollHeight) {
    const el = getEl();
    if (!el || !prevScrollHeight) return;
    const delta = el.scrollHeight - prevScrollHeight;
    if (delta > 0) el.scrollTop += delta;
  }

  return {
    isNearBottom,
    unseenCount,
    onScroll: updateNearBottom,
    scrollToBottom,
    scrollToBottomAfterLayout,
    onMessagesUpdated,
    onLayoutResize,
    settleAtBottom,
    captureScrollHeight,
    restoreScrollAfterPrepend,
  };
}
